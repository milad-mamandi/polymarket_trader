-- Reset Paper Trading Database
-- WARNING: This will delete ALL paper trades and reset your trading history!
-- Run with: sqlite3 data/whale_bot.db < scripts/reset_paper_trades.sql

DELETE FROM paper_trades;

-- Verify deletion
SELECT 'Paper trades deleted. Count: ' || COUNT(*) as result FROM paper_trades;

-- Show initial state
SELECT 'Ready for fresh start with initial balance from config.' as status;
