import { ApiError } from "../http";
export async function register(
  _input: unknown,
): Promise<{ id: string; email: string | null; name: string; role: string }> {
  void _input;
  throw new ApiError(
    410,
    "Create a wallet session and complete onboarding at /api/v1/onboarding",
  );
}
export async function login(
  _input: unknown,
): Promise<{ id: string; email: string | null; name: string; role: string }> {
  void _input;
  throw new ApiError(
    410,
    "Use Sign-In with Ethereum; password sessions cannot access this application",
  );
}
