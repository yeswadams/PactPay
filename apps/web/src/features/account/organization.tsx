"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "../wallet/api";
import { useSession } from "../auth/session";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status";
import { ErrorState } from "@/components/ui/states";
import { evmAddress, type SessionData } from "@/lib/domain";
const schema = z.object({
  name: z.string().trim().min(2).max(160),
  contactEmail: z.email(),
  contactPhone: z.string().max(60),
  discloseName: z.boolean(),
});
const memberSchema = z.object({ wallet: evmAddress });
export function OrganizationProfile({ initial }: { initial: SessionData }) {
  const session = useSession(initial);
  const organization = session.data?.organization;
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: organization?.name ?? "",
      contactEmail: organization?.contactEmail ?? "",
      contactPhone: organization?.contactPhone ?? "",
      discloseName: organization?.discloseName ?? false,
    },
  });
  const memberForm = useForm<
    z.input<typeof memberSchema>,
    unknown,
    z.output<typeof memberSchema>
  >({ resolver: zodResolver(memberSchema), defaultValues: { wallet: "" } });
  const queries = useQueryClient();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const members = useQuery({
    queryKey: ["members", organization?.id],
    queryFn: () =>
      api<
        {
          id: string;
          name: string;
          walletAddress: string | null;
          role: string;
          eligibilityStatus: string;
        }[]
      >("organizations/members"),
    enabled: !!organization,
  });
  if (!organization)
    return (
      <section className="panel stack">
        <h2>No organization selected</h2>
        <p>
          Operator access is independent of organization membership. You can
          create an SME or investor profile separately.
        </p>
        <Button asChild>
          <Link href="/onboarding">Create an organization</Link>
        </Button>
      </section>
    );
  return (
    <div className="stack">
      <section className="panel stack">
        <div className="panel-header">
          <div>
            <h2>{organization.name}</h2>
            <p>
              {organization.kind === "sme"
                ? "SME organization"
                : "Investor organization"}{" "}
              · {organization.registrationNumber}
            </p>
          </div>
          <StatusBadge status={organization.verificationStatus} />
        </div>
        <form
          className="stack"
          onSubmit={form.handleSubmit(async (values) => {
            setError("");
            setMessage("");
            try {
              await api("organizations", {
                method: "POST",
                body: JSON.stringify(values),
              });
              setMessage("Organization profile saved.");
              await queries.invalidateQueries({ queryKey: ["session"] });
              router.refresh();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save organization",
              );
            }
          })}
        >
          <fieldset
            disabled={!organization.isOwner || form.formState.isSubmitting}
            className="stack"
          >
            <div className="form-grid">
              <label>
                Organization name
                <input {...form.register("name")} />
              </label>
              <label>
                Contact email
                <input type="email" {...form.register("contactEmail")} />
              </label>
              <label>
                Contact phone
                <input {...form.register("contactPhone")} />
              </label>
            </div>
            <label className="check-label">
              <input type="checkbox" {...form.register("discloseName")} />
              Permit this display name on verified financing offers.
            </label>
            {organization.isOwner && (
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save organization profile
              </Button>
            )}
          </fieldset>
        </form>
      </section>
      <section className="panel stack">
        <h2>Organization members</h2>
        {members.data?.map((member) => (
          <div className="list-item" key={member.id}>
            <div>
              <strong>{member.name}</strong>
              <small>{member.walletAddress ?? "Wallet not associated"}</small>
            </div>
            <span>{member.role}</span>
          </div>
        ))}
        {organization.isOwner && (
          <form
            className="stack"
            onSubmit={memberForm.handleSubmit(async (values) => {
              setError("");
              try {
                await api("organizations/members", {
                  method: "POST",
                  body: JSON.stringify(values),
                });
                await members.refetch();
                memberForm.reset();
                setMessage(
                  "Organization member added. Operator privileges are not granted by membership.",
                );
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not add member",
                );
              }
            })}
          >
            <label>
              Member wallet address
              <input {...memberForm.register("wallet")} />
              {memberForm.formState.errors.wallet && (
                <span className="form-error">Enter a valid wallet address</span>
              )}
            </label>
            <Button
              variant="secondary"
              type="submit"
              disabled={memberForm.formState.isSubmitting}
            >
              Add organization member
            </Button>
          </form>
        )}
      </section>
      <div className="row">
        <Button asChild variant="secondary">
          <Link href="/onboarding">Create another organization</Link>
        </Button>
        <p className="small">
          Switch organizations in the sidebar. Membership does not complete
          identity or investor verification.
        </p>
      </div>
      {message && (
        <p role="status" className="info-note">
          {message}
        </p>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
export function AccountSettings({ initial }: { initial: SessionData }) {
  const [timezone, setTimezone] = useState(initial.user.timezone);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const queries = useQueryClient();
  return (
    <section className="panel stack">
      <h2>Your account</h2>
      <div className="detail-row">
        <span>Profile name</span>
        <strong>{initial.user.name}</strong>
      </div>
      <div className="detail-row">
        <span>Contact email</span>
        <strong>{initial.user.email ?? "Not provided"}</strong>
      </div>
      <div className="detail-row">
        <span>Authenticated wallet</span>
        <code>{initial.user.walletAddress}</code>
      </div>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage("");
          setError("");
          setBusy(true);
          try {
            await api("settings", {
              method: "POST",
              body: JSON.stringify({ timezone }),
            });
            await queries.invalidateQueries({ queryKey: ["session"] });
            setMessage("Date display preference saved.");
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not save preference",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Display timezone
          <select
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          >
            <option value="Africa/Nairobi">
              East Africa Time · Africa/Nairobi
            </option>
            <option value="UTC">Coordinated Universal Time · UTC</option>
            <option value="Europe/London">Europe/London</option>
            <option value="America/New_York">America/New_York</option>
          </select>
        </label>
        <Button disabled={busy} type="submit">
          Save preference
        </Button>
      </form>
      {message && (
        <p role="status" className="info-note">
          {message}
        </p>
      )}
      {error && <ErrorState message={error} />}
      <p className="small">
        Wallet sign-in sessions expire after eight hours. Disconnecting or
        switching accounts secures the protected workspace.
      </p>
    </section>
  );
}
