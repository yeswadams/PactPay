import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PactPay | Invoice financing demo",
  description:
    "Human-verified invoice financing with transparent mock-token funding and settlement.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
