import chalk from 'chalk';
import Table from 'cli-table3';
import { truncateAddress, formatUSD, formatPercent, timeAgo } from './helpers.js';

/**
 * Terminal display utilities for the dashboard
 */

/**
 * Display main header
 */
export function displayHeader(uptime: string): void {
  console.clear();
  console.log(chalk.bold.cyan('╔═══════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold.white('                   🐋 POLYMARKET WHALE SCOUT v1.0                      ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╠═══════════════════════════════════════════════════════════════════════╣'));
  console.log(chalk.bold.cyan('║') + chalk.white(` Status: ${chalk.green('RUNNING')}          Mode: ${chalk.yellow('PAPER TRADING')}           Uptime: ${uptime}`) + ' '.repeat(Math.max(0, 71 - 55 - uptime.length)) + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════════════════════════════╝'));
  console.log();
}

/**
 * Display watched wallets table
 */
export function displayWatchedWallets(wallets: any[]): void {
  if (wallets.length === 0) {
    console.log(chalk.yellow('No wallets being watched yet.\n'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('Address'),
      chalk.bold('Type'),
      chalk.bold('Score'),
      chalk.bold('Volume'),
      chalk.bold('W/L'),
    ],
    colWidths: [18, 15, 8, 15, 10],
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
  });

  for (const wallet of wallets.slice(0, 10)) {
    const type = [];
    if (wallet.is_whale) type.push('Whale');
    if (wallet.is_new_suspicious) type.push('New');
    
    const winRate = wallet.win_count + wallet.loss_count > 0
      ? (wallet.win_count / (wallet.win_count + wallet.loss_count) * 100).toFixed(0)
      : 'N/A';
    
    table.push([
      truncateAddress(wallet.address),
      type.join('+') || 'Tracked',
      wallet.suspicion_score.toFixed(0),
      formatUSD(wallet.total_volume),
      `${wallet.win_count}/${wallet.win_count + wallet.loss_count} (${winRate}%)`,
    ]);
  }

  console.log(chalk.bold.white('WATCHED WALLETS') + chalk.gray(` (${wallets.length} total)`));
  console.log(table.toString());
  console.log();
}

/**
 * Display recent signals
 */
export function displayRecentSignals(signals: any[]): void {
  if (signals.length === 0) {
    console.log(chalk.yellow('No recent signals.\n'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('Time'),
      chalk.bold('Wallet'),
      chalk.bold('Market'),
      chalk.bold('Bet'),
      chalk.bold('Conf'),
      chalk.bold('Status'),
    ],
    colWidths: [10, 12, 25, 15, 7, 10],
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
  });

  for (const signal of signals.slice(0, 5)) {
    const statusColor = signal.executed ? chalk.green : chalk.gray;
    const statusText = signal.executed ? 'EXECUTED' : 'SKIPPED';
    
    table.push([
      timeAgo(signal.timestamp),
      truncateAddress(signal.wallet),
      signal.market.substring(0, 23) + '...',
      `${signal.outcome} @ ${signal.price.toFixed(2)}`,
      `${signal.confidence}%`,
      statusColor(statusText),
    ]);
  }

  console.log(chalk.bold.white('RECENT SIGNALS') + chalk.gray(' (Last 1hr)'));
  console.log(table.toString());
  console.log();
}

/**
 * Display paper portfolio status
 */
export function displayPortfolio(portfolio: any): void {
  const pnlColor = portfolio.pnl >= 0 ? chalk.green : chalk.red;
  const pnlSign = portfolio.pnl >= 0 ? '+' : '';
  
  console.log(chalk.bold.white('PAPER PORTFOLIO'));
  console.log(chalk.gray('─'.repeat(75)));
  
  const portfolioLine = 
    `Starting Balance: ${chalk.white(formatUSD(portfolio.startingBalance))}    ` +
    `Current: ${chalk.white(formatUSD(portfolio.totalValue))}    ` +
    `P&L: ${pnlColor(pnlSign + formatUSD(portfolio.pnl))}`;
  
  const statsLine = 
    `Open Positions: ${chalk.white(portfolio.openPositions)}               ` +
    `Win Rate: ${chalk.white(formatPercent(portfolio.winRate))}          ` +
    `ROI: ${pnlColor(pnlSign + portfolio.pnlPercent.toFixed(2) + '%')}`;
  
  console.log(portfolioLine);
  console.log(statsLine);
  console.log(chalk.gray('─'.repeat(75)));
  console.log();
}

/**
 * Display a whale alert
 */
export function displayWhaleAlert(params: {
  wallet: string;
  walletType: string;
  score: number;
  market: string;
  outcome: string;
  price: number;
  size: number;
}): void {
  console.log(chalk.bold.yellow('\n🐋 WHALE ALERT!'));
  console.log(chalk.gray('─'.repeat(75)));
  console.log(chalk.white(`Wallet: ${chalk.cyan(truncateAddress(params.wallet))} | Type: ${params.walletType} | Score: ${params.score}`));
  console.log(chalk.white(`Market: ${params.market.substring(0, 60)}...`));
  console.log(chalk.white(`Bet: ${chalk.bold(params.outcome)} @ ${params.price.toFixed(4)} | Size: ${chalk.bold(formatUSD(params.size))}`));
  console.log(chalk.gray('─'.repeat(75)));
  console.log();
}

/**
 * Display a trade execution
 */
export function displayTradeExecution(params: {
  wallet: string;
  market: string;
  outcome: string;
  price: number;
  amount: number;
  confidence: number;
}): void {
  console.log(chalk.bold.green('\n✓ PAPER TRADE EXECUTED'));
  console.log(chalk.gray('─'.repeat(75)));
  console.log(chalk.white(`Following: ${chalk.cyan(truncateAddress(params.wallet))}`));
  console.log(chalk.white(`Market: ${params.market.substring(0, 60)}...`));
  console.log(chalk.white(`Position: ${chalk.bold(params.outcome)} @ ${params.price.toFixed(4)} | Amount: ${chalk.bold(formatUSD(params.amount))}`));
  console.log(chalk.white(`Confidence: ${chalk.bold(params.confidence + '%')}`));
  console.log(chalk.gray('─'.repeat(75)));
  console.log();
}

/**
 * Display error message
 */
export function displayError(message: string): void {
  console.log(chalk.bold.red('\n⚠️  ERROR'));
  console.log(chalk.red(message));
  console.log();
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  console.log(chalk.cyan(`ℹ ${message}`));
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}
