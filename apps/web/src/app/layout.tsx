import { Suspense } from "react";
import type { Metadata } from "next";
import { ApplicationProviders } from "@/features/wallet/providers";
import { browserNetwork } from "@/server/blockchain/runtime";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "PactPay | Invoice financing", template: "%s | PactPay" },
  description:
    "Wallet-authenticated invoice financing for SMEs and investors. Human verification, transparent funding and traceable settlement.",
};
async function ConfiguredProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const network = await browserNetwork().catch(() => null);
  return (
    <ApplicationProviders network={network}>{children}</ApplicationProviders>
  );
}
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense
          fallback={<div className="loading-state">Loading PactPay…</div>}
        >
          <ConfiguredProviders>{children}</ConfiguredProviders>
        </Suspense>
      </body>
    </html>
  );
}
