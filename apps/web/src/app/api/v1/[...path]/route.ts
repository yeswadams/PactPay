import { handleApi } from "@/server/blockchain/api";
async function handler(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handleApi(request, (await context.params).path);
}
export const GET = handler;
export const POST = handler;
