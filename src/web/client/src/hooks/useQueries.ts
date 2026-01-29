import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * React Query hooks for all API endpoints
 * Auto-refetch every 10 seconds (configured in queryClient)
 */

// Query Keys (for cache management)
export const queryKeys = {
  overview: ['overview'] as const,
  performance: (days: number) => ['performance', days] as const,
  dailyStats: ['dailyStats'] as const,
  trades: (params?: { limit?: number; status?: string }) => ['trades', params] as const,
  trade: (id: string) => ['trade', id] as const,
  tradeStats: ['tradeStats'] as const,
  wallets: ['wallets'] as const,
  wallet: (address: string) => ['wallet', address] as const,
  walletStats: ['walletStats'] as const,
  activity: (limit: number) => ['activity', limit] as const,
  botStatus: ['botStatus'] as const,
  config: ['config'] as const,
};

// Overview (Dashboard stats)
export function useOverview() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => api.getOverview(),
  });
}

// Performance
export function usePerformance(days = 30) {
  return useQuery({
    queryKey: queryKeys.performance(days),
    queryFn: () => api.getPerformance(days),
  });
}

// Daily Stats
export function useDailyStats() {
  return useQuery({
    queryKey: queryKeys.dailyStats,
    queryFn: () => api.getDailyStats(),
  });
}

// Trades
export function useTrades(params?: { limit?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.trades(params),
    queryFn: () => api.getTrades(params),
  });
}

// Single Trade
export function useTrade(id: string) {
  return useQuery({
    queryKey: queryKeys.trade(id),
    queryFn: () => api.getTrade(id),
    enabled: !!id, // Only fetch if id is provided
  });
}

// Trade Stats
export function useTradeStats() {
  return useQuery({
    queryKey: queryKeys.tradeStats,
    queryFn: () => api.getTradeStats(),
  });
}

// Wallets
export function useWallets() {
  return useQuery({
    queryKey: queryKeys.wallets,
    queryFn: () => api.getWallets(),
  });
}

// Single Wallet
export function useWallet(address: string) {
  return useQuery({
    queryKey: queryKeys.wallet(address),
    queryFn: () => api.getWallet(address),
    enabled: !!address, // Only fetch if address is provided
  });
}

// Wallet Stats
export function useWalletStats() {
  return useQuery({
    queryKey: queryKeys.walletStats,
    queryFn: () => api.getWalletStats(),
  });
}

// Activity
export function useActivity(limit = 20) {
  return useQuery({
    queryKey: queryKeys.activity(limit),
    queryFn: () => api.getRecentActivity(limit),
  });
}

// Bot Status
export function useBotStatus() {
  return useQuery({
    queryKey: queryKeys.botStatus,
    queryFn: () => api.getBotStatus(),
  });
}

// Config
export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => api.getConfig(),
  });
}

// Mutations

// Bot Control Mutations
export function useBotControl() {
  const queryClient = useQueryClient();

  const startBot = useMutation({
    mutationFn: () => api.startBot(),
    onSuccess: () => {
      // Invalidate bot status to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.botStatus });
    },
  });

  const stopBot = useMutation({
    mutationFn: () => api.stopBot(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.botStatus });
    },
  });

  const restartBot = useMutation({
    mutationFn: () => api.restartBot(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.botStatus });
    },
  });

  const resetData = useMutation({
    mutationFn: () => api.resetData(),
    onSuccess: () => {
      // Invalidate all data queries after reset
      queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      queryClient.invalidateQueries({ queryKey: queryKeys.trades() });
      queryClient.invalidateQueries({ queryKey: queryKeys.performance(30) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(20) });
    },
  });

  return { startBot, stopBot, restartBot, resetData };
}

// Config Mutation
export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Record<string, any>) => api.updateConfig(updates),
    onSuccess: () => {
      // Invalidate config to refetch updated values
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
  });
}
