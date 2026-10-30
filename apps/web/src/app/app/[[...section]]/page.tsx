import { Suspense } from "react";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Plus, ShieldCheck, FileText, Wallet } from "lucide-react";
import {
  requireActor,
  sessionData,
  requireOrganization,
  requireScope,
} from "@/server/application/auth";
import { pageData } from "@/server/application/page-data";
import { dashboard } from "@/server/application/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Overview } from "@/features/dashboard/overview";
import { InvoiceSubmissionForm } from "@/features/invoices/submission-form";
import { InvoiceDetailView } from "@/features/invoices/detail";
import { InvoiceList } from "@/features/invoices/invoice-list";
import { Marketplace } from "@/features/marketplace/catalog";
import { OpportunityDetail } from "@/features/marketplace/detail";
import { Portfolio } from "@/features/investments/portfolio";
import {
  Transactions,
  type TransactionPage,
} from "@/features/dashboard/transactions";
import { FinancingApprovals } from "@/features/admin/financing-approvals";
import {
  SettlementOperations,
  type Reconciliations,
} from "@/features/admin/settlements";
import { EligibilityQueue } from "@/features/admin/eligibility";
import { AuditLog, type AuditPage } from "@/features/admin/audit";
import {
  OrganizationProfile,
  AccountSettings,
} from "@/features/account/organization";
import { WalletControl } from "@/features/auth/wallet-control";
import { AppError } from "@/server/application/http";
import type { InvoicePage, InvoiceDetail } from "@/server/application/invoices";
import type {
  MarketplacePage,
  FinancingDetail,
  PortfolioPage,
} from "@/server/application/financing";
type Props = {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
function PageFrame({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} action={action} />
      {children}
    </>
  );
}
async function resolvePage({ params, searchParams }: Props) {
  const actor = await requireActor();
  const session = sessionData(actor);
  const section = (await params).section ?? [];
  const route = section.join("/");
  const source = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(source))
    if (typeof value === "string") query.set(key, value);
  if (!route) {
    const data = await dashboard(actor);
    return (
      <PageFrame
        title={
          actor.organization?.role === "sme"
            ? "Your business at a glance"
            : actor.organization?.role === "investor"
              ? "Your investment overview"
              : "Operations overview"
        }
        description={`Welcome back, ${actor.user.name.split(" ")[0]}. Here is the latest activity in your workspace.`}
        action={
          actor.organization?.role === "sme" ? (
            <Button asChild>
              <Link href="/app/invoices/new">
                <Plus size={15} />
                Submit invoice
              </Link>
            </Button>
          ) : undefined
        }
      >
        <Overview data={data} />
      </PageFrame>
    );
  }
  if (route === "invoices/new") {
    requireOrganization(actor, "sme");
    return (
      <PageFrame
        title="Submit an invoice"
        description="Request financing against an unpaid invoice, with private supporting evidence."
      >
        <InvoiceSubmissionForm />
      </PageFrame>
    );
  }
  if (["invoices", "funding", "repayments"].includes(route)) {
    requireOrganization(actor, "sme");
    const data = await pageData<InvoicePage>(`invoices?${query}`);
    return (
      <PageFrame
        title={
          route === "invoices"
            ? "My invoices"
            : route === "funding"
              ? "Funding requests"
              : "Repayments"
        }
        description={
          route === "repayments"
            ? "Follow customer due dates and confirmed contract repayment state."
            : "Follow your organization’s invoices from draft through human review and financing."
        }
      >
        <InvoiceList
          initial={data}
          mode={route as "invoices" | "funding" | "repayments"}
        />
      </PageFrame>
    );
  }
  if (section[0] === "invoices" && section.length === 2) {
    const data = await pageData<InvoiceDetail>(`invoices/${section[1]}`);
    return (
      <PageFrame
        title={`Invoice ${data.invoice.invoiceNumber}`}
        description="Private invoice details, evidence and human verification history."
      >
        <InvoiceDetailView initial={data} />
      </PageFrame>
    );
  }
  if (route === "marketplace") {
    requireOrganization(actor, "investor");
    return (
      <PageFrame
        title="Financing marketplace"
        description="Explore human-verified opportunities with transparent contractual terms."
      >
        <Marketplace
          initial={await pageData<MarketplacePage>(`listings?${query}`)}
        />
      </PageFrame>
    );
  }
  if (section[0] === "marketplace" && section.length === 2) {
    requireOrganization(actor, "investor");
    const data = await pageData<FinancingDetail>(`listings/${section[1]}`);
    return (
      <PageFrame
        title={data.reference}
        description="Review financing terms, verified activity and your participation before funding."
      >
        <OpportunityDetail initial={data} />
      </PageFrame>
    );
  }
  if (route === "investments") {
    requireOrganization(actor, "investor");
    return (
      <PageFrame
        title="My investments"
        description="Your confirmed positions, available claims and realized distributions."
      >
        <Portfolio
          initial={await pageData<PortfolioPage>(`investments?${query}`)}
        />
      </PageFrame>
    );
  }
  if (route === "transactions")
    return (
      <PageFrame
        title="Transactions"
        description="Follow wallet submissions and independently verified contract activity."
      >
        <Transactions
          initial={await pageData<TransactionPage>(`transactions?${query}`)}
        />
      </PageFrame>
    );
  if (route === "admin/verification") {
    requireScope(actor, "verifier");
    if (!query.has("status")) query.set("status", "submitted");
    return (
      <PageFrame
        title="Verification queue"
        description="Review invoice evidence, request clarification and record reasoned decisions."
      >
        <div className="stack">
          <InvoiceList
            initial={await pageData<InvoicePage>(`admin/invoices?${query}`)}
            operator
          />
          <EligibilityQueue />
        </div>
      </PageFrame>
    );
  }
  if (route === "admin/approvals") {
    requireScope(actor, "verifier", "lister");
    return (
      <PageFrame
        title="Financing approvals"
        description="Prepare immutable terms, authorize listings and disburse fully funded offers."
      >
        <FinancingApprovals
          initial={await pageData<InvoicePage>(
            "admin/invoices?status=confirmed&pageSize=50",
          )}
        />
      </PageFrame>
    );
  }
  if (route === "admin/settlements") {
    requireScope(actor, "settler");
    const [invoices, records] = await Promise.all([
      pageData<InvoicePage>("admin/invoices?status=confirmed&pageSize=50"),
      pageData<Reconciliations>("settlements?pageSize=50"),
    ]);
    return (
      <PageFrame
        title="Settlement operations"
        description="Reconcile off-chain collection evidence and deposit exact full repayments."
      >
        <SettlementOperations
          initialInvoices={invoices}
          initialRecords={records}
        />
      </PageFrame>
    );
  }
  if (route === "admin/audit") {
    requireScope(actor, "auditor", "administrator");
    return (
      <PageFrame
        title="Audit logs"
        description="Trace sensitive actions, the responsible actor and affected resources."
      >
        <AuditLog initial={await pageData<AuditPage>(`admin/audit?${query}`)} />
      </PageFrame>
    );
  }
  if (route === "organization")
    return (
      <PageFrame
        title="Organization"
        description="Manage your business profile, disclosure preferences and wallet memberships."
      >
        <OrganizationProfile initial={session} />
      </PageFrame>
    );
  if (route === "settings")
    return (
      <PageFrame
        title="Account settings"
        description="Your wallet-authenticated account and workspace preferences."
      >
        <AccountSettings initial={session} />
      </PageFrame>
    );
  if (route === "wallet")
    return (
      <PageFrame
        title="Wallet & network"
        description="Check your authenticated wallet, settlement-token balance and active network."
      >
        <section className="panel" style={{ maxWidth: 600 }}>
          <WalletControl expanded />
        </section>
      </PageFrame>
    );
  if (route === "help")
    return (
      <PageFrame
        title="Help & support"
        description="Understand the steps, risks and controls in your financing workspace."
      >
        <div className="stack">
          <section className="panel stack">
            <div className="callout-icon">
              <FileText size={21} />
              <div>
                <h2>Submitting and verifying invoices</h2>
                <p>
                  Create an SME organization, upload a valid private PDF or
                  image, then submit for review. A verifier may request
                  information, reject or approve the invoice. KES values stay
                  separate from token settlement terms.
                </p>
              </div>
            </div>
            <div className="callout-icon">
              <Wallet size={21} />
              <div>
                <h2>Funding, confirmations and claims</h2>
                <p>
                  Approved investors review contractual terms, approve exact
                  token spending, then fund in a separate transaction. Wait for
                  confirmation and backend synchronization. Refunds become
                  available after unsuccessful funding or undisbursed maturity;
                  repayment claims require a full authorized deposit.
                </p>
              </div>
            </div>
            <div className="callout-icon">
              <ShieldCheck size={21} />
              <div>
                <h2>Verification and repayment risks</h2>
                <p>
                  Invoice authenticity, payment collection and legal
                  enforceability rely on people and off-chain processes. Returns
                  are not guaranteed. MOCK tokens have no monetary value. Never
                  submit a private key or seed phrase.
                </p>
              </div>
            </div>
          </section>
          <aside className="notice">
            For access, verification or transaction issues, contact your
            organization owner or platform operator. Share the financing
            reference and transaction hash, never credentials or document
            contents in public channels.
          </aside>
          <div className="row">
            <Button asChild variant="secondary">
              <Link href="/app/wallet">Check wallet & network</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/app/transactions">Review transactions</Link>
            </Button>
          </div>
        </div>
      </PageFrame>
    );
  return notFound();
}
async function Content(props: Props) {
  let content: React.ReactNode;
  let failure: AppError | undefined;
  try {
    content = await resolvePage(props);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.status === 401) redirect("/login");
    failure = error;
  }
  if (failure)
    return (
      <PageFrame
        title={
          failure.status === 403
            ? "Workspace access required"
            : "Unable to load this view"
        }
        description="Check your workspace permissions and try again."
      >
        <ErrorState message={failure.message} />
      </PageFrame>
    );
  return content;
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Content {...props} />
    </Suspense>
  );
}
