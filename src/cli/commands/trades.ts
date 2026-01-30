/**
 * Trades Command
 * View or export trades
 */

import { initializeDatabase } from '../../models/database.js';
import { getAllPaperTrades } from '../../models/paperTrade.js';
import { getAllRealTrades } from '../../models/realTrade.js';
import { CONFIG } from '../../config/settings.js';
import fs from 'fs';
import path from 'path';

export async function tradesCommand(options: string[]): Promise<void> {
  // Initialize database
  initializeDatabase();
  
  // Check if export mode
  if (options.includes('export')) {
    await exportTrades();
    return;
  }
  
  // Get limit
  let limit = 20;
  const limitIndex = options.indexOf('--limit');
  if (limitIndex >= 0 && options[limitIndex + 1]) {
    limit = parseInt(options[limitIndex + 1], 10);
    if (isNaN(limit) || limit < 1) {
      console.error('❌ Invalid limit value. Using default: 20');
      limit = 20;
    }
  }
  
  console.log(`\n🐋 Recent Trades (Last ${limit})\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Get paper trades
  const paperTrades = getAllPaperTrades(limit);
  console.log('💰 Paper Trades:\n');
  
  if (paperTrades.length === 0) {
    console.log('  No paper trades yet.\n');
  } else {
    for (const trade of paperTrades) {
      const pnl = trade.pnl !== undefined && trade.pnl !== null 
        ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`
        : 'N/A';
      const statusIcon = getStatusIcon(trade.status);
      
      console.log(`  ${statusIcon} ${trade.status.padEnd(10)} | ${trade.market_title.substring(0, 50)}`);
      console.log(`     Outcome: ${trade.outcome} @ $${trade.entry_price.toFixed(3)} | Amount: $${trade.virtual_amount.toFixed(2)} | P&L: ${pnl}`);
      console.log(`     Confidence: ${trade.confidence_score}% | Date: ${new Date(trade.timestamp).toLocaleString()}`);
      console.log('');
    }
  }
  
  // Get real trades if enabled
  if (CONFIG.REAL_TRADING_ENABLED) {
    const realTrades = getAllRealTrades(limit);
    console.log('💵 Real Trades:\n');
    
    if (realTrades.length === 0) {
      console.log('  No real trades yet.\n');
    } else {
      for (const trade of realTrades) {
        const pnl = trade.pnl !== undefined && trade.pnl !== null 
          ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`
          : 'N/A';
        const statusIcon = getStatusIcon(trade.status);
        
        console.log(`  ${statusIcon} ${trade.status.padEnd(10)} | ${trade.market_title.substring(0, 50)}`);
        console.log(`     Outcome: ${trade.outcome} @ $${trade.entry_price.toFixed(3)} | Amount: $${trade.amount_usd.toFixed(2)} | P&L: ${pnl}`);
        console.log(`     Confidence: ${trade.confidence_score}% | Date: ${new Date(trade.timestamp).toLocaleString()}`);
        if (trade.order_id) {
          console.log(`     Order ID: ${trade.order_id}`);
        }
        console.log('');
      }
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function exportTrades(): Promise<void> {
  console.log('\n📊 Exporting trades to CSV...\n');
  
  // Get all trades
  const paperTrades = getAllPaperTrades(10000);
  const realTrades = CONFIG.REAL_TRADING_ENABLED ? getAllRealTrades(10000) : [];
  
  // Create export directory
  const exportDir = path.join(CONFIG.DATA_DIR, 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  
  // Export paper trades
  if (paperTrades.length > 0) {
    const paperCsvPath = path.join(exportDir, `paper-trades-${timestamp}.csv`);
    const paperCsv = [
      'ID,Triggered By,Market,Outcome,Entry Price,Amount,Shares,Status,Exit Price,P&L,Confidence,Timestamp',
      ...paperTrades.map(t => 
        `"${t.id}","${t.triggered_by}","${t.market_title}","${t.outcome}",${t.entry_price},${t.virtual_amount},${t.shares},"${t.status}",${t.exit_price || ''},${t.pnl || ''},${t.confidence_score},"${t.timestamp}"`
      ),
    ].join('\n');
    
    fs.writeFileSync(paperCsvPath, paperCsv);
    console.log(`✅ Exported ${paperTrades.length} paper trades to: ${paperCsvPath}`);
  } else {
    console.log('  No paper trades to export.');
  }
  
  // Export real trades
  if (realTrades.length > 0) {
    const realCsvPath = path.join(exportDir, `real-trades-${timestamp}.csv`);
    const realCsv = [
      'ID,Triggered By,Market,Outcome,Entry Price,Amount,Shares,Status,Order ID,Exit Price,P&L,Fee Paid,Confidence,Timestamp',
      ...realTrades.map(t => 
        `"${t.id}","${t.triggered_by}","${t.market_title}","${t.outcome}",${t.entry_price},${t.amount_usd},${t.shares},"${t.status}","${t.order_id || ''}",${t.exit_price || ''},${t.pnl || ''},${t.fee_paid || ''},${t.confidence_score},"${t.timestamp}"`
      ),
    ].join('\n');
    
    fs.writeFileSync(realCsvPath, realCsv);
    console.log(`✅ Exported ${realTrades.length} real trades to: ${realCsvPath}`);
  } else if (CONFIG.REAL_TRADING_ENABLED) {
    console.log('  No real trades to export.');
  }
  
  console.log('');
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'OPEN':
    case 'PENDING':
      return '⏳';
    case 'WON':
      return '✅';
    case 'LOST':
      return '❌';
    case 'CANCELLED':
      return '🚫';
    case 'CLOSED':
      return '🔒';
    default:
      return '📊';
  }
}
