import { z } from "zod";
import { getAddress, isAddress } from "viem";
export const evmAddress = z
  .string()
  .refine(isAddress)
  .transform((value) => getAddress(value));
export const transactionHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const baseUnits = z
  .string()
  .regex(/^(0|[1-9]\d{0,77})$/)
  .refine((value) => BigInt(value) <= (1n << 256n) - 1n);
export function parseAmount(value: string, decimals: number): string {
  if (!new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${decimals}})?$`).test(value))
    throw new Error(`Use up to ${decimals} decimal places`);
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"))
  ).toString();
}
export function formatAmount(
  value: string | number | bigint,
  decimals = 6,
  symbol = "MOCK",
) {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = (absolute / scale).toLocaleString("en-KE");
  const fraction = (absolute % scale).toString().padStart(decimals, "0");
  const digits = symbol === "KES" ? fraction : fraction.replace(/0+$/, "");
  return `${negative ? "−" : ""}${symbol} ${whole}${digits ? `.${digits}` : ""}`;
}
export const formatKes = (value: string | number | bigint) =>
  formatAmount(value, 2, "KES");
export function formatDate(value?: string | number | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-KE", {
        dateStyle: "medium",
        timeZone: "Africa/Nairobi",
      }).format(date);
}
export const shortAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
export const offerSchema = z
  .object({
    token: evmAddress,
    beneficiary: evmAddress,
    treasury: evmAddress,
    target: baseUnits.refine((v) => BigInt(v) > 0n),
    repayment: baseUnits,
    fee: baseUnits,
    fundingDeadline: baseUnits,
    maturity: baseUnits,
  })
  .strict()
  .superRefine((terms, ctx) => {
    if (
      BigInt(terms.repayment) < BigInt(terms.target) ||
      BigInt(terms.fee) > BigInt(terms.repayment) - BigInt(terms.target)
    )
      ctx.addIssue({
        code: "custom",
        message: "Repayment must cover principal and the fixed fee",
      });
    if (
      BigInt(terms.maturity) <= BigInt(terms.fundingDeadline) ||
      BigInt(terms.maturity) >= 1n << 64n
    )
      ctx.addIssue({
        code: "custom",
        message: "Maturity must follow the funding deadline",
      });
  });
export const onboardingSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.email().max(200),
    organizationName: z.string().trim().min(2).max(160),
    kind: z.enum(["sme", "investor"]),
    registrationNumber: z.string().trim().max(100).default(""),
    contactPhone: z.string().trim().max(60).default(""),
    discloseName: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.kind !== "sme" || v.registrationNumber.length >= 3, {
    path: ["registrationNumber"],
    message: "Enter your business registration reference",
  });
export const invoiceInputSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1).max(64),
    customerName: z.string().trim().min(2).max(160),
    customerEmail: z.union([z.email(), z.literal("")]).default(""),
    customerContact: z.string().trim().max(120).default(""),
    description: z.string().trim().min(10).max(2000),
    faceValueCents: baseUnits.refine(
      (v) => BigInt(v) > 0n && BigInt(v) <= 2_000_000_000n,
    ),
    advanceCents: baseUnits.refine(
      (v) => BigInt(v) > 0n && BigInt(v) <= 2_000_000_000n,
    ),
    dueDate: z.iso.date(),
    idempotencyKey: z.uuid(),
  })
  .strict()
  .refine((v) => BigInt(v.advanceCents) < BigInt(v.faceValueCents), {
    path: ["advanceCents"],
    message: "Requested advance must be below invoice face value",
  });
export type OperatorScope =
  "verifier" | "lister" | "settler" | "auditor" | "administrator";
export type Membership = {
  isOwner: boolean;
  id: string;
  name: string;
  kind: string;
  role: string;
  verificationStatus: string;
  eligibilityStatus: string;
  contactEmail: string | null;
  contactPhone: string | null;
  registrationNumber: string;
  discloseName: boolean;
};
export type SessionData = {
  user: {
    id: string;
    name: string;
    email: string | null;
    walletAddress: string;
    onboarded: boolean;
    timezone: string;
  };
  organizations: Membership[];
  organization: Membership | null;
  scopes: OperatorScope[];
  expiresAt: string;
};
