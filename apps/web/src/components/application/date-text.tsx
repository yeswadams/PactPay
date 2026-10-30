"use client";
import { useSession } from "@/features/auth/session";
export function DateText({ value }: { value?: string | Date | null }) {
  const session = useSession();
  if (!value) return <>—</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>—</>;
  return (
    <time dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat("en-KE", {
        dateStyle: "medium",
        timeZone: session.data?.user.timezone ?? "Africa/Nairobi",
      }).format(date)}
    </time>
  );
}
