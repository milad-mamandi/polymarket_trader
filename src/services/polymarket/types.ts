// Polymarket API Response Types

export interface Trade {
  id?: string;  // Market/condition ID (may not be present in all responses)
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  name: string;
  pseudonym: string;
  bio: string;
  profileImage: string;
  profileImageOptimized: string;
  transactionHash: string;
}

export interface Position {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

export interface Activity {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'REWARD' | 'CONVERSION' | 'MAKER_REBATE';
  size: number;
  usdcSize: number;
  transactionHash: string;
  price: number;
  asset: string;
  side: 'BUY' | 'SELL';
  outcomeIndex: number;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  name: string;
  pseudonym: string;
  bio: string;
  profileImage: string;
  profileImageOptimized: string;
}

export interface PublicProfile {
  createdAt: string | null;
  proxyWallet: string | null;
  profileImage: string | null;
  displayUsernamePublic: boolean | null;
  bio: string | null;
  pseudonym: string | null;
  name: string | null;
  users: Array<{
    id: string;
    creator: boolean;
    mod: boolean;
  }> | null;
  xUsername: string | null;
  verifiedBadge: boolean | null;
}

export interface Market {
  id: string;
  conditionId: string;
  slug: string;
  title: string;
  question?: string;  // Alternative to title in some API responses
  description: string;
  endDate: string;
  icon: string;
  volume: number;
  liquidity: number;
  outcomes: string[];
  outcomePrices: string[];
  active: boolean;
  closed: boolean;
  resolving: boolean;
  resolved: boolean;
  tags: string[];
  category: string;
  tokens?: Array<{
    token_id: string;
    outcome: string;
    price: string;
    winner?: boolean;
  }>;
}

export interface TraderLeaderboardEntry {
  rank: string;
  proxyWallet: string;
  userName: string;
  vol: number;
  pnl: number;
  profileImage: string;
  xUsername: string;
  verifiedBadge: boolean;
}

export interface PriceData {
  price: number;
  timestamp: number;
}

export interface ClosedPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  avgPrice: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  timestamp: number;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
}
