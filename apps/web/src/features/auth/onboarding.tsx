"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { onboardingSchema } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { api } from "../wallet/api";
export function OnboardingForm() {
  const form = useForm<
    z.input<typeof onboardingSchema>,
    unknown,
    z.output<typeof onboardingSchema>
  >({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: "",
      email: "",
      organizationName: "",
      kind: "sme",
      registrationNumber: "",
      contactPhone: "",
      discloseName: false,
    },
  });
  const [error, setError] = useState("");
  const router = useRouter();
  const queries = useQueryClient();
  const kind = useWatch({ control: form.control, name: "kind" });
  return (
    <form
      className="stack"
      onSubmit={form.handleSubmit(async (values) => {
        setError("");
        try {
          await api("onboarding", {
            method: "POST",
            body: JSON.stringify(values),
          });
          await queries.invalidateQueries({ queryKey: ["session"] });
          router.push("/app");
          router.refresh();
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Could not save profile",
          );
        }
      })}
    >
      <fieldset>
        <legend>How will you use PactPay?</legend>
        <div className="role-options">
          <label>
            <input type="radio" value="sme" {...form.register("kind")} />
            <strong>SME financing</strong>
            <span>Finance your business’s unpaid invoices.</span>
          </label>
          <label>
            <input type="radio" value="investor" {...form.register("kind")} />
            <strong>Investor</strong>
            <span>Participate in approved financing offers.</span>
          </label>
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Full name
          <input autoComplete="name" {...form.register("name")} />
          {form.formState.errors.name && (
            <span className="form-error">
              {form.formState.errors.name.message}
            </span>
          )}
        </label>
        <label>
          Contact email
          <input
            type="email"
            autoComplete="email"
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <span className="form-error">
              {form.formState.errors.email.message}
            </span>
          )}
        </label>
        <label>
          {kind === "sme"
            ? "Registered business name"
            : "Organization / profile name"}
          <input {...form.register("organizationName")} />
          {form.formState.errors.organizationName && (
            <span className="form-error">
              {form.formState.errors.organizationName.message}
            </span>
          )}
        </label>
        <label>
          Contact phone
          <input autoComplete="tel" {...form.register("contactPhone")} />
        </label>
        {kind === "sme" && (
          <label>
            Registration reference
            <input {...form.register("registrationNumber")} />
            {form.formState.errors.registrationNumber && (
              <span className="form-error">
                {form.formState.errors.registrationNumber.message}
              </span>
            )}
          </label>
        )}
      </div>
      <label className="check-label">
        <input type="checkbox" {...form.register("discloseName")} />
        Allow my organization’s display name on approved financing offers.
      </label>
      <p className="notice">
        Profiles begin with verification pending. Investor eligibility and
        business checks require an authorized reviewer.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button disabled={form.formState.isSubmitting} type="submit">
        {form.formState.isSubmitting ? "Saving profile…" : "Create workspace"}
      </Button>
    </form>
  );
}
