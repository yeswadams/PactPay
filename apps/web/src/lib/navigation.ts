import type { SessionData } from "./domain";
export type NavigationItem = {
  label: string;
  href: string;
  icon: string;
  group: string;
};
export function navigationFor(session: SessionData): NavigationItem[] {
  const role = session.organization?.role;
  const scopes = session.scopes;
  const items: NavigationItem[] = [
    { label: "Overview", href: "/app", icon: "overview", group: "Workspace" },
  ];
  if (role === "investor")
    items.push(
      {
        label: "Marketplace",
        href: "/app/marketplace",
        icon: "marketplace",
        group: "Workspace",
      },
      {
        label: "My investments",
        href: "/app/investments",
        icon: "investments",
        group: "Workspace",
      },
    );
  items.push({
    label: "Transactions",
    href: "/app/transactions",
    icon: "transactions",
    group: "Workspace",
  });
  if (role === "sme")
    items.push(
      {
        label: "My invoices",
        href: "/app/invoices",
        icon: "invoices",
        group: "SME financing",
      },
      {
        label: "Submit invoice",
        href: "/app/invoices/new",
        icon: "submit",
        group: "SME financing",
      },
      {
        label: "Funding requests",
        href: "/app/funding",
        icon: "funding",
        group: "SME financing",
      },
      {
        label: "Repayments",
        href: "/app/repayments",
        icon: "repayments",
        group: "SME financing",
      },
    );
  if (scopes.includes("verifier"))
    items.push({
      label: "Verification queue",
      href: "/app/admin/verification",
      icon: "verification",
      group: "Administration",
    });
  if (scopes.includes("verifier") || scopes.includes("lister"))
    items.push({
      label: "Financing approvals",
      href: "/app/admin/approvals",
      icon: "approvals",
      group: "Administration",
    });
  if (scopes.includes("settler"))
    items.push({
      label: "Settlement operations",
      href: "/app/admin/settlements",
      icon: "settlement",
      group: "Administration",
    });
  if (scopes.includes("auditor") || scopes.includes("administrator"))
    items.push({
      label: "Audit logs",
      href: "/app/admin/audit",
      icon: "audit",
      group: "Administration",
    });
  items.push(
    {
      label: "Organization",
      href: "/app/organization",
      icon: "organization",
      group: "Account",
    },
    {
      label: "Wallet & network",
      href: "/app/wallet",
      icon: "wallet",
      group: "Account",
    },
    {
      label: "Settings",
      href: "/app/settings",
      icon: "settings",
      group: "Account",
    },
    {
      label: "Help & support",
      href: "/app/help",
      icon: "help",
      group: "Account",
    },
  );
  return items;
}
