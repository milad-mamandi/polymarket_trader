import winston from 'winston';
import { CONFIG } from '../config/settings.js';
import fs from 'fs';
import path from 'path';

// Ensure log directory exists
if (!fs.existsSync(CONFIG.LOG_DIR)) {
  fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
}

// Custom JSON replacer to handle circular references
const circularReplacer = () => {
  const seen = new WeakSet();
  return (key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  };
};

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length) {
      try {
        metaStr = JSON.stringify(meta, circularReplacer(), 2);
      } catch (err) {
        metaStr = '[Unable to serialize metadata]';
      }
    }
    return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: CONFIG.LOG_LEVEL,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    ...(CONFIG.LOG_TO_FILE
      ? [
          new winston.transports.File({
            filename: path.join(CONFIG.LOG_DIR, 'app.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: path.join(CONFIG.LOG_DIR, 'trades.log'),
            level: 'info',
            maxsize: 10485760,
            maxFiles: 5,
          }),
        ]
      : []),
  ],
});

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
  - Virtual Amount: $${details.virtualAmount.toFixed(2)} (${(details.virtualAmount / CONFIG.INITIAL_PAPER_BALANCE * 100).toFixed(1)}% of portfolio)
  - Shares Purchased: ${details.shares.toFixed(2)}
  - Potential Payout: $${details.potentialPayout.toFixed(2)} (if ${details.outcome} wins)
  - Risk: $${details.risk.toFixed(2)} (if ${details.outcome} loses)
════════════════════════════════════════════
`;

  logger.info(tradeLog);
}
