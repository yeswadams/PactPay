import Link from "next/link";
import {
  Landmark,
  FileCheck2,
  Users,
  ArrowRightLeft,
  ShieldCheck,
  Wallet,
  ArrowRight,
} from "lucide-react";
import { WalletControl } from "@/features/auth/wallet-control";
import { Button } from "@/components/ui/button";
export default function Home() {
  return (
    <>
      <header className="public-header">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Landmark size={18} />
          </span>
          PactPay
        </Link>
        <nav className="public-nav" aria-label="Public navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/login">Sign in</Link>
          <WalletControl />
        </nav>
      </header>
      <main className="public-main">
        <section className="public-hero">
          <div>
            <span className="eyebrow">Invoice financing, built on trust</span>
            <h1>
              Your work is done.
              <br />
              Your capital shouldn’t wait.
            </h1>
            <p>
              Connect verified invoices with investor participation. Manage
              business financing in one workspace, with human review and a clear
              record of every funding and settlement action.
            </p>
            <div className="row">
              <Button asChild>
                <Link href="/login">
                  Open your workspace <ArrowRight size={15} />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
          </div>
          <section className="product-diagram" aria-labelledby="journey-title">
            <span className="eyebrow">A clear path to working capital</span>
            <h2 id="journey-title" style={{ marginTop: 12 }}>
              From invoice to settlement
            </h2>
            <div className="process-step">
              <span>
                <FileCheck2 size={21} />
              </span>
              <div>
                <strong>Submit & verify</strong>
                <p>A human reviewer checks your invoice and evidence.</p>
              </div>
            </div>
            <div className="process-step">
              <span>
                <Users size={21} />
              </span>
              <div>
                <strong>Fund together</strong>
                <p>Eligible investors contribute to agreed financing terms.</p>
              </div>
            </div>
            <div className="process-step">
              <span>
                <ArrowRightLeft size={21} />
              </span>
              <div>
                <strong>Disburse & repay</strong>
                <p>Track proceeds, reconciled repayment and investor claims.</p>
              </div>
            </div>
          </section>
        </section>
        <aside className="notice">
          <strong>Local and testnet environment.</strong> Settlement uses MOCK
          tokens with no monetary value. Participation does not guarantee
          payment or establish legal rights to an invoice. Use sample documents
          only.
        </aside>
        <section id="how-it-works" className="public-features">
          <article className="panel">
            <FileCheck2 size={24} />
            <h3>For SMEs</h3>
            <p>
              Submit invoices privately, follow verification, review financing
              terms and track disbursement.
            </p>
          </article>
          <article className="panel">
            <Wallet size={24} />
            <h3>For investors</h3>
            <p>
              Review verified offers, fund with your wallet and claim
              proportional repayments when available.
            </p>
          </article>
          <article className="panel">
            <ShieldCheck size={24} />
            <h3>Human decisions. Clear records.</h3>
            <p>
              Documents stay private. Authorized operators verify evidence and
              reconcile collections before settlement.
            </p>
          </article>
        </section>
      </main>
    </>
  );
}
