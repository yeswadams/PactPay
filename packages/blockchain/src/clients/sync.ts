import { type Address, type Hash } from "viem";
import {
  connectDatabase,
  contractDeployments,
  blockchainEvents,
  blockchainTransactions,
  blockchainEventCheckpoints,
  invoiceOnchainRecords,
  investorPositions,
  settlementReconciliations,
  invoices,
  auditLogs,
  eq,
  and,
  sqlExpression,
} from "@pactpay/database";
import { financingAbi } from "../abi/index.ts";
import { assertDeployment, finalizedBlock, protocolClient } from "./index.ts";
import type { NetworkConfig } from "../config/index.ts";

export const toJson = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
export const deploymentId = (config: NetworkConfig) =>
  `${config.deployment.chainId}:${config.deployment.financing.toLowerCase()}`;

/** Atomic, independently executable, finality-lagged projection worker. RPC failure commits nothing. */
export async function syncProtocol(
  config: NetworkConfig,
  db: ReturnType<typeof connectDatabase>["db"],
) {
  const client = protocolClient(config);
  await assertDeployment(client, config);
  const key = deploymentId(config);
  const final = await finalizedBlock(client, config.confirmations);
  const start = BigInt(config.deployment.deploymentBlock);
  if (final < start) throw new Error("Deployment not yet finalized");
  let chunks = 0;
  let done = false;
  while (!done) {
    await db.transaction(async (tx) => {
      // Serialize sync writers across processes; readers see only committed projections.
      await tx.execute(
        sqlExpression`select pg_advisory_xact_lock(hashtext(${key}))`,
      );
      await tx
        .insert(contractDeployments)
        .values({
          id: key,
          chainId: config.deployment.chainId,
          address: config.deployment.financing.toLowerCase(),
          manifest: config.deployment,
        })
        .onConflictDoNothing();
      let [checkpoint] = await tx
        .select()
        .from(blockchainEventCheckpoints)
        .where(eq(blockchainEventCheckpoints.id, key));
      if (checkpoint) {
        let canonicalHash: string | null = null;
        if (
          BigInt(checkpoint.blockNumber) <=
          (await client.getBlockNumber({ cacheTime: 0 }))
        ) {
          canonicalHash = (
            await client.getBlock({
              blockNumber: BigInt(checkpoint.blockNumber),
            })
          ).hash;
        }
        if (
          canonicalHash !== checkpoint.blockHash ||
          BigInt(checkpoint.blockNumber) > final
        ) {
          await tx
            .delete(investorPositions)
            .where(
              sqlExpression`${investorPositions.recordId} in (select id from invoice_onchain_records where deployment_id = ${key})`,
            );
          await tx
            .delete(invoiceOnchainRecords)
            .where(eq(invoiceOnchainRecords.deploymentId, key));
          await tx
            .delete(blockchainEvents)
            .where(eq(blockchainEvents.deploymentId, key));
          await tx
            .delete(blockchainTransactions)
            .where(eq(blockchainTransactions.deploymentId, key));
          await tx
            .update(settlementReconciliations)
            .set({ status: "PREPARED", transactionHash: null })
            .where(eq(settlementReconciliations.deploymentId, key));
          await tx
            .delete(blockchainEventCheckpoints)
            .where(eq(blockchainEventCheckpoints.id, key));
          await tx
            .insert(auditLogs)
            .values({
              actor: "sync",
              action: "CONFIRMED_REORG_REBUILD",
              subject: key,
              details: {
                previousBlock: checkpoint.blockNumber,
                previousHash: checkpoint.blockHash,
              },
            });
          checkpoint = undefined!;
        }
      }
      const from = checkpoint ? BigInt(checkpoint.blockNumber) + 1n : start;
      const to = from + 999n < final ? from + 999n : final;
      const block = await client.getBlock({ blockNumber: to });
      if (!block.hash) throw new Error("Finalized block hash unavailable");
      const logs =
        from <= to
          ? await client.getContractEvents({
              address: config.deployment.financing,
              abi: financingAbi,
              fromBlock: from,
              toBlock: to,
              strict: true,
            })
          : [];
      const existing = await tx
        .select()
        .from(invoiceOnchainRecords)
        .where(eq(invoiceOnchainRecords.deploymentId, key));
      const ids = new Set<Hash>(existing.map((row) => row.commitment as Hash));
      const actors = new Map<Hash, Set<Address>>();
      for (const log of logs) {
        const args = log.args as { invoiceId?: Hash; investor?: Address };
        if (args.invoiceId) {
          ids.add(args.invoiceId);
          if (args.investor) {
            if (!actors.has(args.invoiceId))
              actors.set(args.invoiceId, new Set());
            actors.get(args.invoiceId)!.add(args.investor);
          }
        }
      }
      for (const id of ids) {
        const recordId = `${key}:${id}`;
        const snapshot = await client.readContract({
          address: config.deployment.financing,
          abi: financingAbi,
          functionName: "getListing",
          args: [id],
          blockNumber: to,
        });
        const state = await client.readContract({
          address: config.deployment.financing,
          abi: financingAbi,
          functionName: "effectiveState",
          args: [id],
          blockNumber: to,
        });
        const value = {
          id: recordId,
          deploymentId: key,
          commitment: id,
          state,
          snapshot: toJson(snapshot),
          blockNumber: to.toString(),
          blockHash: block.hash,
        };
        await tx
          .insert(invoiceOnchainRecords)
          .values(value)
          .onConflictDoUpdate({ target: invoiceOnchainRecords.id, set: value });
        const previous = await tx
          .select()
          .from(investorPositions)
          .where(eq(investorPositions.recordId, recordId));
        const investors = new Set<Address>([
          ...(actors.get(id) ?? []),
          ...previous.map((p) => p.wallet as Address),
        ]);
        for (const investor of investors) {
          const [contribution, refunded, claimed] = await client.readContract({
            address: config.deployment.financing,
            abi: financingAbi,
            functionName: "positions",
            args: [id, investor],
            blockNumber: to,
          });
          const claimable = await client.readContract({
            address: config.deployment.financing,
            abi: financingAbi,
            functionName: "claimable",
            args: [id, investor],
            blockNumber: to,
          });
          const position = {
            id: `${recordId}:${investor.toLowerCase()}`,
            recordId,
            wallet: investor.toLowerCase(),
            contribution: contribution.toString(),
            refunded,
            claimed,
            claimable: claimable.toString(),
          };
          await tx
            .insert(investorPositions)
            .values(position)
            .onConflictDoUpdate({
              target: investorPositions.id,
              set: position,
            });
        }
      }
      const seenTransactions = new Set<string>();
      for (const log of logs) {
        if (
          log.blockNumber == null ||
          !log.blockHash ||
          !log.transactionHash ||
          log.logIndex == null
        )
          throw new Error("Incomplete RPC log");
        await tx
          .insert(blockchainEvents)
          .values({
            id: `${key}:${log.transactionHash}:${log.logIndex}`,
            deploymentId: key,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
            blockNumber: log.blockNumber.toString(),
            blockHash: log.blockHash,
            name: log.eventName,
            args: toJson(log.args),
          })
          .onConflictDoNothing();
        if (!seenTransactions.has(log.transactionHash)) {
          const receipt = await client.getTransactionReceipt({
            hash: log.transactionHash,
          });
          if (
            receipt.status !== "success" ||
            receipt.blockHash !== log.blockHash
          )
            throw new Error("Noncanonical event receipt");
          await tx
            .insert(blockchainTransactions)
            .values({
              id: `${key}:${log.transactionHash}`,
              deploymentId: key,
              hash: log.transactionHash,
              blockNumber: log.blockNumber.toString(),
              blockHash: log.blockHash,
              status: "CONFIRMED",
              sender: receipt.from.toLowerCase(),
            })
            .onConflictDoNothing();
          seenTransactions.add(log.transactionHash);
        }
        if (log.eventName === "RepaymentDeposited") {
          const args = log.args;
          const matchingInvoices = await tx
            .select({ id: invoices.id })
            .from(invoices)
            .where(eq(invoices.commitment, args.invoiceId));
          for (const invoice of matchingInvoices) {
            await tx
              .update(settlementReconciliations)
              .set({
                status: "DEPOSITED",
                transactionHash: log.transactionHash,
              })
              .where(
                and(
                  eq(settlementReconciliations.invoiceId, invoice.id),
                  eq(settlementReconciliations.deploymentId, key),
                  eq(
                    settlementReconciliations.evidenceCommitment,
                    args.evidenceCommitment,
                  ),
                  eq(settlementReconciliations.amount, args.amount.toString()),
                ),
              );
          }
        }
      }
      // A reorg while processing must abort this entire transaction.
      if ((await client.getBlock({ blockNumber: to })).hash !== block.hash)
        throw new Error("Chain changed during sync; retry");
      await tx
        .insert(blockchainEventCheckpoints)
        .values({ id: key, blockNumber: to.toString(), blockHash: block.hash })
        .onConflictDoUpdate({
          target: blockchainEventCheckpoints.id,
          set: { blockNumber: to.toString(), blockHash: block.hash },
        });
      done = to >= final;
      chunks++;
    });
  }
  return { deployment: key, finalizedBlock: final.toString(), chunks };
}
