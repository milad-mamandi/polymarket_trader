#!/usr/bin/env node

/**
 * Polymarket Whale Scout - CLI
 * Command-line interface for managing the bot
 */

import { logger } from '../utils/logger.js';

// Import commands
import { startCommand } from './commands/start.js';
import { statsCommand } from './commands/stats.js';
import { tradesCommand } from './commands/trades.js';
import { configCommand } from './commands/config.js';
import { dashboardCommand } from './commands/dashboard.js';
import { resetCommand } from './commands/reset.js';
import { passwordCommand } from './commands/password.js';
import { stopCommand } from './commands/stop.js';

const COMMANDS = {
  start: startCommand,
  stop: stopCommand,
  stats: statsCommand,
  trades: tradesCommand,
  config: configCommand,
  dashboard: dashboardCommand,
  reset: resetCommand,
  password: passwordCommand,
};

function showHelp() {
  console.log(`
🐋 Polymarket Whale Scout - CLI

Usage: whale-scout <command> [options]

Commands:
  start              Start the bot with monitoring and dashboard
  stop [options]     Stop all running Whale Scout instances
    --force, -f      Force kill (immediate termination)
    --quiet, -q      Minimal output
  stats              Show bot statistics and performance
  trades [options]   View or export trades
    --limit <n>      Show last n trades (default: 20)
    export           Export all trades to CSV
  config             Interactive configuration editor
  dashboard          Start web dashboard only (bot must run separately)
  reset              Reset all trading data (paper/real trades)
  password [cmd]     Manage dashboard password
    set              Interactively set a new hashed password
    hash <password>  Generate bcrypt hash from password
    verify <pass>    Verify password against stored value

Options:
  --help, -h         Show this help message
  --version, -v      Show version

Examples:
  whale-scout start                  # Start bot
  whale-scout stop                   # Stop all instances gracefully
  whale-scout stop --force           # Force kill all instances
  whale-scout stats                  # View statistics
  whale-scout trades --limit 50      # Show last 50 trades
  whale-scout trades export          # Export trades to CSV
  whale-scout dashboard              # Start dashboard only
  whale-scout config                 # Edit configuration
  whale-scout reset                  # Reset trading data
  whale-scout password set           # Set new password interactively
  whale-scout password hash MyPass   # Generate password hash

For more information, visit: https://github.com/your-repo/whale-scout
`);
}

function showVersion() {
  console.log('Polymarket Whale Scout v2.0.0');
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle no arguments
  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }
  
  const command = args[0].toLowerCase();
  const options = args.slice(1);
  
  // Handle help and version flags
  if (command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }
  
  if (command === '--version' || command === '-v') {
    showVersion();
    process.exit(0);
  }
  
  // Execute command
  const commandFn = COMMANDS[command as keyof typeof COMMANDS];
  
  if (!commandFn) {
    console.error(`❌ Unknown command: ${command}`);
    console.log('Run "whale-scout --help" for usage information.');
    process.exit(1);
  }
  
  try {
    await commandFn(options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Command failed: ${errorMessage}`);
    console.error(`❌ Error: ${errorMessage}`);
    process.exit(1);
  }
}

// Run CLI
main().catch(err => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(`❌ Fatal error: ${errorMessage}`);
  process.exit(1);
});
