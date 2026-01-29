# Agent Guidelines for Polymarket Whale Scout Bot

This file contains coding standards, build commands, and conventions for AI agents working on this codebase.

---

## Build & Run Commands

### Development
```bash
npm run dev          # Run with tsx (hot reload)
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled code
npm run clean        # Remove dist/ folder
```

### Testing
```bash
# No formal test suite yet - use manual testing:
npm run dev          # Run for 30-60 seconds and verify output
./test.sh            # 60-second test run with database verification
```

### Database Operations
```bash
# View data
sqlite3 data/whale_bot.db "SELECT * FROM wallets LIMIT 10;"
sqlite3 data/whale_bot.db "SELECT * FROM wallet_trades LIMIT 10;"

# Reset database
rm -rf data/ logs/ && npm run dev
```

### Debugging
```bash
tail -f logs/app.log              # Watch logs in real-time
grep ERROR logs/app.log           # Find errors
```

---

## Code Style Guidelines

### Language & Module System
- **TypeScript** with strict mode enabled
- **ES Modules** (`.js` extension in imports required)
- Target: ES2022
- Node.js v18+ required

### Imports
**Always use `.js` extension for local imports** (even for `.ts` files):
```typescript
// ✅ Correct
import { logger } from '../utils/logger.js';
import { Trade } from './polymarket/types.js';

// ❌ Wrong
import { logger } from '../utils/logger';
import { Trade } from './polymarket/types.ts';
```

**Import order**:
1. External packages (axios, winston, etc.)
2. Internal modules (relative imports)
3. Types (if separate)

**Example**:
```typescript
import axios from 'axios';
import winston from 'winston';
import { polymarketApi } from './polymarket/api.js';
import { Trade, Position } from './polymarket/types.js';
```

### Naming Conventions
- **Files**: camelCase (`walletScanner.ts`, `betRater.ts`)
- **Classes**: PascalCase (`WalletScanner`, `AlertSystem`)
- **Functions/variables**: camelCase (`scanForWhales`, `isWhale`)
- **Constants**: UPPER_SNAKE_CASE (`WHALE_THRESHOLD_USD`, `LOG_LEVEL`)
- **Interfaces/Types**: PascalCase (`Trade`, `DetectedWallet`)
- **Database fields**: snake_case (`wallet_address`, `is_whale`)

### TypeScript Types
- **Always use explicit types** for function parameters and return values
- **Use interfaces** for object shapes
- **Use type** for unions, intersections, or type aliases
- **Avoid `any`** - use `unknown` if type is truly unknown

**Example**:
```typescript
// ✅ Good
export interface DetectedWallet {
  address: string;
  isWhale: boolean;
  trade: Trade;
  walletAge?: number;
}

async function scanForWhales(): Promise<DetectedWallet[]> {
  // ...
}

// ❌ Bad
async function scanForWhales() {
  return [];
}
```

### Error Handling

**CRITICAL**: Avoid circular reference errors in logging!

**Safe error logging pattern**:
```typescript
try {
  // code
} catch (error) {
  // ✅ Extract message first
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Context: ${errorMessage}`);
  
  // ✅ For Axios errors, use helper
  if (axios.isAxiosError(error)) {
    logger.error('API Error', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
    });
  }
  
  // ❌ NEVER log entire error object directly
  // logger.error('Error:', error); // BAD - causes circular ref!
}
```

**Never log**:
- Full Axios error objects (contain circular refs)
- Full Error objects with all properties
- Objects that may contain HTTP request/response

### Database Operations

**CRITICAL**: Always `upsertWallet()` BEFORE inserting trades!

**Correct pattern**:
```typescript
// ✅ Good - wallet exists before trade insert
upsertWallet({
  address: wallet.address,
  is_whale: true,
  // ...
});

insertWalletTrade({
  wallet_address: wallet.address,  // FK constraint satisfied
  market_id: trade.id,
  // ...
});

// ❌ Bad - will fail with FK constraint error
insertWalletTrade({
  wallet_address: wallet.address,  // Wallet doesn't exist yet!
  market_id: trade.id,
});
```

### Async/Await
- **Always use async/await** (no raw Promises or callbacks)
- **Always handle errors** with try-catch
- **Never use `.catch()` chains** - use try-catch instead

**Example**:
```typescript
// ✅ Good
async function fetchData(): Promise<Trade[]> {
  try {
    const response = await api.getTrades();
    return response.data;
  } catch (error) {
    logger.error('Failed to fetch trades');
    return [];
  }
}

// ❌ Bad
function fetchData() {
  return api.getTrades()
    .then(res => res.data)
    .catch(err => console.log(err));
}
```

### Logging
- Use `logger.info()` for normal operations
- Use `logger.error()` for errors (with safe error extraction)
- Use `logger.warn()` for warnings
- Use `logger.debug()` for verbose debugging (respects LOG_LEVEL)

### Comments & Documentation
- Use JSDoc comments for exported functions/classes
- Include `@param` and `@returns` where helpful
- Keep comments concise and meaningful

**Example**:
```typescript
/**
 * Scan for large trades and detect whales/suspicious wallets
 * @returns Array of detected wallet addresses with trade info
 */
async scanForWhales(): Promise<DetectedWallet[]> {
  // Implementation
}
```

### Configuration
- All config in `.env` file and `src/config/settings.ts`
- Never hardcode values like thresholds, intervals, API URLs
- Use `CONFIG.CONSTANT_NAME` pattern

---

## Architecture Patterns

### Service Layer (`src/services/`)
- Business logic and API calls
- Exported as singleton instances: `export const serviceName = new ServiceClass();`
- No direct database access (use models)

### Model Layer (`src/models/`)
- Database CRUD operations only
- Pure functions - no business logic
- Export functions, not classes

### Core Layer (`src/core/`)
- Orchestration (monitor, alerts, performance tracking)
- Coordinates services and models

### Utils (`src/utils/`)
- Pure utility functions
- No side effects
- Reusable across project

---

## Common Pitfalls to Avoid

1. **❌ Forgetting `.js` extension** in imports (causes module not found errors)
2. **❌ Logging full error objects** (causes circular reference errors)
3. **❌ Inserting trades before wallets** (causes FK constraint errors)
4. **❌ Using `any` type** (defeats purpose of TypeScript)
5. **❌ Hardcoding config values** (use CONFIG or .env)
6. **❌ Not handling API errors** (always try-catch async operations)
7. **❌ Raw SQL without prepared statements** (always use `db.prepare()`)

---

## File Organization

```
src/
├── index.ts                   # Entry point
├── config/
│   └── settings.ts           # Load .env and export CONFIG
├── services/
│   ├── polymarket/
│   │   ├── api.ts            # API client with error handling
│   │   └── types.ts          # TypeScript interfaces
│   ├── walletScanner.ts      # Whale detection
│   ├── walletAnalyzer.ts     # Scoring algorithm
│   ├── betRater.ts           # Confidence rating
│   └── tradeEngine.ts        # Paper trading logic
├── models/
│   ├── database.ts           # DB initialization
│   ├── wallet.ts             # Wallet CRUD
│   ├── trade.ts              # Trade CRUD
│   └── performance.ts        # Performance metrics CRUD
├── core/
│   ├── monitor.ts            # Main loop
│   ├── alertSystem.ts        # Multi-channel alerts
│   └── performanceTracker.ts # Analytics
└── utils/
    ├── logger.ts             # Winston logger with circular ref handler
    ├── helpers.ts            # Utility functions
    └── display.ts            # Terminal UI
```

---

## Quick Reference

**Start coding**:
1. Read relevant files first
2. Follow naming conventions
3. Use `.js` in imports
4. Extract error messages before logging
5. Upsert wallet before inserting trades
6. Test with `npm run dev`
7. Check logs for errors: `tail -f logs/app.log`

**When in doubt**: Look at existing code patterns in `src/services/walletScanner.ts` or `src/services/polymarket/api.ts` for reference.

---

*Last Updated: January 29, 2026*
