import { NextResponse } from "next/server";
import { z } from "zod";

export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];

  constructor(status: number, message: string, issues?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

/** Standard success envelope: `{ ok: true, data }`. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

/** Standard error envelope: `{ ok: false, error: { message, issues? } }`. */
export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: { message: error.message, issues: error.issues } },
      { status: error.status },
    );
  }
  console.error("[api] unexpected error", error);
  return NextResponse.json(
    { ok: false, error: { message: "Unexpected server error" } },
    { status: 500 },
  );
}

/** Wraps a route handler so domain/ApiErrors become correct HTTP responses. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return fail(error);
    }
  };
}

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(400, "Invalid request payload", normalizeIssues(result.error));
  }
  return result.data;
}

export function normalizeIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/** KES cents -> readable string, e.g. 50000000 -> "KES 500,000.00". */
export function formatKesCents(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
