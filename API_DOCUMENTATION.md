# API Documentation - Polymarket Whale Scout

This document provides comprehensive API documentation for the Whale Scout web dashboard backend.

## Base URL

```
http://localhost:3000
```

Replace with your deployed domain in production.

---

## Authentication

### POST `/auth/login`

Authenticate and create a session.

**Request Body:**
```json
{
  "password": "admin123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid password"
}
```

**Session Cookie:**
- Name: `connect.sid`
- HttpOnly: true
- Secure: false (development), true (production)
- Max-Age: 24 hours

---

### POST `/auth/logout`

Destroy session and logout.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### GET `/auth/check`

Check if user is authenticated.

**Response (200 OK):**
```json
{
  "authenticated": true
}
```

**Response (401 Unauthorized):**
```json
{
  "authenticated": false
}
```

---

## Dashboard Data

### GET `/api/portfolio`

Get current portfolio status and statistics.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "balance": 12345.67,
  "totalPnl": 2345.67,
  "pnlPercentage": 23.45,
  "winRate": 67.5,
  "totalTrades": 156,
  "openTrades": 12,
  "resolvedTrades": 144
}
```

**Fields:**
- `balance` (number): Current paper trading balance in USD
- `totalPnl` (number): Total profit/loss in USD
- `pnlPercentage` (number): P&L as percentage of starting balance
- `winRate` (number): Percentage of winning trades (0-100)
- `totalTrades` (number): Total number of paper trades
- `openTrades` (number): Number of open positions
- `resolvedTrades` (number): Number of resolved trades (won/lost/cancelled)

---

### GET `/api/trades`

Get recent paper trades with optional filtering.

**Authentication:** Required

**Query Parameters:**
- `limit` (number, optional): Maximum trades to return (default: 10, max: 100)
- `status` (string, optional): Filter by status: `OPEN`, `WON`, `LOST`, `CANCELLED`
- `from` (string, optional): Start date (ISO 8601 format)
- `to` (string, optional): End date (ISO 8601 format)

**Example Requests:**
```
GET /api/trades
GET /api/trades?limit=20
GET /api/trades?status=WON
GET /api/trades?from=2026-01-01&to=2026-01-31
```

**Response (200 OK):**
```json
{
  "trades": [
    {
      "id": 123,
      "market_id": "0x123abc...",
      "market_title": "Will Trump win 2024?",
      "outcome": "YES",
      "entry_price": 0.67,
      "exit_price": 0.85,
      "shares": 100,
      "pnl": 18.00,
      "status": "WON",
      "confidence": 85,
      "wallet_address": "0xabc123...",
      "timestamp": "2026-01-30T10:30:00.000Z"
    }
  ],
  "total": 156
}
```

**Trade Fields:**
- `id` (number): Unique trade ID
- `market_id` (string): Polymarket market/condition ID
- `market_title` (string): Human-readable market question
- `outcome` (string): Position taken: `YES` or `NO`
- `entry_price` (number): Entry price per share (0-1)
- `exit_price` (number | null): Exit price per share (null if open)
- `shares` (number): Number of shares purchased
- `pnl` (number | null): Profit/loss in USD (null if open)
- `status` (string): `OPEN`, `WON`, `LOST`, or `CANCELLED`
- `confidence` (number): Confidence score (0-100) at trade execution
- `wallet_address` (string): Wallet that triggered the trade
- `timestamp` (string): Trade execution time (ISO 8601)

---

### GET `/api/wallets`

Get tracked wallets with optional filtering.

**Authentication:** Required

**Query Parameters:**
- `limit` (number, optional): Maximum wallets to return (default: 10, max: 100)
- `type` (string, optional): Filter by type: `whale`, `suspicious`, `all` (default: `all`)
- `sort` (string, optional): Sort field: `score`, `last_seen`, `created_at` (default: `score`)
- `order` (string, optional): Sort order: `asc`, `desc` (default: `desc`)

**Example Requests:**
```
GET /api/wallets
GET /api/wallets?limit=20&type=whale
GET /api/wallets?sort=last_seen&order=desc
```

**Response (200 OK):**
```json
{
  "wallets": [
    {
      "address": "0xabc123...",
      "is_whale": true,
      "suspicion_score": 85,
      "total_trades": 45,
      "win_rate": 72.5,
      "last_seen": "2026-01-30T10:30:00.000Z",
      "created_at": "2026-01-15T08:00:00.000Z"
    }
  ],
  "total": 89
}
```

**Wallet Fields:**
- `address` (string): Ethereum wallet address
- `is_whale` (boolean): Whether wallet qualifies as whale (large trades)
- `suspicion_score` (number): Suspicion score (0-100)
- `total_trades` (number): Total trades by this wallet
- `win_rate` (number | null): Historical win rate percentage
- `last_seen` (string): Last activity timestamp (ISO 8601)
- `created_at` (string): Wallet tracking start time (ISO 8601)

---

### GET `/api/performance`

Get performance metrics over time for charting.

**Authentication:** Required

**Query Parameters:**
- `days` (number, optional): Number of days of history (default: 7, max: 365)

**Example Requests:**
```
GET /api/performance
GET /api/performance?days=30
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "date": "2026-01-30",
      "balance": 12345.67,
      "pnl": 2345.67,
      "trades": 5,
      "wins": 3,
      "losses": 2
    },
    {
      "date": "2026-01-29",
      "balance": 12100.50,
      "pnl": 2100.50,
      "trades": 8,
      "wins": 6,
      "losses": 2
    }
  ]
}
```

**Performance Data Fields:**
- `date` (string): Date (YYYY-MM-DD format)
- `balance` (number): Portfolio balance at end of day (USD)
- `pnl` (number): Cumulative P&L at end of day (USD)
- `trades` (number): Number of trades on this day
- `wins` (number): Number of winning trades on this day
- `losses` (number): Number of losing trades on this day

---

## Orders API

### GET `/api/orders`

List orders with filtering, search, and pagination.

**Authentication:** Required

**Query Parameters:**
- `type` (string, optional): Filter by order type: `paper`, `real`, `all` (default: `all`)
- `status` (string, optional): Filter by status: `PENDING`, `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `WON`, `LOST`, `CANCELLED`, `EXPIRED`, `FAILED`
- `search` (string, optional): Search in market titles, outcomes, wallet addresses, and order IDs
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 100)

**Example Requests:**
```
GET /api/orders
GET /api/orders?type=real
GET /api/orders?status=OPEN
GET /api/orders?search=trump
GET /api/orders?page=2&limit=50
GET /api/orders?type=real&status=FILLED&search=2024
```

**Response (200 OK):**
```json
{
  "orders": [
    {
      "id": 123,
      "type": "real",
      "status": "FILLED",
      "market_id": "0x123abc...",
      "market_title": "Will Trump win 2024?",
      "outcome": "YES",
      "shares": 100,
      "entry_price": 0.67,
      "wallet_address": "0xabc123...",
      "timestamp": "2026-01-30T10:30:00.000Z",
      "order_id": "0x456def...",
      "order_type": "LIMIT"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8
  }
}
```

**Order Fields:**
- `id` (number): Internal order ID
- `type` (string): `paper` or `real`
- `status` (string): Current order status (see Order Statuses below)
- `market_id` (string): Polymarket market/condition ID
- `market_title` (string): Market question
- `outcome` (string): `YES` or `NO`
- `shares` (number): Number of shares
- `entry_price` (number): Price per share (0-1)
- `wallet_address` (string): Wallet that triggered the order
- `timestamp` (string): Order creation time (ISO 8601)
- `order_id` (string | null): CLOB order ID (real trades only)
- `order_type` (string | null): Order type: `LIMIT`, `MARKET`, `FOK`, `GTC` (real trades only)

**Pagination Fields:**
- `page` (number): Current page number
- `limit` (number): Results per page
- `total` (number): Total number of orders matching filters
- `totalPages` (number): Total number of pages

**Order Statuses:**
- `PENDING` - Order created but not yet placed on CLOB (real trades only)
- `OPEN` - Order active and waiting for fill or market resolution
- `PARTIALLY_FILLED` - Order partially filled, still active (real trades only)
- `FILLED` - Order completely filled (real trades only)
- `WON` - Market resolved in our favor
- `LOST` - Market resolved against us
- `CANCELLED` - Order cancelled or outcome indeterminate
- `EXPIRED` - Order expired without fill (real trades only)
- `FAILED` - Order placement failed (real trades only)

---

### GET `/api/orders/stats`

Get order statistics.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "total": 156,
  "pending": 5,
  "open": 12,
  "paperCount": 89,
  "realCount": 67
}
```

**Stats Fields:**
- `total` (number): Total number of orders (all time)
- `pending` (number): Number of pending orders (awaiting placement)
- `open` (number): Number of open orders (active, awaiting fill/resolution)
- `paperCount` (number): Number of paper trade orders
- `realCount` (number): Number of real trade orders

---

### GET `/api/orders/:id`

Get detailed information about a specific order.

**Authentication:** Required

**URL Parameters:**
- `id` (number): Order ID

**Example Request:**
```
GET /api/orders/123
```

**Response (200 OK):**
```json
{
  "id": 123,
  "type": "real",
  "status": "FILLED",
  "market_id": "0x123abc...",
  "market_title": "Will Trump win 2024?",
  "market_end_date": "2024-11-05T23:59:59.000Z",
  "outcome": "YES",
  "shares": 100,
  "entry_price": 0.67,
  "exit_price": null,
  "pnl": null,
  "wallet_address": "0xabc123...",
  "confidence": 85,
  "timestamp": "2026-01-30T10:30:00.000Z",
  "order_id": "0x456def...",
  "token_id": "789",
  "order_type": "LIMIT",
  "fee_paid": 0.12,
  "transaction_hash": "0xfedcba..."
}
```

**Additional Fields (vs list endpoint):**
- `market_end_date` (string | null): Market closing date
- `exit_price` (number | null): Exit price if resolved
- `pnl` (number | null): Profit/loss in USD
- `confidence` (number): Confidence score (0-100)
- `token_id` (string | null): CLOB token ID (real trades only)
- `fee_paid` (number | null): Fees paid in USD (real trades only)
- `transaction_hash` (string | null): Blockchain transaction hash (real trades only)

**Response (404 Not Found):**
```json
{
  "error": "Order not found"
}
```

---

### POST `/api/orders/:id/cancel`

Cancel an active real order.

**Authentication:** Required

**URL Parameters:**
- `id` (number): Order ID

**Example Request:**
```
POST /api/orders/123/cancel
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Order cancelled successfully"
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Order not found"
}
```

**400 Bad Request:**
```json
{
  "error": "Cannot cancel paper trades"
}
```

**400 Bad Request:**
```json
{
  "error": "Order cannot be cancelled in current status: FILLED"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to cancel order: <error message>"
}
```

**Notes:**
- Only real trades can be cancelled
- Only orders with status `OPEN` or `PENDING` can be cancelled
- Cancellation triggers CLOB API call
- Status is updated to `CANCELLED` upon success
- WebSocket event `order:status_changed` is broadcast

---

## Bot Control

### POST `/api/bot/start`

Start the whale scout monitoring bot.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Bot started successfully"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Bot is already running"
}
```

---

### POST `/api/bot/stop`

Stop the whale scout monitoring bot.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Bot stopped successfully"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Bot is not running"
}
```

---

### POST `/api/bot/restart`

Restart the whale scout monitoring bot.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Bot restarted successfully"
}
```

---

### GET `/api/bot/status`

Get current bot status.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "running": true,
  "startTime": "2026-01-30T09:00:00.000Z",
  "uptime": 5400,
  "error": null
}
```

**Status Fields:**
- `running` (boolean): Whether bot is currently running
- `startTime` (string | null): Bot start time (ISO 8601), null if not running
- `uptime` (number): Uptime in seconds, 0 if not running
- `error` (string | null): Last error message, null if no error

---

## Settings

### POST `/api/settings/reset`

Reset paper trading data.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Paper trading data reset successfully"
}
```

**Side Effects:**
- Deletes all paper trades from database
- Resets portfolio balance to initial balance (from config)
- Broadcasts `portfolio` WebSocket event with updated data

---

## Health Check

### GET `/health`

Health check endpoint (no authentication required).

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-01-30T10:30:00.000Z"
}
```

---

## WebSocket Events

The dashboard uses WebSocket for real-time updates. Connect to:

```
ws://localhost:3000
```

### Client → Server

**Ping (keep-alive):**
```json
{
  "type": "ping"
}
```

Server responds with pong:
```json
{
  "type": "pong"
}
```

### Server → Client

**Portfolio Update:**
```json
{
  "type": "portfolio",
  "data": {
    "balance": 12345.67,
    "totalPnl": 2345.67,
    "pnlPercentage": 23.45,
    "winRate": 67.5,
    "totalTrades": 156,
    "openTrades": 12
  }
}
```

**New Trade:**
```json
{
  "type": "trade:new",
  "data": {
    "id": 123,
    "market_title": "Will Trump win 2024?",
    "outcome": "YES",
    "entry_price": 0.67,
    "shares": 100,
    "confidence": 85,
    "wallet_address": "0xabc123..."
  }
}
```

**Trade Resolved:**
```json
{
  "type": "trade:resolved",
  "data": {
    "id": 123,
    "status": "WON",
    "exit_price": 0.85,
    "pnl": 18.00
  }
}
```

**Whale Detected:**
```json
{
  "type": "whale:detected",
  "data": {
    "address": "0xabc123...",
    "is_whale": true,
    "suspicion_score": 85,
    "trade_size_usd": 75000
  }
}
```

**Bot Status:**
```json
{
  "type": "bot:status",
  "data": {
    "running": true,
    "startTime": "2026-01-30T09:00:00.000Z"
  }
}
```

**Order Status Changed:**
```json
{
  "type": "order:status_changed",
  "data": {
    "orderId": 123,
    "oldStatus": "OPEN",
    "newStatus": "FILLED",
    "timestamp": "2026-01-30T10:30:00.000Z"
  }
}
```

**Order Filled:**
```json
{
  "type": "order:filled",
  "data": {
    "orderId": 123,
    "shares": 100,
    "avgPrice": 0.67,
    "totalCost": 67.00,
    "fee": 0.12
  }
}
```

**Order Partial Fill:**
```json
{
  "type": "order:partial_fill",
  "data": {
    "orderId": 123,
    "sharesFilled": 50,
    "sharesRemaining": 50,
    "fillPercentage": 50.0
  }
}
```

---

## Error Handling

All API endpoints follow consistent error response format:

**Error Response:**
```json
{
  "error": "Error message describing what went wrong"
}
```

**HTTP Status Codes:**
- `200 OK` - Request succeeded
- `400 Bad Request` - Invalid request parameters or state
- `401 Unauthorized` - Authentication required or failed
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

**Common Error Messages:**
- `"Unauthorized"` - User not authenticated (401)
- `"Invalid password"` - Login failed (401)
- `"Order not found"` - Order ID doesn't exist (404)
- `"Bot is already running"` - Cannot start bot twice (400)
- `"Cannot cancel paper trades"` - Paper trades can't be cancelled (400)

---

## Rate Limiting

Currently no rate limiting is implemented. In production, consider:
- Rate limit per IP address
- Rate limit per authenticated session
- Different limits for read vs write operations
- Exemptions for WebSocket connections

---

## CORS Configuration

Development:
- Allows all origins (`*`)
- Credentials enabled

Production:
- Configure specific allowed origins in `.env`
- Keep credentials enabled for session cookies

---

## Authentication Flow

1. Client sends POST `/auth/login` with password
2. Server validates password and creates session
3. Server sets HttpOnly session cookie
4. Client includes cookie in all subsequent requests
5. Server validates session on each request
6. Client sends POST `/auth/logout` to end session

**Session Configuration:**
- Duration: 24 hours
- Storage: Memory (in-memory store)
- Cookie name: `connect.sid`
- Secure: true (HTTPS only in production)

---

## Best Practices

### Client Implementation

**Use React Query:**
```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from './lib/api';

// Query data
const { data, isLoading, error } = useQuery({
  queryKey: ['orders', { type: 'real' }],
  queryFn: () => api.getOrders({ type: 'real' }),
  refetchInterval: 10000 // Auto-refetch every 10s
});

// Mutate data
const cancelOrder = useMutation({
  mutationFn: (orderId: number) => api.cancelOrder(orderId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  }
});
```

**Use WebSocket:**
```typescript
import { useWebSocket } from './hooks/useWebSocket';

function Dashboard() {
  const { isConnected, lastMessage } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'order:filled') {
        showNotification('Order filled!');
      }
    }
  });
}
```

**Error Handling:**
```typescript
try {
  await api.cancelOrder(123);
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      // Redirect to login
    } else if (error.response?.status === 400) {
      // Show error message
      alert(error.response.data.error);
    }
  }
}
```

---

## Changelog

### v2.0 (January 2026)
- Added Order Monitoring API endpoints
- Added WebSocket events for order updates
- Added order search and filtering
- Added order cancellation endpoint
- Added order statistics endpoint

### v1.0 (January 2026)
- Initial API release
- Authentication endpoints
- Portfolio and trade endpoints
- Bot control endpoints
- WebSocket real-time updates
- Reset functionality

---

## Support

For API issues or questions:
1. Check logs: `logs/app.log`
2. Review this documentation
3. Check browser console for errors
4. Review network tab for failed requests
5. Create an issue in the repository

---

*Last Updated: January 30, 2026*
