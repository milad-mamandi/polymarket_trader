import { Command } from 'commander';
import chalk from 'chalk';
import { getDashboardServer } from '../../web/server/index.js';
import { logger } from '../../utils/logger.js';
import { CONFIG } from '../../config/settings.js';

/**
 * Dashboard command - Start web dashboard
 */
export const dashboardCommand = new Command('dashboard')
  .description('Start the web dashboard server')
  .option('-p, --port <number>', 'Port to run dashboard on', CONFIG.DASHBOARD_PORT.toString())
  .option('--no-auth', 'Disable authentication (dev only)')
  .action(async (options) => {
    try {
      if (!CONFIG.DASHBOARD_ENABLED) {
        console.log(chalk.yellow('⚠️  Dashboard is disabled in configuration'));
        console.log(chalk.gray('Set DASHBOARD_ENABLED=true in .env to enable'));
        process.exit(1);
      }

      const port = parseInt(options.port) || CONFIG.DASHBOARD_PORT;

      console.log(chalk.bold.blue('\n🚀 Starting Whale Scout Dashboard\n'));
      console.log(chalk.gray('━'.repeat(50)));
      console.log(chalk.white('  Port:'), chalk.cyan(port));
      console.log(chalk.white('  Auth:'), options.auth ? chalk.green('Enabled') : chalk.yellow('Disabled'));
      console.log(chalk.gray('━'.repeat(50)) + '\n');

      // Start dashboard server
      const server = getDashboardServer(port);
      await server.start();

      console.log(chalk.green('✓ Dashboard is running!'));
      console.log(chalk.gray('\n  Open in browser: ') + chalk.cyan(`http://localhost:${port}`));
      console.log(chalk.gray('  Press Ctrl+C to stop\n'));

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n\n⏳ Shutting down dashboard...'));
        await server.stop();
        console.log(chalk.green('✓ Dashboard stopped'));
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await server.stop();
        process.exit(0);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Dashboard error: ${errorMessage}`);
      console.error(chalk.red(`\n❌ Error: ${errorMessage}\n`));
      process.exit(1);
    }
  });
