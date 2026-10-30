import { ApiError } from "../http";
/** Retired simulated fixture path. Use the Anvil/SIWE/S3-backed local demo. */
export async function seedDemoData(): Promise<{ seeded: boolean; message: string }> { throw new ApiError(410, "Use pnpm demo:local. The database-only financing fixture is retired."); }
