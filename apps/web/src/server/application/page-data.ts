import { cookies } from "next/headers";
import { handleApplicationApi } from "./api.ts";
import { appOrigin, AppError } from "./http.ts";
/** Reuse exactly the same scoped services for RSC initial data, without an HTTP round trip. */
export async function pageData<T>(path: string): Promise<T> {
  const store = await cookies();
  const target = new URL(`/api/v1/${path}`, appOrigin());
  const result = await handleApplicationApi(
    new Request(target, { headers: { cookie: store.toString() } }),
    target.pathname.replace("/api/v1/", "").split("/"),
  );
  const body = await result.json();
  if (!result.ok)
    throw new AppError(
      result.status,
      body.error?.message ?? "Could not load this workspace",
    );
  return body.data as T;
}
