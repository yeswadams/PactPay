export class ClientApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const envelope = await response.json();
  if (!response.ok)
    throw new ClientApiError(
      typeof envelope.error === "string"
        ? envelope.error
        : (envelope.error?.message ?? "Request failed"),
      response.status,
    );
  return envelope.ok === true ? (envelope.data as T) : (envelope as T);
}
