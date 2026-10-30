import { handler, ok } from "@/server/http";
import { seedDemoData } from "@/server/services/seed";

export const POST = handler(async () => {
  const result = await seedDemoData();
  return ok(result);
});
