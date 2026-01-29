#!/usr/bin/env node
import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { statsCommand } from './commands/stats.js';
import { tradesCommand } from './commands/trades.js';
import { configCommand } from './commands/config.js';
import { resetCommand } from './commands/reset.js';
import { dashboardCommand } from './commands/dashboard.js';

const program = new Command();

program
  .name('whale-scout')
  .description('Polymarket Whale Scout - Track whale wallets and paper trade their moves')
  .version('1.1.0');

// Register commands
program.addCommand(startCommand);
program.addCommand(statsCommand);
program.addCommand(tradesCommand);
program.addCommand(configCommand);
program.addCommand(resetCommand);
program.addCommand(dashboardCommand);

// Default to start if no command specified
if (process.argv.length === 2) {
  process.argv.push('start');
}

program.parse();
