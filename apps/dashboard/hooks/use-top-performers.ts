"use client"

import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchTopPerformers } from "@/lib/api/dashboard-stats"

export function useTopPerformers() {
  return useQuery({
    queryKey: queryKeys.dashboard.topPerformers(),
    queryFn: fetchTopPerformers,
    staleTime: 5 * 60 * 1000,
  })
}
