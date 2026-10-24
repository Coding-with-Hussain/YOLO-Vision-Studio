import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/services/api";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
        refetchOnWindowFocus: false,
        staleTime: 2_000,
      },
    },
  });
}
