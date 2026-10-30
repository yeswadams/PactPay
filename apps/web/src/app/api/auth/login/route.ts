import { handler, ok } from "@/server/http";
import { login } from "@/server/services/accounts";

export const POST = handler(async (request: Request) => {
  const body = await request.json();
  const user = await login(body);
  return ok({ user });
});
