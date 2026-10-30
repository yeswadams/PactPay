import { createHash, timingSafeEqual } from "node:crypto";
export type Role = "sme" | "verifier" | "lister" | "settler" | "sync";
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function authorize(request: Request, allowed: Role[]): Role {
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const digest = createHash("sha256").update(supplied).digest();
  for (const role of allowed) {
    const secret = process.env[`${role.toUpperCase()}_API_TOKEN`];
    if (
      secret &&
      secret.length >= 32 &&
      timingSafeEqual(digest, createHash("sha256").update(secret).digest())
    )
      return role;
  }
  throw new ApiError(
    401,
    "A configured operator credential for this role is required",
  );
}
