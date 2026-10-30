import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentActor } from "@/server/application/auth";
import { OnboardingForm } from "@/features/auth/onboarding";
import { LoadingState } from "@/components/ui/states";
async function Onboarding() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (actor.scopes.length) redirect("/app");
  return (
    <main className="auth-boundary">
      <section className="panel stack">
        <div>
          <span className="eyebrow">Welcome to PactPay</span>
          <h1 style={{ margin: "10px 0" }}>Set up your organization</h1>
          <p>
            Tell us how you’ll use the workspace. Your profile will remain
            pending verification.
          </p>
        </div>
        <OnboardingForm />
      </section>
    </main>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Onboarding />
    </Suspense>
  );
}
