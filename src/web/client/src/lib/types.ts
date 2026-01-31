/**
 * TypeScript interfaces for Whale Scout Dashboard
 */

import type { LucideIcon } from 'lucide-react';

// Config value types (replaces 'any' in ConfigItem)
export type ConfigValue = string | number | boolean;

// Config update payload
export type ConfigUpdatePayload = Record<string, ConfigValue>;

// Safety status from backend
export interface SafetyStatus {
  withinTradingHours: boolean;
  remainingBudget: number;
  dailyLimit: number;
  todaySpending: number;
  tradingEnabled: boolean;
  killSwitchEnabled: boolean;
  dryRunMode: boolean;
}

// Kill switch status
export interface KillSwitchStatus {
  activated: boolean;
  activatedAt?: string;
  reason?: string;
}

// Status badge colors map
export type StatusColors = Record<string, string>;

// StatCard props (Dashboard)
export interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  trend: 'up' | 'down' | 'neutral';
  icon?: LucideIcon;
}

// Nav item (Sidebar)
export interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
}

// Activity data types
export interface WhaleDetectedData {
  wallet: string;
  walletType: string;
  size: number;
  market: string;
  outcome: string;
  price: number;
  suspicionScore?: number;
}

export interface TradeActivityData {
  id: string;
  market_title: string;
  outcome: string;
  entry_price: number;
  exit_price?: number | null;
  virtual_amount: number;
  confidence_score: number;
  pnl?: number | null;
  status: string;
}

// Backend activity item format
export interface BackendActivityItem {
  type: 'paper_trade' | 'wallet_trade';
  timestamp: string;
  data: TradeActivityData;
}

// Portfolio update from WebSocket
export interface PortfolioUpdate {
  balance: number;
  pnl: number;
  totalTrades: number;
  winRate: number;
}

// Bot status update from WebSocket
export interface BotStatusUpdate {
  running: boolean;
  uptime: number;
  startTime: number | null;
}

// Order status update from WebSocket
export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  timestamp: string;
}

export interface Trade {
  id: string;
  market_title: string;
  market_id: string;
  market_slug?: string;
  market_end_date?: string | null;
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

// WebSocket message data types (union)
export type WSMessageData = 
  | PortfolioUpdate 
  | TradeActivityData
  | WhaleDetectedData 
  | BotStatusUpdate
  | OrderStatusUpdate
  | null;

export interface WSMessage {
  type: 'portfolio' | 'trade:new' | 'trade:resolved' | 'whale:detected' | 'bot:status' | 'order:status_changed' | 'order:filled' | 'order:partial_fill' | 'ping' | 'pong';
  data?: WSMessageData;
  timestamp?: number;
}

/**
 * Unified Order interface (combines paper and real trades)
 */
export interface Order {
  id: string;
  type: 'paper' | 'real';
  marketTitle: string;
  outcome: string;
  orderId?: string;
  orderType?: string;
  entryPrice: number;
  exitPrice?: number | null;
  amount: number;
  shares: number;
  status: OrderStatus;
  pnl?: number | null;
  feePaid?: number;
  transactionHash?: string;
  timestamp: string;
  confidenceScore: number;
  triggeredBy: string;
}

export type OrderStatus = 
  | 'PENDING'
  | 'OPEN'
  | 'FILLED'
  | 'PARTIALLY_FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED'
  | 'CLOSED'
  | 'WON'
  | 'LOST';

export interface OrderStats {
  paper: {
    total: number;
    open: number;
    won: number;
    lost: number;
    cancelled: number;
  };
  real: {
    total: number;
    pending: number;
    open: number;
    won: number;
    lost: number;
    cancelled: number;
    failed: number;
  } | null;
  combined: {
    total: number;
    open: number;
    pending: number;
  };
}

// Close position request
export interface ClosePositionRequest {
  type: 'paper' | 'real';
  sellType?: 'market' | 'limit';
  limitPrice?: number;
}

// Close position response
export interface ClosePositionResponse {
  success: boolean;
  message: string;
  exitPrice?: number;
  pnl?: number;
  exitOrderId?: string;
  transactionHash?: string;
}
