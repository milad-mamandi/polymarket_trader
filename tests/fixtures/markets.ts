import type { Market } from '../../src/services/polymarket/types.js';
import { mockTimestamp } from '../setup.js';

/**
 * Test fixtures for market-related data
 */

// Mock market/condition IDs
export const MARKET_IDS = {
  trump: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  bitcoin: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  ai: '0x9999999999999999999999999999999999999999999999999999999999999999',
  closed: '0x1111111111111111111111111111111111111111111111111111111111111111',
};

// Mock market titles
export const MARKET_TITLES = {
  trump: 'Will Trump win the 2024 election?',
  bitcoin: 'Will Bitcoin reach $100k in 2024?',
  ai: 'Will AGI be achieved by 2025?',
  closed: 'Will Ethereum merge happen in 2022?',
};

// Mock token IDs (for CLOB orders)
export const TOKEN_IDS = {
  trumpYes: '0xtoken_trump_yes_123',
  trumpNo: '0xtoken_trump_no_456',
  bitcoinYes: '0xtoken_btc_yes_789',
  bitcoinNo: '0xtoken_btc_no_abc',
  aiYes: '0xtoken_ai_yes_def',
  aiNo: '0xtoken_ai_no_ghi',
};

/**
 * Complete market fixtures
 */
export const mockMarkets: Record<string, Market> = {
  trump: {
    id: MARKET_IDS.trump,
    conditionId: MARKET_IDS.trump,
    slug: 'will-trump-win-2024',
    title: MARKET_TITLES.trump,
    question: MARKET_TITLES.trump,
    description: 'This market will resolve to Yes if Donald Trump wins the 2024 US presidential election.',
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
    icon: 'https://example.com/trump.png',
    volume: 50000000, // $50M volume
    liquidity: 500000, // $500k liquidity
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.65', '0.35'],
    active: true,
    closed: false,
    resolving: false,
    resolved: false,
    tags: ['politics', 'elections', 'us'],
    category: 'Politics',
    tokens: [
      {
        token_id: TOKEN_IDS.trumpYes,
        outcome: 'Yes',
        price: '0.65',
      },
      {
        token_id: TOKEN_IDS.trumpNo,
        outcome: 'No',
        price: '0.35',
      },
    ],
  },
  bitcoin: {
    id: MARKET_IDS.bitcoin,
    conditionId: MARKET_IDS.bitcoin,
    slug: 'bitcoin-100k-2024',
    title: MARKET_TITLES.bitcoin,
    question: MARKET_TITLES.bitcoin,
    description: 'Will Bitcoin (BTC) reach or exceed $100,000 USD at any point during 2024?',
    endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months from now
    icon: 'https://example.com/btc.png',
    volume: 25000000, // $25M volume
    liquidity: 300000, // $300k liquidity
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.72', '0.28'],
    active: true,
    closed: false,
    resolving: false,
    resolved: false,
    tags: ['crypto', 'bitcoin', 'price'],
    category: 'Crypto',
    tokens: [
      {
        token_id: TOKEN_IDS.bitcoinYes,
        outcome: 'Yes',
        price: '0.72',
      },
      {
        token_id: TOKEN_IDS.bitcoinNo,
        outcome: 'No',
        price: '0.28',
      },
    ],
  },
  ai: {
    id: MARKET_IDS.ai,
    conditionId: MARKET_IDS.ai,
    slug: 'ai-agi-2025',
    title: MARKET_TITLES.ai,
    question: MARKET_TITLES.ai,
    description: 'Will Artificial General Intelligence (AGI) be achieved by the end of 2025?',
    endDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString(), // 2 years from now
    icon: 'https://example.com/ai.png',
    volume: 10000000, // $10M volume
    liquidity: 150000, // $150k liquidity
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.15', '0.85'],
    active: true,
    closed: false,
    resolving: false,
    resolved: false,
    tags: ['tech', 'ai', 'agi'],
    category: 'Technology',
    tokens: [
      {
        token_id: TOKEN_IDS.aiYes,
        outcome: 'Yes',
        price: '0.15',
      },
      {
        token_id: TOKEN_IDS.aiNo,
        outcome: 'No',
        price: '0.85',
      },
    ],
  },
  closed: {
    id: MARKET_IDS.closed,
    conditionId: MARKET_IDS.closed,
    slug: 'ethereum-merge-2022',
    title: MARKET_TITLES.closed,
    question: MARKET_TITLES.closed,
    description: 'Did the Ethereum merge to Proof of Stake happen in 2022?',
    endDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
    icon: 'https://example.com/eth.png',
    volume: 5000000, // $5M volume
    liquidity: 0, // No liquidity (closed)
    outcomes: ['Yes', 'No'],
    outcomePrices: ['1.00', '0.00'], // Resolved to Yes
    active: false,
    closed: true,
    resolving: false,
    resolved: true,
    tags: ['crypto', 'ethereum', 'merge'],
    category: 'Crypto',
    tokens: [
      {
        token_id: '0xtoken_eth_yes',
        outcome: 'Yes',
        price: '1.00',
        winner: true,
      },
      {
        token_id: '0xtoken_eth_no',
        outcome: 'No',
        price: '0.00',
        winner: false,
      },
    ],
  },
};

/**
 * Helper to create a market with custom properties
 */
export function createMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: MARKET_IDS.trump,
    conditionId: MARKET_IDS.trump,
    slug: 'test-market',
    title: 'Test Market',
    question: 'Test Market Question?',
    description: 'Test market description',
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    icon: 'https://example.com/test.png',
    volume: 1000000,
    liquidity: 50000,
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.50', '0.50'],
    active: true,
    closed: false,
    resolving: false,
    resolved: false,
    tags: ['test'],
    category: 'Test',
    tokens: [
      {
        token_id: '0xtoken_test_yes',
        outcome: 'Yes',
        price: '0.50',
      },
      {
        token_id: '0xtoken_test_no',
        outcome: 'No',
        price: '0.50',
      },
    ],
    ...overrides,
  };
}

/**
 * Array of active markets
 */
export const activeMarkets: Market[] = [
  mockMarkets.trump,
  mockMarkets.bitcoin,
  mockMarkets.ai,
];

/**
 * Array of closed/resolved markets
 */
export const closedMarkets: Market[] = [mockMarkets.closed];

/**
 * All markets combined
 */
export const allMarkets: Market[] = [...activeMarkets, ...closedMarkets];
