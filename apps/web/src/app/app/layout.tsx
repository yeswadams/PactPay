import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentActor, sessionData } from "@/server/application/auth";
import { AppShell } from "@/components/application/shell";
import { LoadingState } from "@/components/ui/states";
async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (!actor.organization && !actor.scopes.length) redirect("/onboarding");
  return <AppShell initial={sessionData(actor)}>{children}</AppShell>;
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <ProtectedLayout>{children}</ProtectedLayout>
    </Suspense>
  );
}
