import Link from "next/link";
import { Landmark } from "lucide-react";
import { WalletControl } from "@/features/auth/wallet-control";
export default function LoginPage() {
  return (
    <main className="auth-boundary">
      <section className="auth-card">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Landmark size={18} />
          </span>
          PactPay
        </Link>
        <span className="eyebrow">Your secure workspace</span>
        <h1 style={{ marginTop: 12 }}>Connect. Sign in. Get started.</h1>
        <p>
          Connect your wallet, then sign a one-time sign-in message. A
          connection alone does not authenticate your account.
        </p>
        <WalletControl expanded />
        <p className="notice" style={{ marginTop: 25 }}>
          No funds move during sign-in. PactPay never asks for your recovery
          phrase or private key.
        </p>
        <Link href="/app" className="ui-button button-ghost">
          Already signed in? Open workspace
        </Link>
      </section>
    </main>
  );
}
