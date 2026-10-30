"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "../wallet/api";
import type { SessionData } from "@/lib/domain";
export function useSession(initial?: SessionData | null) {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => api<SessionData | null>("auth/session"),
    initialData: initial,
    refetchInterval: 30000,
    retry: false,
  });
}
