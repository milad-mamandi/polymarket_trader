import { useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatUSD, formatPercent, formatNumber, timeAgo, safeToFixed } from '../lib/utils';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../components/ToastProvider';
import { Play, Square, RotateCw, TrendingUp, TrendingDown, ListOrdered } from 'lucide-react';
import { useOverview, useTrades, useBotStatus, usePerformance, useBotControl, useOrderStats } from '../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { StatCardProps, StatusColors, Trade } from '../lib/types';

export function Dashboard() {
  // Use React Query hooks for data fetching
  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useOverview();
  const { data: tradesData, isLoading: tradesLoading } = useTrades({ limit: 10 });
  const { data: statusData, isLoading: statusLoading } = useBotStatus();
  const { data: performanceData, isLoading: performanceLoading } = usePerformance(7);
  const { data: orderStatsData } = useOrderStats();
  
  // Bot control mutations
  const { startBot, stopBot, restartBot } = useBotControl();
  
  const { isConnected, lastMessage } = useWebSocket();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Derive data from hooks
  const overview = overviewData || null;
  const recentTrades = tradesData?.trades || [];
  const botStatus = statusData || null;
  const performanceHistory = performanceData?.history || [];
  const loading = overviewLoading || tradesLoading || statusLoading || performanceLoading;
  const error = overviewError ? (overviewError instanceof Error ? overviewError.message : 'Failed to load data') : null;

  // WebSocket integration - invalidate queries on updates
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'portfolio':
        case 'trade:new':
        case 'trade:resolved':
          // Invalidate all dashboard queries to trigger refetch
          queryClient.invalidateQueries({ queryKey: ['overview'] });
          queryClient.invalidateQueries({ queryKey: ['trades'] });
          queryClient.invalidateQueries({ queryKey: ['performance'] });
          break;
        case 'bot:status':
          // Update bot status directly
          queryClient.setQueryData(['botStatus'], lastMessage.data);
          break;
      }
    }
  }, [lastMessage, queryClient]);

  // Bot control handlers using mutations
  function handleBotControl(action: 'start' | 'stop' | 'restart') {
    const mutation = action === 'start' ? startBot : action === 'stop' ? stopBot : restartBot;
    
    mutation.mutate(undefined, {
      onSuccess: () => {
        showToast(`Bot ${action}ed successfully`, 'success');
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : `Failed to ${action} bot`;
        showToast(message, 'error');
      }
    });
  }

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-slate-400">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ Error</div>
          <div className="text-slate-400 mb-4">{error}</div>
          <button
            onClick={() => queryClient.invalidateQueries()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const pnl = overview?.portfolio?.pnl ?? 0;
  const winRate = overview?.trades?.winRate ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-slate-400 mt-1">Monitor your paper trading performance</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Balance"
          value={formatUSD(overview?.portfolio?.balance || 0)}
          subtitle={`Started: ${formatUSD(overview?.portfolio?.startingBalance || 0)}`}
          trend={pnl >= 0 ? 'up' : 'down'}
          icon={pnl >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          title="Total P&L"
          value={formatUSD(pnl)}
          subtitle={formatPercent(parseFloat(overview?.portfolio?.pnlPercent || '0'))}
          trend={pnl >= 0 ? 'up' : 'down'}
          icon={pnl >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          title="Open Positions"
          value={formatUSD(overview?.portfolio?.openPositionsValue || 0)}
          subtitle={`${overview?.trades?.open || 0} active`}
          trend="neutral"
        />
        <StatCard
          title="Win Rate"
          value={`${safeToFixed(winRate, 1)}%`}
          subtitle={`${overview?.trades?.won || 0}W / ${overview?.trades?.lost || 0}L`}
          trend={winRate >= 50 ? 'up' : 'down'}
        />
        <StatCard
          title="Trades"
          value={formatNumber(overview?.trades?.total || 0)}
          subtitle={`${overview?.trades?.open || 0} open`}
          trend="neutral"
        />
      </div>

      {/* P&L Chart */}
      {performanceHistory.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">P&L History (Last 7 Days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceHistory.reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  tickFormatter={(value: number) => `$${safeToFixed(value, 0)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    color: '#fff'
                  }}
                  labelFormatter={(label) => `Date: ${label}`}
                  formatter={(value: number) => [`$${safeToFixed(value, 2)}`, 'Total P&L']}
                />
                <Line 
                  type="monotone" 
                  dataKey="totalPnl" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bot Controls */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold mb-2">Bot Control</h3>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${botStatus?.running ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span className="text-slate-300">
                {botStatus?.running ? 'Running' : 'Stopped'}
                {botStatus?.uptime ? ` (${Math.floor(botStatus.uptime / 60)}m uptime)` : ''}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleBotControl('start')}
              disabled={botStatus?.running || startBot.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
            <button
              onClick={() => handleBotControl('stop')}
              disabled={!botStatus?.running || stopBot.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
            <button
              onClick={() => handleBotControl('restart')}
              disabled={restartBot.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              Restart
            </button>
          </div>
        </div>
      </div>

      {/* Order Status Widget */}
      {orderStatsData && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold">Order Status</h3>
            </div>
            <Link
              to="/orders"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              View All →
            </Link>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-700/50 rounded p-3">
              <div className="text-slate-400 text-xs mb-1">Total Orders</div>
              <div className="text-xl font-bold text-white">{orderStatsData.combined.total}</div>
            </div>
            <div className="bg-slate-700/50 rounded p-3">
              <div className="text-slate-400 text-xs mb-1">Pending</div>
              <div className="text-xl font-bold text-yellow-400">{orderStatsData.combined.pending}</div>
            </div>
            <div className="bg-slate-700/50 rounded p-3">
              <div className="text-slate-400 text-xs mb-1">Open</div>
              <div className="text-xl font-bold text-blue-400">{orderStatsData.combined.open}</div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-400">Paper: {orderStatsData.paper.total}</div>
              </div>
              <div>
                <div className="text-slate-400">Real: {orderStatsData.real?.total || 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Trades */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Recent Paper Trades</h3>
        <div className="space-y-2">
          {recentTrades.map((trade: Trade) => (
            <div key={trade.id} className="bg-slate-700/50 rounded p-3">
              <div className="flex justify-between items-start mb-1">
                <div className="flex-1">
                  <div className="font-medium text-sm truncate">{trade.market_title}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {trade.outcome} @ ${trade.entry_price?.toFixed(2)}
                  </div>
                </div>
                <StatusBadge status={trade.status} />
              </div>
              <div className="flex justify-between items-center mt-2 text-xs">
                <span className="text-slate-400">
                  {timeAgo(trade.timestamp)}
                </span>
                {trade.pnl !== null && trade.pnl !== undefined && (
                  <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatUSD(trade.pnl)}
                  </span>
                )}
              </div>
            </div>
          ))}
          {recentTrades.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              No trades yet. Start the bot to begin monitoring.
            </div>
          )}
        </div>
      </div>

      {/* Connection Status */}
      {!isConnected && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
          <div className="text-sm text-yellow-200">
            WebSocket disconnected - data may not update in real-time
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, trend, icon: Icon }: StatCardProps) {
  const trendColors: StatusColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-slate-400',
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex justify-between items-start mb-3">
        <div className="text-sm text-slate-400">{title}</div>
        {Icon && <Icon className={`w-5 h-5 ${trendColors[trend as keyof typeof trendColors]}`} />}
      </div>
      <div className={`text-2xl font-bold mb-1 ${trendColors[trend as keyof typeof trendColors]}`}>
        {value}
      </div>
      <div className="text-sm text-slate-500">{subtitle}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: StatusColors = {
    OPEN: 'bg-blue-500/20 text-blue-400',
    WON: 'bg-green-500/20 text-green-400',
    LOST: 'bg-red-500/20 text-red-400',
    CANCELLED: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || colors.OPEN}`}>
      {status}
    </span>
  );
}
