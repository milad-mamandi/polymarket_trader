import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { timeAgo, formatUSD, formatPercent } from '../lib/utils';
import { useWebSocket } from '../hooks/useWebSocket';
import { Activity as ActivityIcon, TrendingUp, Eye, CheckCircle, XCircle, Wifi, WifiOff } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'whale_detected' | 'trade_opened' | 'trade_resolved' | 'trade_won' | 'trade_lost';
  timestamp: string;
  data: any;
}

export function Activity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isConnected, lastMessage } = useWebSocket();

  useEffect(() => {
    loadRecentActivity();
  }, []);

  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage]);

  async function loadRecentActivity() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getRecentActivity(50);
      
      // Transform backend activity data to frontend format
      const transformedActivities = (data.activity || []).map((item: any) => {
        // Generate unique ID
        const id = `${item.type}-${item.data.id || Date.now()}-${Math.random()}`;
        
        // Map backend types to frontend types
        if (item.type === 'paper_trade') {
          const trade = item.data;
          
          // Determine activity type based on trade status
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
        
        // For wallet trades, we don't have a specific display yet, skip them
        return null;
      }).filter(Boolean) as ActivityItem[];
      
      setActivities(transformedActivities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }

  function handleWebSocketMessage(message: any) {
    // Add new activity items from WebSocket
    switch (message.type) {
      case 'whale:detected':
        addActivity({
          id: `whale-${Date.now()}`,
          type: 'whale_detected',
          timestamp: new Date().toISOString(),
          data: message.data,
        });
        break;
      case 'trade:new':
        addActivity({
          id: `trade-${message.data.id}`,
          type: 'trade_opened',
          timestamp: new Date().toISOString(),
          data: message.data,
        });
        break;
      case 'trade:resolved':
        addActivity({
          id: `resolved-${message.data.id}`,
          type: message.data.status === 'WON' ? 'trade_won' : 'trade_lost',
          timestamp: new Date().toISOString(),
          data: message.data,
        });
        break;
    }
  }

  function addActivity(item: ActivityItem) {
    setActivities(prev => [item, ...prev].slice(0, 100)); // Keep last 100 items
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-slate-400">Loading activity feed...</div>
        </div>
      </div>
    );
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

  switch (type) {
    case 'whale_detected':
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
                {data.walletType} wallet placed a {formatUSD(data.size)} bet
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <div className="font-mono truncate">{data.wallet}</div>
                <div className="truncate">{data.market}</div>
                <div>
                  <span className="text-blue-400">{data.outcome}</span> @ {formatPercent(data.price)}
                </div>
                {data.suspicionScore && (
                  <div>Suspicion Score: <span className="text-white">{data.suspicionScore.toFixed(1)}</span></div>
                )}
              </div>
            </div>
          </div>
        </div>
      );

    case 'trade_opened':
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
                {data.market_title}
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <div>
                  Outcome: <span className="text-blue-400">{data.outcome}</span> @ {formatPercent(data.entry_price)}
                </div>
                <div>
                  Amount: <span className="text-white">{formatUSD(data.virtual_amount)}</span>
                </div>
                <div>
                  Confidence: <span className="text-white">{data.confidence_score.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'trade_won':
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
                {data.market_title}
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <div>
                  Outcome: <span className="text-blue-400">{data.outcome}</span>
                </div>
                <div>
                  P&L: <span className="text-green-400 font-semibold">+{formatUSD(data.pnl)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'trade_lost':
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
                {data.market_title}
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <div>
                  Outcome: <span className="text-blue-400">{data.outcome}</span>
                </div>
                <div>
                  P&L: <span className="text-red-400 font-semibold">{formatUSD(data.pnl)}</span>
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
