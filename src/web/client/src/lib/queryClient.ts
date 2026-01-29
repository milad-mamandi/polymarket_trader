import { QueryClient } from '@tanstack/react-query';

/**
 * React Query client configuration
 * - staleTime: Data considered fresh for 10 seconds
 * - refetchInterval: Auto-refetch every 10 seconds
 * - refetchOnWindowFocus: Refetch when user returns to tab
 * - retry: Retry failed requests 1 time
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000, // 10 seconds
      refetchInterval: 10 * 1000, // 10 seconds
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0, // Don't retry mutations
    },
  },
});
