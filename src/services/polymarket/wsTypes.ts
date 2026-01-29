/**
 * Polymarket WebSocket Message Types
 * Based on the Market Channel subscription
 */

// Subscription Messages

export interface WSSubscribeMessage {
  assets_ids?: string[];
  markets?: string[];
  type: 'market' | 'user';
  auth?: WSAuth;
  custom_feature_enabled?: boolean;
}

export interface WSAuth {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface WSOperationMessage {
  assets_ids?: string[];
  markets?: string[];
  operation: 'subscribe' | 'unsubscribe';
  custom_feature_enabled?: boolean;
}

// Market Channel Events

export interface WSBookMessage {
  event_type: 'book';
  asset_id: string;
  market: string;
  timestamp: string;
  hash: string;
  bids: WSOrderSummary[];
  asks: WSOrderSummary[];
}

export interface WSOrderSummary {
  price: string;
  size: string;
}

export interface WSLastTradePrice {
  event_type: 'last_trade_price';
  asset_id: string;
  market: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL';
  fee_rate_bps: string;
  timestamp: string;
}

export interface WSPriceChange {
  event_type: 'price_change';
  market: string;
  price_changes: WSPriceChangeDetail[];
  timestamp: string;
}

export interface WSPriceChangeDetail {
  asset_id: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL';
  hash: string;
  best_bid: string;
  best_ask: string;
}

export interface WSNewMarket {
  event_type: 'new_market';
  id: string;
  question: string;
  market: string;
  slug: string;
  description: string;
  assets_ids: string[];
  outcomes: string[];
  timestamp: string;
}

export interface WSMarketResolved {
  event_type: 'market_resolved';
  id: string;
  market: string;
  winning_asset_id: string;
  winning_outcome: string;
  timestamp: string;
}

export type WSMarketEvent = 
  | WSBookMessage 
  | WSLastTradePrice 
  | WSPriceChange 
  | WSNewMarket 
  | WSMarketResolved;
