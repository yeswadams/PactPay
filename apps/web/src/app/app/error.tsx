"use client";
import { ErrorState } from "@/components/ui/states";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      message="Check your connection and try again. If this continues, contact your platform operator."
      retry={reset}
    />
  );
}
