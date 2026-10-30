import { handler, ok } from "@/server/http";
import { getCurrentUser } from "@/server/auth";

export const GET = handler(async () => {
  const user = await getCurrentUser();
  return ok({
    user: user
      ? { id: user.id, email: user.email, name: user.name, role: user.role }
      : null,
  });
});
