import { useState, useEffect } from 'react';
import { timeAgo, formatUSD, formatPercent, safeToFixed } from '../lib/utils';
import { useWebSocket } from '../hooks/useWebSocket';
import { useActivity } from '../hooks/useQueries';
import { Activity as ActivityIcon, TrendingUp, Eye, CheckCircle, XCircle, Wifi, WifiOff } from 'lucide-react';
import type { TradeActivityData, WhaleDetectedData, WSMessage, BackendActivityItem } from '../lib/types';

type ActivityData = TradeActivityData | WhaleDetectedData;

interface ActivityItem {
  id: string;
  type: 'whale_detected' | 'trade_opened' | 'trade_resolved' | 'trade_won' | 'trade_lost';
  timestamp: string;
  data: ActivityData;
}

export function Activity() {
  // Use React Query hook for initial data
  const { data, error: queryError } = useActivity(50);
  const { isConnected, lastMessage } = useWebSocket();
  
  const [realtimeActivities, setRealtimeActivities] = useState<ActivityItem[]>([]);
  
  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load activity') : null;

  // Transform backend activity data to frontend format
  const transformedActivities = (data?.activity || []).map((item: BackendActivityItem) => {
    const id = `${item.type}-${item.data.id || Date.now()}-${Math.random()}`;
    
    if (item.type === 'paper_trade') {
      const trade = item.data;
      
      if (trade.status === 'OPEN') {
        return {
          id,
          type: 'trade_opened' as const,
          timestamp: item.timestamp,
          data: trade,
        };
      } else if (trade.status === 'WON') {
        return {
          id,
          type: 'trade_won' as const,
          timestamp: item.timestamp,
          data: trade,
        };
      } else if (trade.status === 'LOST') {
        return {
          id,
          type: 'trade_lost' as const,
          timestamp: item.timestamp,
          data: trade,
        };
      }
    }
    
    return null;
  }).filter(Boolean) as ActivityItem[];

  // Combine realtime activities (prepended) with transformed activities
  const activities = [...realtimeActivities, ...transformedActivities];

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage as WSMessage);
    }
  }, [lastMessage]);

  function handleWebSocketMessage(message: WSMessage) {
    // Add new activity items from WebSocket
    if (!message || !message.type || !message.data) return;
    
    switch (message.type) {
      case 'whale:detected':
        addActivity({
          id: `whale-${Date.now()}-${Math.random()}`,
          type: 'whale_detected',
          timestamp: new Date().toISOString(),
          data: message.data as WhaleDetectedData,
        });
        break;
      case 'trade:new':
        {
          const tradeData = message.data as TradeActivityData;
          if (!tradeData.id) break;
          addActivity({
            id: `trade-${tradeData.id}`,
            type: 'trade_opened',
            timestamp: new Date().toISOString(),
            data: tradeData,
          });
        }
        break;
      case 'trade:resolved':
        {
          const tradeData = message.data as TradeActivityData;
          if (!tradeData.id || !tradeData.status) break;
          addActivity({
            id: `resolved-${tradeData.id}`,
            type: tradeData.status === 'WON' ? 'trade_won' : 'trade_lost',
            timestamp: new Date().toISOString(),
            data: tradeData,
          });
        }
        break;
    }
  }

  function addActivity(item: ActivityItem) {
    setRealtimeActivities(prev => [item, ...prev].slice(0, 50)); // Keep last 50 realtime items
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-4">
        <p className="font-semibold">Error loading activity</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Feed</h1>
          <p className="text-slate-400 mt-1">
            Real-time updates from whale detection and trading activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="h-5 w-5 text-green-400" />
              <span className="text-sm text-green-400">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-5 w-5 text-red-400" />
              <span className="text-sm text-red-400">Disconnected</span>
            </>
          )}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="space-y-3">
        {activities.length === 0 ? (
          <div className="bg-slate-800 rounded-lg p-8 text-center text-slate-400">
            <ActivityIcon className="h-12 w-12 mx-auto mb-3 text-slate-600" />
            <p>No activity yet</p>
            <p className="text-sm mt-1">Activity will appear here as the bot runs</p>
          </div>
        ) : (
          activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))
        )}
      </div>
    </div>
  );
}

function ActivityCard({ activity }: { activity: ActivityItem }) {
  const { type, timestamp, data } = activity;
  
  // Guard against missing data
  if (!data) return null;

  // Type guards
  function isWhaleData(d: ActivityData): d is WhaleDetectedData {
    return 'wallet' in d && 'walletType' in d;
  }

  function isTradeData(d: ActivityData): d is TradeActivityData {
    return 'id' in d && 'market_title' in d;
  }

  switch (type) {
    case 'whale_detected':
      if (!isWhaleData(data)) return null;
      return (
        <div className="bg-slate-800 rounded-lg p-4 border-l-4 border-blue-500">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Eye className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-semibold">Whale Detected</h3>
                <span className="text-sm text-slate-400">{timeAgo(timestamp)}</span>
              </div>
              <p className="text-sm text-slate-300 mb-2">
                {data.walletType || 'Unknown'} wallet placed a {data.size ? formatUSD(data.size) : 'N/A'} bet
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <div className="font-mono truncate">{data.wallet || 'N/A'}</div>
                <div className="truncate">{data.market || 'N/A'}</div>
                <div>
                  <span className="text-blue-400">{data.outcome || 'N/A'}</span> @ {data.price != null ? formatPercent(data.price) : 'N/A'}
                </div>
                {data.suspicionScore != null && (
                  <div>Suspicion Score: <span className="text-white">{safeToFixed(data.suspicionScore, 1)}</span></div>
                )}
              </div>
            </div>
          </div>
        </div>
      );

    case 'trade_opened':
      if (!isTradeData(data)) return null;
      return (
        <div className="bg-slate-800 rounded-lg p-4 border-l-4 border-yellow-500">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <TrendingUp className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-semibold">Paper Trade Opened</h3>
                <span className="text-sm text-slate-400">{timeAgo(timestamp)}</span>
              </div>
              <p className="text-sm text-slate-300 mb-2 truncate">
                {data.market_title || 'N/A'}
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <div>
                  Outcome: <span className="text-blue-400">{data.outcome || 'N/A'}</span> @ {data.entry_price != null ? formatPercent(data.entry_price) : 'N/A'}
                </div>
                <div>
                  Amount: <span className="text-white">{data.virtual_amount != null ? formatUSD(data.virtual_amount) : 'N/A'}</span>
                </div>
                <div>
                  Confidence: <span className="text-white">{data.confidence_score != null ? safeToFixed(data.confidence_score, 1) : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'trade_won':
      if (!isTradeData(data)) return null;
      return (
        <div className="bg-slate-800 rounded-lg p-4 border-l-4 border-green-500">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <CheckCircle className="h-5 w-5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-semibold">Trade Won</h3>
                <span className="text-sm text-slate-400">{timeAgo(timestamp)}</span>
              </div>
              <p className="text-sm text-slate-300 mb-2 truncate">
                {data.market_title || 'N/A'}
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <div>
                  Outcome: <span className="text-blue-400">{data.outcome || 'N/A'}</span>
                </div>
                <div>
                  P&L: <span className="text-green-400 font-semibold">+{data.pnl != null ? formatUSD(data.pnl) : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'trade_lost':
      if (!isTradeData(data)) return null;
      return (
        <div className="bg-slate-800 rounded-lg p-4 border-l-4 border-red-500">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <XCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-semibold">Trade Lost</h3>
                <span className="text-sm text-slate-400">{timeAgo(timestamp)}</span>
              </div>
              <p className="text-sm text-slate-300 mb-2 truncate">
                {data.market_title || 'N/A'}
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <div>
                  Outcome: <span className="text-blue-400">{data.outcome || 'N/A'}</span>
                </div>
                <div>
                  P&L: <span className="text-red-400 font-semibold">{data.pnl != null ? formatUSD(data.pnl) : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
