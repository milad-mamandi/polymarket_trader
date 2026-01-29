import { Command } from 'commander';
import chalk from 'chalk';
import { db } from '../../models/database.js';
import { prompt, select } from '../utils/prompts.js';
import { CONFIG } from '../../config/settings.js';

interface ResetOption {
  id: string;
  label: string;
  description: string;
  tables: string[];
}

const RESET_OPTIONS: ResetOption[] = [
  {
    id: 'full',
    label: 'Full Database Reset',
    description: 'Delete ALL data (wallets, trades, paper trades, performance)',
    tables: ['wallets', 'wallet_trades', 'paper_trades', 'performance', 'market_cache']
  },
  {
    id: 'paper',
    label: 'Paper Trades Only',
    description: 'Delete all paper trading records and reset balance',
    tables: ['paper_trades']
  },
  {
    id: 'archived',
    label: 'Archived Wallet Trades',
    description: 'Delete only archived wallet trades (keeps active trades)',
    tables: [] // Custom SQL needed
  },
  {
    id: 'performance',
    label: 'Performance Metrics',
    description: 'Delete all performance tracking data',
    tables: ['performance']
  },
  {
    id: 'cache',
    label: 'Market Cache',
    description: 'Clear cached market data',
    tables: ['market_cache']
  }
];

/**
 * Display reset menu
 */
function displayResetMenu(): void {
  console.clear();
  console.log(chalk.bold.red('\n⚠️  Database Reset Tool\n'));
  console.log(chalk.yellow('WARNING: These operations cannot be undone!\n'));
  console.log(chalk.gray('━'.repeat(80)) + '\n');
  
  RESET_OPTIONS.forEach((option, index) => {
    console.log(chalk.bold.white(`${index + 1}. ${option.label}`));
    console.log(chalk.gray(`   ${option.description}\n`));
  });
  
  console.log(chalk.gray('━'.repeat(80)));
  console.log(chalk.gray('\n0: Cancel and exit\n'));
}

/**
 * Reset specific tables
 */
function resetTables(tables: string[]): void {
  for (const table of tables) {
    try {
      db.prepare(`DELETE FROM ${table}`).run();
      console.log(chalk.green(`  ✓ Cleared table: ${table}`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`  ✗ Failed to clear ${table}: ${errorMessage}`));
    }
  }
}

/**
 * Reset archived wallet trades only
 */
function resetArchivedTrades(): void {
  try {
    const result = db.prepare('DELETE FROM wallet_trades WHERE archived = 1').run();
    console.log(chalk.green(`  ✓ Deleted ${result.changes} archived wallet trades`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`  ✗ Failed to delete archived trades: ${errorMessage}`));
  }
}

/**
 * Reset paper trading balance
 */
function resetPaperBalance(): void {
  try {
    // Insert initial balance record
    db.prepare(`
      INSERT INTO performance (date, paper_balance, total_trades, winning_trades, losing_trades, total_pnl)
      VALUES (date('now'), ?, 0, 0, 0, 0)
      ON CONFLICT(date) DO UPDATE SET paper_balance = ?
    `).run(CONFIG.INITIAL_PAPER_BALANCE, CONFIG.INITIAL_PAPER_BALANCE);
    
    console.log(chalk.green(`  ✓ Reset paper trading balance to $${CONFIG.INITIAL_PAPER_BALANCE.toLocaleString()}`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`  ✗ Failed to reset balance: ${errorMessage}`));
  }
}

/**
 * Execute reset operation
 */
async function executeReset(option: ResetOption): Promise<void> {
  console.log(chalk.bold.yellow(`\n⚠️  You are about to: ${option.label}`));
  console.log(chalk.gray(option.description));
  console.log(chalk.red('\nThis action CANNOT be undone!\n'));
  
  const confirmation = await prompt('Type "CONFIRM" to proceed');
  
  if (confirmation !== 'CONFIRM') {
    console.log(chalk.gray('\nReset cancelled.'));
    return;
  }
  
  console.log(chalk.yellow('\n🗑️  Processing reset...\n'));
  
  // Handle special cases
  if (option.id === 'archived') {
    resetArchivedTrades();
  } else if (option.id === 'paper') {
    resetTables(option.tables);
    resetPaperBalance();
  } else if (option.id === 'full') {
    resetTables(option.tables);
    resetPaperBalance();
  } else {
    resetTables(option.tables);
  }
  
  console.log(chalk.green('\n✓ Reset completed successfully!'));
  
  if (option.id === 'full' || option.id === 'paper') {
    console.log(chalk.gray('\nRestart the bot to begin with fresh data.'));
  }
}

/**
 * Interactive reset menu
 */
async function resetInteractive(): Promise<void> {
  while (true) {
    displayResetMenu();
    
    const input = await prompt('Select reset option (0-' + RESET_OPTIONS.length + ')');
    const selection = parseInt(input);
    
    if (isNaN(selection) || selection < 0 || selection > RESET_OPTIONS.length) {
      console.log(chalk.red('\n❌ Invalid selection.'));
      await prompt('Press Enter to continue');
      continue;
    }
    
    if (selection === 0) {
      console.log(chalk.gray('\nNo changes made.'));
      break;
    }
    
    const option = RESET_OPTIONS[selection - 1];
    await executeReset(option);
    
    console.log('');
    await prompt('Press Enter to continue');
  }
}

/**
 * Quick reset command (non-interactive)
 */
async function resetQuick(type: string): Promise<void> {
  const option = RESET_OPTIONS.find(opt => opt.id === type);
  
  if (!option) {
    console.error(chalk.red(`\n❌ Unknown reset type: ${type}`));
    console.error(chalk.gray('Valid types: full, paper, archived, performance, cache'));
    process.exit(1);
  }
  
  await executeReset(option);
}

/**
 * Reset command export
 */
export const resetCommand = new Command('reset')
  .description('Reset database (interactive menu or direct)')
  .argument('[type]', 'Reset type: full, paper, archived, performance, cache')
  .action(async (type?: string) => {
    try {
      if (type) {
        await resetQuick(type);
      } else {
        await resetInteractive();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\n❌ Error: ${errorMessage}`));
      process.exit(1);
    }
  });
