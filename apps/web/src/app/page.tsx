import Link from "next/link";
import { Web3App } from "@/features/wallet/providers";
export default function Home() {
  return (
    <main className="workspace">
      <header className="masthead">
        <Link className="brand" href="/">
          PactPay<span>Invoice financing</span>
        </Link>
        <span className="badge">Local & testnet prototype</span>
      </header>
      <section className="hero">
        <span className="eyebrow">Capital for the work already done</span>
        <h1>
          Turn verified invoices
          <br />
          into working capital.
        </h1>
        <p>
          Transparent funding, human verification, and a traceable settlement
          journey. Explore the protocol with sample invoices and mock tokens.
        </p>
      </section>
      <aside className="notice">
        <strong>Demo funds only.</strong> MOCK is not a stablecoin and has no
        monetary value. Invoice evidence remains private. Blockchain records do
        not prove authenticity, enforceability, or repayment.
      </aside>
      <Web3App />
      <footer>
        Non-transferable participation · Human-reviewed invoices · Repayment
        depends on off-chain collection
      </footer>
    </main>
  );
}
