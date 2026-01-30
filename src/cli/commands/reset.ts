/**
 * Reset Command
 * Reset all trading data (paper and real trades)
 */

import { initializeDatabase, resetTradingData } from '../../models/database.js';
import { tradeEngine } from '../../services/tradeEngine.js';
import { CONFIG } from '../../config/settings.js';

export async function resetCommand(options: string[]): Promise<void> {
  // Initialize database
  initializeDatabase();
  
  console.log('\n⚠️  Reset Trading Data\n');
  console.log('This will delete:');
  console.log('  - All paper trades');
  console.log('  - All real trades');
  console.log('  - Performance history');
  console.log('');
  console.log('Wallet history will be preserved.');
  console.log('');
  
  // Confirm action (require --force flag)
  if (!options.includes('--force')) {
    console.error('❌ This is a destructive action. Use --force to confirm:');
    console.error('   whale-scout reset --force');
    process.exit(1);
  }
  
  try {
    // Reset database
    resetTradingData();
    
    // Reset paper trading balance
    tradeEngine.reset();
    
    console.log('✅ Trading data reset successfully');
    console.log(`   Paper balance reset to $${CONFIG.INITIAL_PAPER_BALANCE.toFixed(2)}`);
    console.log('');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to reset data: ${errorMessage}`);
    process.exit(1);
  }
}
