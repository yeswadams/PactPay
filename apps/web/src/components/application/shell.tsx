"use client";
import { useEffect, useRef, useState } from "react";
import { useConnection, useConnectionEffect } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Store,
  ChartNoAxesCombined,
  ArrowLeftRight,
  FileText,
  FilePlus2,
  HandCoins,
  Receipt,
  ShieldCheck,
  ClipboardCheck,
  Landmark,
  ScrollText,
  Building2,
  Wallet,
  Settings,
  LifeBuoy,
  Menu,
  Search,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { LoadingState } from "../ui/states";
import { WalletControl } from "@/features/auth/wallet-control";
import { useSession } from "@/features/auth/session";
import { api } from "@/features/wallet/api";
import { navigationFor } from "@/lib/navigation";
import type { SessionData } from "@/lib/domain";
const icons = {
  overview: LayoutDashboard,
  marketplace: Store,
  investments: ChartNoAxesCombined,
  transactions: ArrowLeftRight,
  invoices: FileText,
  submit: FilePlus2,
  funding: HandCoins,
  repayments: Receipt,
  verification: ShieldCheck,
  approvals: ClipboardCheck,
  settlement: Landmark,
  audit: ScrollText,
  organization: Building2,
  wallet: Wallet,
  settings: Settings,
  help: LifeBuoy,
};
export function AppShell({
  initial,
  children,
}: {
  initial: SessionData;
  children: React.ReactNode;
}) {
  const auth = useSession(initial);
  const session = auth.data ?? initial;
  const connection = useConnection();
  const queries = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [orgError, setOrgError] = useState("");
  const invalidated = useRef(false);
  useConnectionEffect({
    onDisconnect() {
      if (!invalidated.current) {
        invalidated.current = true;
        void api("auth/logout", { method: "POST", body: "{}" }).finally(() => {
          queries.clear();
          router.replace("/login");
          router.refresh();
        });
      }
    },
  });
  const mismatch =
    connection.address &&
    connection.address.toLowerCase() !==
      session.user.walletAddress.toLowerCase();
  useEffect(() => {
    if ((mismatch || auth.data === null) && !invalidated.current) {
      invalidated.current = true;
      void api("auth/logout", { method: "POST", body: "{}" }).finally(() => {
        queries.clear();
        router.replace("/login");
        router.refresh();
      });
    }
  }, [mismatch, auth.data, queries, router]);
  if (mismatch || auth.data === null)
    return (
      <div className="auth-boundary">
        <LoadingState label="Securing your session…" />
      </div>
    );
  if (!connection.isConnected)
    return (
      <div className="auth-boundary">
        <div className="auth-card">
          <h1>Reconnect your signed-in wallet</h1>
          <p>
            Protected information stays hidden until the wallet for this session
            is connected.
          </p>
          <WalletControl expanded />
        </div>
      </div>
    );
  const navigation = navigationFor(session);
  const current = [...navigation]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/app" && pathname.startsWith(`${item.href}/`)),
    );
  const nav = (
    <>
      <Link className="brand" href="/app">
        <span className="brand-mark">
          <Landmark size={18} />
        </span>
        PactPay<span className="brand-tag">WORKSPACE</span>
      </Link>
      <div className="organization-picker">
        <Building2 size={17} />
        <select
          aria-label="Active organization"
          value={session.organization?.id ?? ""}
          onChange={async (event) => {
            setOrgError("");
            try {
              await api("organizations/select", {
                method: "POST",
                body: JSON.stringify({ id: event.target.value }),
              });
              queries.removeQueries({
                predicate: (query) => query.queryKey[0] !== "session",
              });
              await auth.refetch();
              router.push("/app");
              router.refresh();
            } catch (error) {
              setOrgError(
                error instanceof Error
                  ? error.message
                  : "Could not select organization",
              );
            }
          }}
        >
          <option value="" disabled>
            Operator workspace
          </option>
          {session.organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <ChevronDown size={13} />
      </div>
      {orgError && <p role="alert">{orgError}</p>}
      <nav aria-label="Main navigation">
        {navigation.map((item, index) => {
          const Icon = icons[item.icon as keyof typeof icons];
          const selected =
            pathname === item.href ||
            (item.href !== "/app" &&
              pathname.startsWith(`${item.href}/`) &&
              !navigation.some(
                (other) =>
                  other.href !== item.href &&
                  other.href.length > item.href.length &&
                  pathname === other.href,
              ));
          return (
            <div key={item.href}>
              {(index === 0 || item.group !== navigation[index - 1].group) && (
                <p className="nav-group">{item.group}</p>
              )}
              <Link
                href={item.href}
                aria-current={selected ? "page" : undefined}
                className={selected ? "nav-item active" : "nav-item"}
                onClick={() => setDrawer(false)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <span className="network-dot" />
        <span>Test environment</span>
        <Link href="/app/help" aria-label="Read demo limitations">
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
  return (
    <div className="application">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">{nav}</aside>
      <div className="application-body">
        <header className="topbar">
          <Dialog open={drawer} onOpenChange={setDrawer}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu"
                aria-label="Open navigation menu"
              >
                <Menu size={21} />
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Workspace navigation"
              description="Choose a section of your PactPay workspace."
            >
              <div className="mobile-nav">{nav}</div>
            </DialogContent>
          </Dialog>
          <div className="breadcrumbs">
            <Link href="/app">Workspace</Link>
            <ChevronRight size={13} />
            <span>{current?.label ?? "Details"}</span>
          </div>
          <form
            className="global-search"
            action={
              session.organization?.role === "investor"
                ? "/app/marketplace"
                : session.organization?.role === "sme"
                  ? "/app/invoices"
                  : "/app/admin/approvals"
            }
          >
            <Search size={16} />
            <input
              name="q"
              aria-label="Search workspace records"
              placeholder="Search records…"
            />
          </form>
          <WalletControl />
          <Link
            className="account-avatar"
            href="/app/settings"
            aria-label="Account settings"
          >
            {session.user.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </Link>
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="application-footer">
          <span>PactPay · Mock-token environment</span>
          <span>Human verification. Transparent settlement.</span>
        </footer>
      </div>
    </div>
  );
}
