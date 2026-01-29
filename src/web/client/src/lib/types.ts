/**
 * TypeScript interfaces for Whale Scout Dashboard
 */

export interface Trade {
  id: string;
  market_title: string;
  market_id: string;
  outcome: string;
  entry_price: number;
  exit_price?: number | null;
  virtual_amount: number;
  shares: number;
  status: 'OPEN' | 'WON' | 'LOST' | 'CANCELLED';
  pnl: number | null;
  confidence_score: number;
  timestamp: string;
  triggered_by: string;
  created_at?: string;
}

export interface Wallet {
  address: string;
  is_whale: boolean;
  is_new_suspicious: boolean;
  suspicion_score: number;
  win_count: number;
  loss_count: number;
  total_trades: number;
  winRate: number;
  first_seen: string;
  last_seen: string;
  total_volume?: number;
}

export interface BotStatus {
  running: boolean;
  uptime: number;
  startTime: number | null;
  lastError: string | null;
}

export interface Overview {
  balance: number;
  totalValue: number;
  pnl: number;
  pnlPercent: number;
  openPositions: number;
  totalTrades: number;
  winRate: number;
  lockedCapital: number;
  startingBalance?: number;
  roi?: number;
}

export interface Portfolio {
  balance: number;
  startingBalance: number;
  pnl: number;
  pnlPercent: string;
  roi: string;
}

export interface TradesStats {
  total: number;
  open: number;
  won: number;
  lost: number;
  cancelled: number;
  winRate: number;
}

export interface WalletsStats {
  total: number;
  totalTrades: number;
}

export interface PerformanceStats {
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
}

export interface OverviewResponse {
  portfolio: Portfolio;
  trades: TradesStats;
  wallets: WalletsStats;
  performance: PerformanceStats;
}

export interface WSMessage {
  type: 'portfolio' | 'trade:new' | 'trade:resolved' | 'whale:detected' | 'bot:status' | 'ping' | 'pong';
  data?: any;
  timestamp?: number;
}
