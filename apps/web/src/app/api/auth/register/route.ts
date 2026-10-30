import { handler, ok } from "@/server/http";
import { register } from "@/server/services/accounts";

export const POST = handler(async (request: Request) => {
  const body = await request.json();
  const user = await register(body);
  return ok({ user }, 201);
});
