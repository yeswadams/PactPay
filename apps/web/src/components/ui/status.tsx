import { cn } from "@/lib/utils";
const labels: Record<string, string> = {
  NONE: "Not listed",
  APPROVED: "Terms approved",
  OPEN: "Funding open",
  FUNDED: "Fully funded",
  DISBURSED: "Disbursed",
  OVERDUE: "Overdue",
  REPAID: "Ready to claim",
  SETTLED: "Settled",
  EXPIRED: "Refundable",
  draft: "Draft",
  submitted: "In review",
  needs_information: "Information needed",
  confirmed: "Verified",
  rejected: "Rejected",
  PENDING: "Pending verification",
  DEPOSITED: "Deposited",
  PREPARED: "Awaiting deposit",
};
export function StatusBadge({ status }: { status: string }) {
  const value = status.toLowerCase();
  const tone = [
    "confirmed",
    "approved",
    "repaid",
    "settled",
    "deposited",
  ].includes(value)
    ? "success"
    : ["rejected", "overdue"].includes(value)
      ? "danger"
      : [
            "submitted",
            "pending",
            "needs_information",
            "prepared",
            "expired",
          ].includes(value)
        ? "warning"
        : "neutral";
  return (
    <span className={cn("status-badge", `status-${tone}`)}>
      <span aria-hidden="true" />
      {labels[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
