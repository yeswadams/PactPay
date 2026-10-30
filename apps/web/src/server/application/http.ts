import { z } from "zod";
export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "REQUEST_FAILED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function appOrigin() {
  const value = process.env.APP_ORIGIN;
  if (!value)
    throw new AppError(
      503,
      "APP_ORIGIN must be configured",
      "CONFIGURATION_REQUIRED",
    );
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new AppError(503, "HTTPS is required for this host");
  return url;
}
export function assertOrigin(request: Request) {
  const configured = appOrigin();
  const value = request.headers.get("origin");
  let origin: URL | undefined;
  try {
    if (value) origin = new URL(value);
  } catch {
    // Malformed and opaque origins are rejected below.
  }
  const loopback = new Set(["localhost", "127.0.0.1"]);
  const localAlias =
    origin &&
    loopback.has(configured.hostname) &&
    loopback.has(origin.hostname) &&
    origin.protocol === configured.protocol &&
    origin.port === configured.port;
  if (
    !origin ||
    value !== origin.origin ||
    (origin.origin !== configured.origin && !localAlias)
  )
    throw new AppError(
      403,
      "Request origin was not accepted",
      "ORIGIN_MISMATCH",
    );
  return origin;
}
export const jsonValue = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, entry) =>
      typeof entry === "bigint" ? entry.toString() : entry,
    ),
  );
export function response(value: unknown, status = 200) {
  return Response.json(
    { ok: true, data: jsonValue(value) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return Response.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Please check the highlighted fields",
          issues: error instanceof z.ZodError ? error.issues : [],
        },
      },
      { status: 400 },
    );
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error.cause as { code?: string })
      : null;
  if (cause?.code === "23505")
    return failure(new AppError(409, "This record already exists", "CONFLICT"));
  console.error(
    "PactPay application request failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return failure(
    new AppError(
      503,
      "The service is temporarily unavailable. Please try again.",
      "SERVICE_UNAVAILABLE",
    ),
  );
}
export async function readJson(request: Request, maximum = 16384) {
  if (Number(request.headers.get("content-length") ?? 0) > maximum)
    throw new AppError(413, "Request is too large");
  const text = await request.text();
  if (text.length > maximum) throw new AppError(413, "Request is too large");
  return JSON.parse(text);
}
export function pageOptions(url: URL) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(url.searchParams.get("page") ?? 1);
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(url.searchParams.get("pageSize") ?? 12);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: (url.searchParams.get("q") ?? "").slice(0, 120),
    status: url.searchParams.get("status") ?? "",
    sort: url.searchParams.get("sort") ?? "newest",
  };
}
