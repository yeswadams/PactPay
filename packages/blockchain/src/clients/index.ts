import {
  createPublicClient,
  http,
  decodeEventLog,
  type Hash,
  type PublicClient,
  type Address,
  getAddress,
} from "viem";
import { financingAbi } from "../abi/index.ts";
import { configuredChain, type NetworkConfig } from "../config/index.ts";

export function protocolClient(config: NetworkConfig) {
  return createPublicClient({
    chain: configuredChain(config),
    transport: http(config.rpcUrl, { retryCount: 3 }),
  });
}
export async function assertDeployment(
  client: PublicClient,
  config: NetworkConfig,
) {
  if ((await client.getChainId()) !== config.deployment.chainId)
    throw new Error("RPC chain mismatch");
  const code = await client.getCode({ address: config.deployment.financing });
  if (!code || code === "0x")
    throw new Error(
      "Financing contract not deployed; deploy locally and restart the app",
    );
  const version = await client.readContract({
    address: config.deployment.financing,
    abi: financingAbi,
    functionName: "VERSION",
  });
  if (version !== config.deployment.version)
    throw new Error("Contract version mismatch");
  const decimals = await client.readContract({
    address: config.deployment.financing,
    abi: financingAbi,
    functionName: "tokenDecimals",
    args: [config.deployment.token],
  });
  if (decimals !== config.deployment.tokenDecimals)
    throw new Error("Settlement token decimals mismatch");
}
export async function finalizedBlock(
  client: PublicClient,
  confirmations: number,
): Promise<bigint> {
  const tip = await client.getBlockNumber({ cacheTime: 0 });
  return tip >= BigInt(confirmations - 1)
    ? tip - BigInt(confirmations - 1)
    : 0n;
}
/** A submitted hash is only a hint: receipt, canonical block and known logs must all agree. */
export async function verifyProtocolTransaction(
  client: PublicClient,
  config: NetworkConfig,
  hash: Hash,
  expectedSender?: Address,
) {
  await assertDeployment(client, config);
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  if (receipt.to?.toLowerCase() !== config.deployment.financing.toLowerCase())
    throw new Error("Transaction targets another contract");
  if (expectedSender && getAddress(receipt.from) !== getAddress(expectedSender))
    throw new Error("Transaction sender mismatch");
  if (
    receipt.blockNumber > (await finalizedBlock(client, config.confirmations))
  )
    throw new Error("Transaction is not sufficiently confirmed");
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash)
    throw new Error("Receipt is not canonical");
  const events = receipt.logs
    .filter(
      (log) =>
        log.address.toLowerCase() === config.deployment.financing.toLowerCase(),
    )
    .flatMap((log) => {
      try {
        return [
          {
            ...decodeEventLog({
              abi: financingAbi,
              data: log.data,
              topics: log.topics,
              strict: true,
            }),
            logIndex: log.logIndex,
          },
        ];
      } catch {
        return [];
      }
    });
  if (!events.length)
    throw new Error("Receipt contains no known protocol event");
  return { receipt, events };
}
