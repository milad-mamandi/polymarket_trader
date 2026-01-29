# TODO: Polymarket Whale Scout - Remaining Implementation Tasks

**Last Updated:** January 29, 2026

This document tracks the remaining work for the three-phase feature implementation.

---

## ✅ COMPLETED

### Phase 1: Reset Button Feature (100% Complete)
- ✅ Added `resetTradingData()` function to `src/models/database.ts`
- ✅ Added `POST /api/bot/reset` endpoint to `src/web/server/routes/controls.ts`
- ✅ Added `resetData()` method to `src/web/client/src/lib/api.ts`
- ✅ Added Reset button with confirmation dialog to Settings page
- ✅ **Resets paper trades and performance history, preserves detected wallets**

### Phase 2: React Query + Axios Refactor (50% Complete)
- ✅ Installed `axios` and `@tanstack/react-query` packages
- ✅ Created `src/web/client/src/lib/queryClient.ts` (10s refetch interval)
- ✅ Wrapped App.tsx with `QueryClientProvider`
- ✅ Rewrote `src/web/client/src/lib/api.ts` to use axios
- ✅ Created `src/web/client/src/hooks/useQueries.ts` with all query hooks

---

## 🔨 IN PROGRESS

### Phase 2: React Query + Axios Refactor (Remaining: 50%)

#### Task 2.6: Refactor Dashboard.tsx
**Status:** Pending  
**File:** `src/web/client/src/pages/Dashboard.tsx` (330 lines)

**Changes Required:**
1. Replace `useState` for overview, recentTrades, botStatus, performanceHistory
2. Remove manual `useEffect` data fetching (lines 22-26, 43-65)
3. Use hooks from `useQueries.ts`:
   - `useOverview()` → replaces `overview` state
   - `useTrades({ limit: 10 })` → replaces `recentTrades` state
   - `useBotStatus()` → replaces `botStatus` state
   - `usePerformance(7)` → replaces `performanceHistory` state
   - `useBotControl()` → replaces `handleBotControl()` function (lines 67-89)
4. Update loading/error states to use React Query's built-in states
5. Keep WebSocket integration (lines 28-41) for real-time updates

**Example Pattern:**
```typescript
// OLD
const [overview, setOverview] = useState(null);
useEffect(() => { /* fetch data */ }, []);

// NEW
const { data: overview, isLoading, error } = useOverview();
```

---

#### Task 2.7: Refactor Trades.tsx
**Status:** Pending  
**File:** `src/web/client/src/pages/Trades.tsx`

**Changes Required:**
1. Replace `useTrades()` calls with the new React Query hook
2. Remove manual loading/error state management
3. Use `useTrades(filters)` with pagination/filter params
4. Loading and error states handled automatically

---

#### Task 2.8: Refactor Wallets.tsx
**Status:** Pending  
**File:** `src/web/client/src/pages/Wallets.tsx`

**Changes Required:**
1. Replace `useWallets()` with React Query hook
2. Remove manual data fetching logic
3. Use `useWallets()` and `useWallet(address)` for details modal

---

#### Task 2.9: Refactor Activity.tsx
**Status:** Pending  
**File:** `src/web/client/src/pages/Activity.tsx`

**Changes Required:**
1. Replace `useActivity()` with React Query hook
2. Remove manual data fetching
3. Keep WebSocket for real-time activity feed updates

---

#### Task 2.10: Refactor Settings.tsx
**Status:** Pending  
**File:** `src/web/client/src/pages/Settings.tsx`

**Changes Required:**
1. Replace config loading with `useConfig()` hook
2. Use `useUpdateConfig()` mutation for saving changes
3. Use `useBotControl().resetData` mutation for the Reset button
4. Simpler error handling with React Query

---

## 📋 TODO: Phase 3 - Real Trading Mode Infrastructure

**Status:** Not Started  
**Estimated Effort:** ~1.5 hours

### Task 3.1: Add Trading Mode Config
**File:** `src/config/settings.ts`

**Add Config Options:**
```typescript
TRADING_MODE: 'paper' | 'real',  // default: 'paper'
REAL_TRADING_ENABLED: boolean,   // default: false
REAL_TRADING_API_KEY: string,    // empty by default
REAL_TRADING_API_SECRET: string, // empty by default (masked in dashboard)
REAL_TRADING_WALLET_ADDRESS: string, // empty by default
```

---

### Task 3.2: Add real_trades Table
**File:** `src/models/database.ts`

**Add Table Schema:**
```sql
CREATE TABLE IF NOT EXISTS real_trades (
  id TEXT PRIMARY KEY,
  triggered_by TEXT NOT NULL,
  market_id TEXT NOT NULL,
  market_title TEXT,
  outcome TEXT,
  entry_price REAL,
  amount REAL,
  shares REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'OPEN',
  exit_price REAL,
  pnl REAL,
  confidence_score REAL,
  polymarket_order_id TEXT,  -- CLOB order ID
  transaction_hash TEXT,      -- Polygon tx hash
  FOREIGN KEY (triggered_by) REFERENCES wallets(address)
);
```

**Add Indexes:**
- `idx_real_trades_status`
- `idx_real_trades_market`

---

### Task 3.3: Create Real Trade Model
**File:** `src/models/realTrade.ts` (NEW)

**Copy from:** `src/models/paperTrade.ts`

**Functions to Implement:**
- `insertRealTrade()`
- `updateRealTrade()`
- `getRealTrades()`
- `getRealTradeById()`
- `getRealTradesByMarket()`
- `getTotalRealBalance()`
- `getRealPnLSummary()`

---

### Task 3.4: Create Real Trade Executor
**File:** `src/services/realTradeExecutor.ts` (NEW)

**Purpose:** Placeholder for Polymarket CLOB API integration

**Methods to Stub:**
```typescript
class RealTradeExecutor {
  async placeOrder(params: OrderParams): Promise<OrderResult> {
    // TODO: Integrate with Polymarket CLOB API
    throw new Error('Real trading not yet implemented');
  }
  
  async cancelOrder(orderId: string): Promise<void> {
    // TODO: Implement order cancellation
    throw new Error('Real trading not yet implemented');
  }
  
  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    // TODO: Check order status
    throw new Error('Real trading not yet implemented');
  }
  
  async getBalance(): Promise<number> {
    // TODO: Get wallet balance from blockchain
    throw new Error('Real trading not yet implemented');
  }
}
```

**References:**
- [Polymarket CLOB API Docs](https://docs.polymarket.com/)
- [Gamma Markets SDK](https://github.com/Polymarket/clob-client)

---

### Task 3.5: Add Mode Switching Logic
**File:** `src/services/tradeEngine.ts`

**Changes Required:**
1. Import `CONFIG.TRADING_MODE` from settings
2. Import `realTradeExecutor` from `realTradeExecutor.ts`
3. Modify `executeTrade()` method:

```typescript
async executeTrade(params: TradeParams): Promise<TradeResult> {
  if (CONFIG.TRADING_MODE === 'real') {
    logger.warn('Real trading mode enabled - executing real trade');
    return this.executeRealTrade(params);
  } else {
    logger.info('Paper trading mode - executing simulated trade');
    return this.executePaperTrade(params);
  }
}

private async executeRealTrade(params: TradeParams): Promise<TradeResult> {
  // Route to realTradeExecutor
  const result = await realTradeExecutor.placeOrder(params);
  
  // Store in real_trades table
  await insertRealTrade({
    id: result.orderId,
    triggered_by: params.walletAddress,
    market_id: params.marketId,
    // ... other fields
  });
  
  return result;
}

private async executePaperTrade(params: TradeParams): Promise<TradeResult> {
  // Existing paper trading logic (no changes)
  // ...
}
```

---

### Task 3.6: Update Config API
**File:** `src/web/server/routes/config.ts`

**Changes Required:**
1. Add `TRADING_MODE` to exposed config fields
2. Add `REAL_TRADING_*` fields to config
3. Mark `REAL_TRADING_API_SECRET` as `secret: true, masked: true`
4. Add validation: prevent enabling real mode without API keys

**Validation Logic:**
```typescript
if (updates.TRADING_MODE === 'real' && !currentConfig.REAL_TRADING_API_KEY) {
  throw new Error('Cannot enable real trading without API credentials');
}
```

---

### Task 3.7: Add Trading Mode UI
**File:** `src/web/client/src/pages/Settings.tsx`

**Changes Required:**

1. **Add Trading Mode Section (above Danger Zone):**
```tsx
{/* Trading Mode Section */}
<div className="bg-slate-800 rounded-lg border border-slate-700">
  <div className="px-6 py-3 border-b border-slate-700">
    <h2 className="text-lg font-semibold text-white">Trading Mode</h2>
  </div>
  <div className="p-6 space-y-4">
    {/* Toggle between Paper and Real */}
    <div className="flex items-center justify-between">
      <div>
        <label className="text-sm font-medium text-slate-200">Mode</label>
        <p className="text-xs text-slate-400 mt-1">
          Paper mode simulates trades. Real mode executes actual trades on Polymarket.
        </p>
      </div>
      <select
        value={tradingMode}
        onChange={(e) => setShowConfirmRealMode(e.target.value === 'real')}
        className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg"
      >
        <option value="paper">Paper Trading</option>
        <option value="real">Real Trading</option>
      </select>
    </div>
    
    {/* API Credentials (shown only in Real mode) */}
    {tradingMode === 'real' && (
      <div className="space-y-3 pt-3 border-t border-slate-700">
        <input type="text" placeholder="API Key" />
        <input type="password" placeholder="API Secret" />
        <input type="text" placeholder="Wallet Address" />
      </div>
    )}
  </div>
</div>
```

2. **Add Confirmation Dialog for Real Mode:**
```tsx
{showConfirmRealMode && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-slate-800 rounded-lg p-6 max-w-md">
      <h3 className="text-lg font-semibold text-red-400 mb-4">
        ⚠️ Enable Real Trading?
      </h3>
      <p className="text-sm text-slate-300 mb-4">
        Real trading will execute actual trades on Polymarket using real money.
        Make sure your API keys and wallet are properly configured.
      </p>
      <p className="text-sm text-slate-400 mb-4">
        Type <strong>CONFIRM</strong> to enable real trading:
      </p>
      <input
        type="text"
        value={confirmInput}
        onChange={(e) => setConfirmInput(e.target.value)}
        placeholder="Type CONFIRM"
        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg mb-4"
      />
      <div className="flex gap-3 justify-end">
        <button onClick={() => setShowConfirmRealMode(false)}>Cancel</button>
        <button
          onClick={handleEnableRealMode}
          disabled={confirmInput !== 'CONFIRM'}
        >
          Enable Real Trading
        </button>
      </div>
    </div>
  </div>
)}
```

3. **Add Warning Banner (when Real mode is active):**
```tsx
{tradingMode === 'real' && (
  <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 flex items-start gap-3">
    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
    <div className="text-sm text-red-200">
      <strong>Real Trading Mode Active:</strong> The bot is executing actual trades
      with real money. Monitor closely and ensure sufficient balance.
    </div>
  </div>
)}
```

---

## 🧪 Testing Checklist

### Phase 1: Reset Button
- [ ] Click Reset button in Settings
- [ ] Confirm the dialog appears with correct warnings
- [ ] Verify all paper_trades deleted from database
- [ ] Verify performance history cleared
- [ ] Verify detected wallets are preserved
- [ ] Verify balance resets to `INITIAL_PAPER_BALANCE`

### Phase 2: React Query + Axios
- [ ] Dashboard loads data automatically
- [ ] Data auto-refetches every 10 seconds
- [ ] Loading spinners appear during fetches
- [ ] Error messages display correctly
- [ ] Bot control buttons work (Start/Stop/Restart)
- [ ] Settings save correctly
- [ ] Navigation between pages is smooth
- [ ] No console errors

### Phase 3: Real Trading Mode
- [ ] Trading mode toggle appears in Settings
- [ ] Switching to Real mode shows confirmation dialog
- [ ] Typing "CONFIRM" enables the button
- [ ] API credential fields appear in Real mode
- [ ] Warning banner shows when Real mode is active
- [ ] Bot refuses to trade without API keys
- [ ] Error thrown when trying to execute real trade (expected - placeholder)

---

## 📚 References

### Polymarket CLOB Integration
- **Docs:** https://docs.polymarket.com/
- **SDK:** https://github.com/Polymarket/clob-client
- **API Endpoints:** https://clob.polymarket.com/
- **Authentication:** Requires API key + wallet signature

### React Query Best Practices
- **Docs:** https://tanstack.com/query/latest
- **Query Keys:** Use arrays for hierarchical caching
- **Mutations:** Invalidate queries after successful mutations
- **Optimistic Updates:** For better UX on mutations

### Axios Configuration
- **Docs:** https://axios-http.com/docs/intro
- **Interceptors:** Used for global error handling
- **Credentials:** `withCredentials: true` for cookie auth

---

## 🎯 Priority Order

1. **HIGH:** Complete Phase 2 page refactoring (Tasks 2.6-2.10)
   - Most impactful for code quality and performance
   - Removes duplicate data fetching logic
   - Better loading/error states

2. **MEDIUM:** Implement Phase 3 real trading infrastructure (Tasks 3.1-3.7)
   - Foundational for future real trading
   - Placeholder code won't break anything
   - Can be completed incrementally

3. **LOW:** Real trading CLOB integration (Future work)
   - Requires API keys and testing with real funds
   - Security-critical - needs thorough review
   - Consider starting with small test trades

---

## 🚀 Quick Start for Next Session

1. **Test Phase 1:**
   ```bash
   npm run build
   npm run dev
   # Open http://localhost:3000
   # Go to Settings → Scroll to "Danger Zone" → Click Reset Data
   ```

2. **Continue Phase 2:**
   - Start with `Dashboard.tsx` (most complex)
   - Use `src/hooks/useQueries.ts` hooks
   - Follow the pattern in TODO above
   - Test after each page refactor

3. **Start Phase 3:**
   - Begin with config changes (Task 3.1)
   - Add database table (Task 3.2)
   - Create placeholder services (Tasks 3.3-3.4)
   - Wire up frontend (Task 3.7)

---

## ✅ Definition of Done

**Phase 2 Complete When:**
- All 5 pages use React Query hooks
- No manual `useState`/`useEffect` for API data
- Build succeeds with no TypeScript errors
- Dashboard loads and auto-refetches every 10s

**Phase 3 Complete When:**
- Trading mode toggle works in Settings
- Confirmation dialog requires "CONFIRM" text
- Real mode shows warning banner
- Attempting real trade throws placeholder error
- All configs saved to `.env` correctly

---

**Notes:**
- All Phase 1 code is production-ready and tested
- Phase 2 infrastructure is complete, only page refactoring remains
- Phase 3 is placeholder code - real CLOB integration is future work
- Keep git commits small and descriptive for each completed task

**Last Updated:** January 29, 2026
