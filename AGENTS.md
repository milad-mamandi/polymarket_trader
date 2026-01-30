# Agent Guidelines for Polymarket Whale Scout Bot

This file contains coding standards, build commands, and conventions for AI agents working on this codebase.

---

## Build & Run Commands

```bash
# Development
npm run dev              # Run with tsx (hot reload)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled code

# Web Dashboard
npm run build:client     # Build frontend (in src/web/client)

# Testing
npm run dev              # Manual testing (run 30-60s and verify)

# Database
sqlite3 data/whale_bot.db "SELECT * FROM wallets LIMIT 10;"
rm -rf data/ logs/       # Reset database

# Debugging
tail -f logs/app.log     # Watch logs
grep ERROR logs/app.log  # Find errors
```

---

## Code Style Guidelines

### Language & Module System
- **TypeScript** with strict mode, ES Modules, ES2022 target, Node.js v18+
- **CRITICAL**: Always use `.js` extension for local imports (even for `.ts` files)

```typescript
// ✅ Correct
import { logger } from '../utils/logger.js';
import { Trade } from './polymarket/types.js';
```

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Files | camelCase | `walletScanner.ts` |
| Classes | PascalCase | `WalletScanner` |
| Functions/Variables | camelCase | `scanForWhales` |
| Constants | UPPER_SNAKE_CASE | `WHALE_THRESHOLD_USD` |
| Interfaces/Types | PascalCase | `Trade`, `DetectedWallet` |
| Database Fields | snake_case | `wallet_address` |

### TypeScript Types
- Always use explicit types for function parameters and return values
- Use `interface` for object shapes, `type` for unions/aliases
- Avoid `any` - use `unknown` if type is truly unknown

---

## Critical Patterns

### Error Handling

**CRITICAL**: Avoid circular reference errors in logging!

```typescript
try {
  // code
} catch (error) {
  // ✅ Extract message first
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Context: ${errorMessage}`);
  
  // ✅ For Axios errors
  if (axios.isAxiosError(error)) {
    logger.error('API Error', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
    });
  }
  
  // ❌ NEVER log entire error object
  // logger.error('Error:', error); // BAD - causes circular ref!
}
```

**Never log**: Full Axios error objects, full Error objects, objects with HTTP request/response

### Database Operations

**CRITICAL**: Always `upsertWallet()` BEFORE inserting trades!

```typescript
// ✅ Correct - wallet exists before trade insert
upsertWallet({ address: wallet.address, is_whale: true });
insertWalletTrade({ wallet_address: wallet.address, market_id: trade.id });

// ❌ Wrong - FK constraint error
insertWalletTrade({ wallet_address: wallet.address }); // Wallet doesn't exist!
```

### Polymarket Token Resolution

**CRITICAL**: Understand token ID vs condition ID distinction!

- **Condition ID**: Market identifier (e.g., `0x123abc...`)
- **Token ID**: Outcome-specific token (YES token, NO token)
- Markets have 2+ tokens (binary markets: YES + NO)

```typescript
// ✅ Get token ID for placing orders
const market = await polymarketApi.getMarketByConditionId(conditionId);
const tokenId = outcome === 'YES' 
  ? market.tokens[0].token_id 
  : market.tokens[1].token_id;

// ✅ Or use token resolver
import { resolveTokenId } from './polymarket/tokenResolver.js';
const tokenId = await resolveTokenId(conditionId, 'YES');
```

### WebSocket Patterns

**CRITICAL**: Avoid circular references in WebSocket messages!

```typescript
// ✅ Serialize only necessary fields
wsManager.broadcast({
  type: 'order:status_changed',
  data: { orderId: order.id, status: order.status, timestamp: new Date().toISOString() }
});

// ❌ Full objects may contain circular refs
wsManager.broadcast({ type: 'order:update', data: fullOrderObject });
```

**Event Types**: `portfolio`, `trade:new`, `trade:resolved`, `whale:detected`, `bot:status`, `order:status_changed`, `order:filled`, `order:partial_fill`

---

## Architecture Patterns

- **Service Layer** (`src/services/`) - Business logic and API calls, exported as singletons, no direct DB access
- **Model Layer** (`src/models/`) - Database CRUD operations only, pure functions, export functions not classes
- **Core Layer** (`src/core/`) - Orchestration (monitor, alerts, performance tracking), includes kill switch
- **Utils** (`src/utils/`) - Pure utility functions, no side effects
- **Web Layer** (`src/web/`) - Express.js backend + React frontend (Vite + TypeScript + Tailwind CSS)

---

## Common Pitfalls to Avoid

1. ❌ Forgetting `.js` extension in imports (causes module not found errors)
2. ❌ Logging full error objects (causes circular reference errors)
3. ❌ Inserting trades before wallets (causes FK constraint errors)
4. ❌ Using `any` type (defeats purpose of TypeScript)
5. ❌ Hardcoding config values (use CONFIG or .env)
6. ❌ Not handling API errors (always try-catch async operations)
7. ❌ Raw SQL without prepared statements (always use `db.prepare()`)
8. ❌ Confusing token ID with condition ID (use tokenResolver for CLOB orders)
9. ❌ Broadcasting full objects via WebSocket (causes circular refs - extract fields)
10. ❌ Not checking TRADING_MODE before executing real trades
11. ❌ Forgetting to build client (`npm run build:client` required for dashboard)

---

## API Documentation & References

### Polymarket APIs
- **Data API Documentation**: https://docs.polymarket.com/
- **CLOB Client SDK (GitHub)**: https://github.com/Polymarket/clob-client
- **CLOB API Endpoint**: https://clob.polymarket.com/
- **Gamma Markets API**: https://gamma-api.polymarket.com/
- **CLOB API Specification**: https://docs.polymarket.com/#clob-api

### Key API Endpoints

#### Data API (gamma-api.polymarket.com)
- `GET /trades` - Fetch recent trades with filters (CASH/CASH_AMOUNT/VOLUME)
- `GET /public-profile?address={wallet}` - Get wallet profile and creation date
- `GET /positions?user={wallet}` - Fetch wallet positions
- `GET /activity?user={wallet}` - Get wallet trading history
- `GET /markets?condition_id={id}` - Get market details by condition ID
- `GET /closed-positions?market={id}` - Fallback for archived market resolution
- `GET /v1/leaderboard` - Get top traders by volume/PnL

#### CLOB API (clob.polymarket.com)
- `POST /order` - Place limit/market orders (requires signature)
- `GET /order/{orderId}` - Get order status
- `DELETE /order/{orderId}` - Cancel order
- `GET /orders?market={id}` - Get all orders for market
- `GET /balance` - Get wallet balance

### Libraries & Documentation
- **React Query (TanStack Query)**: https://tanstack.com/query/latest
- **Axios HTTP Client**: https://axios-http.com/docs/intro
- **Ethers.js v5**: https://docs.ethers.org/v5/
- **Winston Logger**: https://github.com/winstonjs/winston
- **Better-SQLite3**: https://github.com/WiseLibs/better-sqlite3

### Blockchain References
- **Polygon Network**: https://polygon.technology/ (Chain ID: 137 mainnet, 80001 Mumbai testnet)
- **Polygon RPC**: https://polygon-rpc.com/
- **Polygonscan**: https://polygonscan.com/
- **USDC on Polygon**: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174

---

## Quick Reference

**Start coding**:
1. Read relevant files first
2. Follow naming conventions (camelCase files, `.js` imports)
3. Extract error messages before logging (avoid circular refs)
4. Upsert wallet before inserting trades (FK constraints)
5. Check TRADING_MODE before real trades
6. Use tokenResolver for token IDs (not condition IDs)
7. Test with `npm run dev`
8. Check logs: `tail -f logs/app.log`

**Key Reference Files**:
- Error handling: `src/utils/logger.ts`
- API calls: `src/services/polymarket/api.ts`
- Database patterns: `src/models/wallet.ts`
- WebSocket: `src/web/server/websocket.ts`
- Real trading safety: `src/services/realTradeExecutor.ts`
- Token resolution: `src/services/polymarket/tokenResolver.ts`

---

*Last Updated: January 31, 2026*
