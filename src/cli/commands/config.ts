import { Command } from 'commander';
import chalk from 'chalk';
import { readEnvFile, writeEnvFile, getEnvPath } from '../utils/envWriter.js';
import { prompt, select } from '../utils/prompts.js';

interface ConfigVar {
  key: string;
  type: 'number' | 'string' | 'boolean';
  category: string;
  description: string;
}

const EDITABLE_VARS: ConfigVar[] = [
  // WHALE DETECTION
  { key: 'WHALE_THRESHOLD_USD', type: 'number', category: 'WHALE DETECTION', description: 'Minimum USD size to flag as whale' },
  { key: 'NEW_WALLET_HOURS', type: 'number', category: 'WHALE DETECTION', description: 'Max wallet age (hours) to flag as suspicious' },
  
  // TRADING
  { key: 'MIN_CONFIDENCE_FOR_TRADE', type: 'number', category: 'TRADING', description: 'Minimum confidence score (0-100) to execute trade' },
  { key: 'INITIAL_PAPER_BALANCE', type: 'number', category: 'TRADING', description: 'Starting paper trading balance (USD)' },
  { key: 'MAX_POSITION_SIZE_PERCENT', type: 'number', category: 'TRADING', description: 'Max % of balance per trade' },
  
  // TIMING
  { key: 'TRADE_POLL_INTERVAL_MS', type: 'number', category: 'TIMING', description: 'How often to scan for new trades (ms)' },
  { key: 'RESOLUTION_CHECK_INTERVAL_MS', type: 'number', category: 'TIMING', description: 'How often to check for resolved markets (ms)' },
  
  // ERROR HANDLING
  { key: 'ERROR_LOG_LEVEL_422', type: 'string', category: 'ERROR HANDLING', description: 'Log level for 422 errors (error/warn/debug)' },
  { key: 'MARKET_AGE_THRESHOLD_DAYS', type: 'number', category: 'ERROR HANDLING', description: 'Days before archiving 422 error trades' },
  
  // NOTIFICATIONS
  { key: 'TELEGRAM_ENABLED', type: 'boolean', category: 'NOTIFICATIONS', description: 'Enable Telegram notifications' },
  { key: 'TELEGRAM_BOT_TOKEN', type: 'string', category: 'NOTIFICATIONS', description: 'Telegram bot API token' },
  { key: 'TELEGRAM_CHAT_ID', type: 'string', category: 'NOTIFICATIONS', description: 'Telegram chat ID for notifications' },
];

/**
 * Validate user input based on variable type
 */
function validateInput(value: string, type: string): boolean {
  if (value.trim() === '') return false;
  
  switch (type) {
    case 'number':
      return !isNaN(Number(value)) && Number(value) >= 0;
    case 'boolean':
      return value.toLowerCase() === 'true' || value.toLowerCase() === 'false';
    case 'string':
      return true;
    default:
      return false;
  }
}

/**
 * Format value for display
 */
function formatValue(value: string | undefined, type: string): string {
  if (!value) return chalk.gray('(not set)');
  
  switch (type) {
    case 'number':
      return chalk.cyan(Number(value).toLocaleString());
    case 'boolean':
      return value === 'true' ? chalk.green('true') : chalk.red('false');
    default:
      return chalk.yellow(value);
  }
}

/**
 * Display configuration menu
 */
function displayMenu(envVars: Map<string, string>): void {
  console.clear();
  console.log(chalk.bold.blue('\n🔧 Configuration Editor\n'));
  console.log(chalk.gray('━'.repeat(80)) + '\n');
  
  let currentCategory = '';
  let index = 1;
  
  for (const config of EDITABLE_VARS) {
    // Print category header
    if (config.category !== currentCategory) {
      if (currentCategory !== '') console.log('');
      console.log(chalk.bold.white(config.category));
      currentCategory = config.category;
    }
    
    const value = envVars.get(config.key);
    const formattedValue = formatValue(value, config.type);
    
    console.log(
      chalk.gray(`${index}.`.padEnd(4)) +
      chalk.white(config.key.padEnd(35)) +
      formattedValue
    );
    
    index++;
  }
  
  console.log('\n' + chalk.gray('━'.repeat(80)));
  console.log(chalk.gray('\nCommands:'));
  console.log(chalk.gray('  1-' + EDITABLE_VARS.length + ': Edit variable'));
  console.log(chalk.gray('  S: Save changes'));
  console.log(chalk.gray('  R: Reset to defaults (requires confirmation)'));
  console.log(chalk.gray('  Q: Quit without saving\n'));
}

/**
 * Interactive configuration editor
 */
async function editConfig(): Promise<void> {
  const envPath = getEnvPath();
  let envVars = readEnvFile(envPath);
  const originalVars = new Map(envVars);
  let hasChanges = false;
  
  while (true) {
    displayMenu(envVars);
    
    const input = await prompt('Enter command');
    const command = input.trim().toUpperCase();
    
    // Quit
    if (command === 'Q') {
      if (hasChanges) {
        console.log(chalk.yellow('\n⚠️  You have unsaved changes!'));
        const confirmQuit = await prompt('Quit without saving? (y/n)');
        if (confirmQuit.toLowerCase() !== 'y') continue;
      }
      console.log(chalk.gray('\nNo changes saved.'));
      break;
    }
    
    // Save
    if (command === 'S') {
      if (!hasChanges) {
        console.log(chalk.yellow('\n⚠️  No changes to save.'));
        await prompt('Press Enter to continue');
        continue;
      }
      
      writeEnvFile(envPath, envVars);
      
      const changedCount = Array.from(envVars.keys()).filter(
        key => envVars.get(key) !== originalVars.get(key)
      ).length;
      
      console.log(chalk.green(`\n✓ Saved ${changedCount} change(s) to .env`));
      console.log(chalk.gray('Restart the bot for changes to take effect.'));
      break;
    }
    
    // Reset to defaults
    if (command === 'R') {
      console.log(chalk.red('\n⚠️  WARNING: This will reset ALL configuration to defaults!'));
      const confirmReset = await prompt('Type "CONFIRM" to proceed');
      
      if (confirmReset === 'CONFIRM') {
        console.log(chalk.yellow('\n📋 Please manually restore defaults from .env.example'));
        console.log(chalk.gray('This feature requires .env.example file.'));
      } else {
        console.log(chalk.gray('\nReset cancelled.'));
      }
      
      await prompt('Press Enter to continue');
      continue;
    }
    
    // Edit variable by number
    const selection = parseInt(command);
    if (isNaN(selection) || selection < 1 || selection > EDITABLE_VARS.length) {
      console.log(chalk.red('\n❌ Invalid selection.'));
      await prompt('Press Enter to continue');
      continue;
    }
    
    const config = EDITABLE_VARS[selection - 1];
    const currentValue = envVars.get(config.key);
    
    console.log(chalk.bold(`\n📝 Editing: ${config.key}`));
    console.log(chalk.gray(config.description));
    console.log(chalk.gray(`Type: ${config.type}`));
    console.log(chalk.gray(`Current: ${currentValue || '(not set)'}\n`));
    
    const newValue = await prompt('Enter new value (or press Enter to cancel)');
    
    if (newValue.trim() === '') {
      console.log(chalk.gray('No changes made.'));
      await prompt('Press Enter to continue');
      continue;
    }
    
    if (!validateInput(newValue, config.type)) {
      console.log(chalk.red(`\n❌ Invalid value for type '${config.type}'.`));
      await prompt('Press Enter to continue');
      continue;
    }
    
    envVars.set(config.key, newValue.trim());
    hasChanges = true;
    
    console.log(chalk.green(`\n✓ Updated ${config.key} = ${newValue.trim()}`));
    console.log(chalk.gray('(Not saved yet - use "S" to save)'));
    await prompt('Press Enter to continue');
  }
}

/**
 * Config command export
 */
export const configCommand = new Command('config')
  .description('Edit bot configuration interactively')
  .action(async () => {
    try {
      await editConfig();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\n❌ Error: ${errorMessage}`));
      process.exit(1);
    }
  });
