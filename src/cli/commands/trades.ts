import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import fs from 'fs';
import { initializeDatabase } from '../../models/database.js';
import { getAllPaperTrades, PaperTrade } from '../../models/paperTrade.js';
import { formatUSD, timeAgo, truncateAddress } from '../../utils/helpers.js';

export const tradesCommand = new Command('trades')
  .description('Manage and view paper trades')
  .option('-s, --status <status>', 'Filter by status: WON, LOST, CANCELLED, OPEN')
  .option('-f, --from <date>', 'Start date (YYYY-MM-DD)')
  .option('-t, --to <date>', 'End date (YYYY-MM-DD)')
  .option('-l, --limit <number>', 'Number of results', '20')
  .action(async (options) => {
    try {
      initializeDatabase();
      
      // Get all trades
      let trades = getAllPaperTrades(1000);
      
      // Apply filters
      if (options.status) {
        const status = options.status.toUpperCase();
        trades = trades.filter(t => t.status === status);
      }
      
      if (options.from) {
        const fromDate = new Date(options.from).getTime();
        trades = trades.filter(t => new Date(t.timestamp).getTime() >= fromDate);
      }
      
      if (options.to) {
        const toDate = new Date(options.to).getTime() + 24 * 60 * 60 * 1000; // Include full day
        trades = trades.filter(t => new Date(t.timestamp).getTime() < toDate);
      }
      
      // Limit results
      const limit = parseInt(options.limit);
      const displayTrades = trades.slice(0, limit);
      
      // Calculate summary stats
      const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const won = trades.filter(t => t.status === 'WON').length;
      const lost = trades.filter(t => t.status === 'LOST').length;
      
      // Display table
      const statusText = options.status ? ` (${options.status.toUpperCase()})` : '';
      console.log();
      console.log(chalk.bold.cyan(`PAPER TRADES${statusText}`));
      console.log(chalk.gray('─'.repeat(100)));
      
      if (displayTrades.length === 0) {
        console.log(chalk.yellow('No trades found matching filters.'));
        console.log();
        return;
      }
      
      const table = new Table({
        head: [
          chalk.cyan('ID'),
          chalk.cyan('Market'),
          chalk.cyan('Outcome'),
          chalk.cyan('Entry'),
          chalk.cyan('P&L'),
          chalk.cyan('Status'),
          chalk.cyan('Date'),
        ],
        colWidths: [12, 35, 10, 8, 12, 11, 12],
        style: { head: [], border: ['gray'] },
      });
      
      for (const trade of displayTrades) {
        const id = trade.id.substring(0, 10) + '..';
        const market = trade.market_title.length > 32 
          ? trade.market_title.substring(0, 29) + '...' 
          : trade.market_title;
        const outcome = trade.outcome;
        const entry = `$${trade.entry_price.toFixed(2)}`;
        
        let pnl = '-';
        let pnlColor = chalk.gray;
        if (trade.pnl !== null && trade.pnl !== undefined) {
          const sign = trade.pnl >= 0 ? '+' : '';
          pnl = `${sign}${formatUSD(trade.pnl)}`;
          pnlColor = trade.pnl >= 0 ? chalk.green : chalk.red;
        }
        
        let statusText = trade.status;
        let statusColor = chalk.gray;
        if (trade.status === 'WON') {
          statusColor = chalk.green;
        } else if (trade.status === 'LOST') {
          statusColor = chalk.red;
        } else if (trade.status === 'CANCELLED') {
          statusColor = chalk.yellow;
        } else if (trade.status === 'OPEN') {
          statusColor = chalk.blue;
        }
        
        const date = timeAgo(new Date(trade.timestamp).getTime());
        
        table.push([
          chalk.gray(id),
          chalk.white(market),
          chalk.white(outcome),
          chalk.white(entry),
          pnlColor(pnl),
          statusColor(statusText),
          chalk.gray(date),
        ]);
      }
      
      console.log(table.toString());
      
      // Summary footer
      console.log(chalk.gray('─'.repeat(100)));
      const pnlColor = totalPnl >= 0 ? chalk.green : chalk.red;
      const pnlSign = totalPnl >= 0 ? '+' : '';
      console.log(chalk.white(`Showing ${displayTrades.length} of ${trades.length} | W/L: ${won}/${lost} | Total P&L: ${pnlColor(pnlSign + formatUSD(totalPnl))}`));
      
      if (trades.length > limit) {
        console.log(chalk.gray(`Use --limit ${trades.length} to show all results`));
      }
      
      console.log(chalk.gray(`Use 'whale-scout trades view <id>' for detailed trade information`));
      console.log();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('Error fetching trades:'), errorMessage);
      process.exit(1);
    }
  });

// View single trade details
tradesCommand
  .command('view <id>')
  .description('View detailed information for a specific trade')
  .action(async (id: string) => {
    try {
      initializeDatabase();
      
      // Find trade by ID (support partial ID)
      const trades = getAllPaperTrades(1000);
      const trade = trades.find(t => t.id.startsWith(id) || t.id === id);
      
      if (!trade) {
        console.log(chalk.red(`Trade not found: ${id}`));
        console.log(chalk.gray('Use "whale-scout trades" to list all trades'));
        process.exit(1);
      }
      
      // Display detailed trade info
      console.log();
      console.log(chalk.bold.cyan('═'.repeat(70)));
      console.log(chalk.bold.white('                  PAPER TRADE DETAILS'));
      console.log(chalk.bold.cyan('═'.repeat(70)));
      console.log();
      
      // Trade ID and Status
      let statusColor = chalk.gray;
      let statusEmoji = '';
      if (trade.status === 'WON') {
        statusColor = chalk.green;
        statusEmoji = ' ✅';
      } else if (trade.status === 'LOST') {
        statusColor = chalk.red;
        statusEmoji = ' ❌';
      } else if (trade.status === 'CANCELLED') {
        statusColor = chalk.yellow;
        statusEmoji = ' ⚠️';
      } else if (trade.status === 'OPEN') {
        statusColor = chalk.blue;
        statusEmoji = ' 🔵';
      }
      
      console.log(chalk.white('Trade ID:     ') + chalk.gray(trade.id));
      console.log(chalk.white('Status:       ') + statusColor(trade.status + statusEmoji));
      
      if (trade.pnl !== null && trade.pnl !== undefined) {
        const pnlColor = trade.pnl >= 0 ? chalk.green : chalk.red;
        const pnlSign = trade.pnl >= 0 ? '+' : '';
        const roi = trade.virtual_amount > 0 ? ((trade.pnl / trade.virtual_amount) * 100) : 0;
        const roiSign = roi >= 0 ? '+' : '';
        console.log(chalk.white('Outcome:      ') + pnlColor(`${pnlSign}${formatUSD(trade.pnl)} (${roiSign}${roi.toFixed(1)}% ROI)`));
      }
      
      console.log();
      console.log(chalk.gray('─'.repeat(70)));
      console.log(chalk.bold.white('MARKET INFORMATION'));
      console.log(chalk.gray('─'.repeat(70)));
      console.log(chalk.white('Title:        ') + chalk.gray(trade.market_title));
      console.log(chalk.white('Condition ID: ') + chalk.gray(trade.market_id));
      console.log(chalk.white('Outcome:      ') + chalk.cyan(trade.outcome));
      
      console.log();
      console.log(chalk.gray('─'.repeat(70)));
      console.log(chalk.bold.white('TRADE EXECUTION'));
      console.log(chalk.gray('─'.repeat(70)));
      console.log(chalk.white('Entry Price:  ') + chalk.cyan(`$${trade.entry_price.toFixed(4)}`));
      
      if (trade.exit_price !== null && trade.exit_price !== undefined) {
        console.log(chalk.white('Exit Price:   ') + chalk.cyan(`$${trade.exit_price.toFixed(4)}`));
      }
      
      console.log(chalk.white('Shares:       ') + chalk.gray(trade.shares.toFixed(2)));
      console.log(chalk.white('Amount:       ') + chalk.cyan(formatUSD(trade.virtual_amount)));
      
      console.log();
      console.log(chalk.gray('─'.repeat(70)));
      console.log(chalk.bold.white('TRIGGER INFORMATION'));
      console.log(chalk.gray('─'.repeat(70)));
      console.log(chalk.white('Triggered By: ') + chalk.gray(trade.triggered_by));
      console.log(chalk.white('Confidence:   ') + chalk.cyan(`${trade.confidence_score.toFixed(0)}%`));
      
      console.log();
      console.log(chalk.gray('─'.repeat(70)));
      console.log(chalk.bold.white('TIMESTAMPS'));
      console.log(chalk.gray('─'.repeat(70)));
      const openDate = new Date(trade.timestamp);
      console.log(chalk.white('Opened:       ') + chalk.gray(openDate.toISOString().replace('T', ' ').substring(0, 19)));
      console.log(chalk.white('               ') + chalk.gray(`(${timeAgo(openDate.getTime())})`));
      
      console.log(chalk.bold.cyan('═'.repeat(70)));
      console.log();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('Error viewing trade:'), errorMessage);
      process.exit(1);
    }
  });

// Export trades to CSV
tradesCommand
  .command('export')
  .description('Export trades to CSV file')
  .option('-o, --output <file>', 'Output file path', 'trades.csv')
  .option('-s, --status <status>', 'Filter by status: WON, LOST, CANCELLED, OPEN')
  .option('-f, --from <date>', 'Start date (YYYY-MM-DD)')
  .option('-t, --to <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    try {
      initializeDatabase();
      
      // Get all trades
      let trades = getAllPaperTrades(10000);
      
      // Apply filters
      if (options.status) {
        const status = options.status.toUpperCase();
        trades = trades.filter(t => t.status === status);
      }
      
      if (options.from) {
        const fromDate = new Date(options.from).getTime();
        trades = trades.filter(t => new Date(t.timestamp).getTime() >= fromDate);
      }
      
      if (options.to) {
        const toDate = new Date(options.to).getTime() + 24 * 60 * 60 * 1000;
        trades = trades.filter(t => new Date(t.timestamp).getTime() < toDate);
      }
      
      if (trades.length === 0) {
        console.log(chalk.yellow('No trades found matching filters.'));
        return;
      }
      
      // Build CSV
      const headers = [
        'id',
        'status',
        'market_title',
        'outcome',
        'entry_price',
        'exit_price',
        'pnl',
        'pnl_percent',
        'confidence',
        'triggered_by',
        'timestamp',
      ];
      
      const csvLines = [headers.join(',')];
      
      for (const trade of trades) {
        const pnlPercent = trade.pnl && trade.virtual_amount 
          ? ((trade.pnl / trade.virtual_amount) * 100).toFixed(2)
          : '0';
        
        const row = [
          trade.id,
          trade.status,
          `"${trade.market_title.replace(/"/g, '""')}"`, // Escape quotes in title
          trade.outcome,
          trade.entry_price.toFixed(4),
          trade.exit_price?.toFixed(4) || '',
          trade.pnl?.toFixed(2) || '',
          pnlPercent,
          trade.confidence_score.toFixed(0),
          trade.triggered_by,
          trade.timestamp,
        ];
        
        csvLines.push(row.join(','));
      }
      
      // Write to file
      fs.writeFileSync(options.output, csvLines.join('\n'), 'utf-8');
      
      console.log(chalk.green(`✓ Exported ${trades.length} trades to ${options.output}`));
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('Error exporting trades:'), errorMessage);
      process.exit(1);
    }
  });
