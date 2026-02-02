import { logger } from './logger.js';
import { CONFIG } from '../config/settings.js';

export function logTrade(details: {
  triggeredBy: string;
  walletType: string;
  walletAge: string;
  walletScore: number;
  winRate: string;
  market: string;
  conditionId: string;
  outcome: string;
  entryPrice: number;
  confidence: number;
  confidenceBreakdown: Record<string, number>;
  virtualAmount: number;
  shares: number;
  potentialPayout: number;
  risk: number;
}) {
  const initialBalance = CONFIG.INITIAL_PAPER_BALANCE;
  
  const tradeLog = `
════════════════════════════════════════════
PAPER TRADE EXECUTED
════════════════════════════════════════════
Triggered By: ${details.triggeredBy}
Wallet Type: ${details.walletType} | Age: ${details.walletAge}
Wallet Score: ${details.walletScore}/100 | Win Rate: ${details.winRate}

Market: "${details.market}"
Condition ID: ${details.conditionId}
Outcome: ${details.outcome} | Entry Price: $${details.entryPrice.toFixed(4)}

Confidence Score: ${details.confidence}/100
${Object.entries(details.confidenceBreakdown)
  .map(([key, value]) => `  - ${key}: ${value}`)
  .join('\n')}

Paper Trade Details:
  - Virtual Amount: $${details.virtualAmount.toFixed(2)} (${(details.virtualAmount / initialBalance * 100).toFixed(1)}% of portfolio)
  - Shares Purchased: ${details.shares.toFixed(2)}
  - Potential Payout: $${details.potentialPayout.toFixed(2)} (if ${details.outcome} wins)
  - Risk: $${details.risk.toFixed(2)} (if ${details.outcome} loses)
════════════════════════════════════════════
`;

  logger.info(tradeLog);
}
