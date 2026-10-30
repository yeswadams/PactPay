import { handler, ok } from "@/server/http";
import { clearSession } from "@/server/auth";

export const POST = handler(async () => {
  await clearSession();
  return ok({ signedOut: true });
});
