import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatUSD, formatPercent, formatNumber, truncateAddress, timeAgo } from '../lib/utils';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Trade, Wallet, BotStatus, OverviewResponse } from '../lib/types';

export function Dashboard() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { isConnected, lastMessage } = useWebSocket();

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'portfolio':
        case 'trade:new':
        case 'trade:resolved':
          // Reload data when trades update
          loadData();
          break;
        case 'bot:status':
          setBotStatus(lastMessage.data);
          break;
      }
    }
  }, [lastMessage]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      
      const [overviewData, tradesData, walletsData, statusData] = await Promise.all([
        api.getOverview(),
        api.getTrades({ limit: 20 }),
        api.getWallets(),
        api.getBotStatus(),
      ]);
      
      setOverview(overviewData);
      setTrades(tradesData.trades || []);
      setWallets(walletsData.wallets || []);
      setBotStatus(statusData);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleBotControl(action: 'start' | 'stop' | 'restart') {
    try {
      if (action === 'start') await api.startBot();
      if (action === 'stop') await api.stopBot();
      if (action === 'restart') await api.restartBot();
      
      // Refresh status
      const status = await api.getBotStatus();
      setBotStatus(status);
    } catch (err: any) {
      alert(err.message || 'Failed to control bot');
    }
  }

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-slate-400">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ Error</div>
          <div className="text-slate-400">{error}</div>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">🐋 Whale Scout Dashboard</h1>
              <p className="text-sm text-slate-400 mt-1">Real-time paper trading monitor</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-slate-400">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <button
                onClick={() => api.logout().then(() => window.location.reload())}
                className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Balance"
            value={formatUSD(overview?.portfolio?.balance || 0)}
            subtitle={`Started: ${formatUSD(overview?.portfolio?.startingBalance || 0)}`}
            trend={(overview?.portfolio?.pnl ?? 0) >= 0 ? 'up' : 'down'}
          />
          <StatCard
            title="Total P&L"
            value={formatUSD(overview?.portfolio?.pnl ?? 0)}
            subtitle={formatPercent(parseFloat(overview?.portfolio?.pnlPercent || '0'))}
            trend={(overview?.portfolio?.pnl ?? 0) >= 0 ? 'up' : 'down'}
          />
          <StatCard
            title="Win Rate"
            value={`${(overview?.trades?.winRate ?? 0).toFixed(1)}%`}
            subtitle={`${overview?.trades?.won || 0}W / ${overview?.trades?.lost || 0}L`}
            trend={(overview?.trades?.winRate ?? 0) >= 50 ? 'up' : 'down'}
          />
          <StatCard
            title="Trades"
            value={formatNumber(overview?.trades?.total || 0)}
            subtitle={`${overview?.trades?.open || 0} open`}
            trend="neutral"
          />
        </div>

        {/* Bot Status */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold mb-2">Bot Status</h3>
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
                disabled={botStatus?.running}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded"
              >
                Start
              </button>
              <button
                onClick={() => handleBotControl('stop')}
                disabled={!botStatus?.running}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded"
              >
                Stop
              </button>
              <button
                onClick={() => handleBotControl('restart')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Restart
              </button>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Trades */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">Recent Paper Trades</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {trades.slice(0, 10).map((trade: any) => (
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
                    <span className="text-slate-400">{timeAgo(trade.timestamp)}</span>
                    {trade.pnl !== null && trade.pnl !== undefined && (
                      <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {formatUSD(trade.pnl)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {trades.length === 0 && (
                <div className="text-center text-slate-400 py-8">No trades yet</div>
              )}
            </div>
          </div>

          {/* Watched Wallets */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">Watched Wallets</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {wallets.slice(0, 10).map((wallet: any) => (
                <div key={wallet.address} className="bg-slate-700/50 rounded p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-mono text-sm">{truncateAddress(wallet.address)}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {wallet.is_whale && <span className="text-blue-400">Whale • </span>}
                        {wallet.is_new_suspicious && <span className="text-yellow-400">Suspicious • </span>}
                        Score: {wallet.suspicion_score?.toFixed(0) || 0}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{formatUSD(wallet.total_volume || 0)}</div>
                      <div className="text-xs text-slate-400">
                        {wallet.win_count || 0}W / {wallet.loss_count || 0}L
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {wallets.length === 0 && (
                <div className="text-center text-slate-400 py-8">No wallets tracked</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, subtitle, trend }: any) {
  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-slate-400',
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="text-sm text-slate-400 mb-1">{title}</div>
      <div className={`text-2xl font-bold mb-1 ${trendColors[trend as keyof typeof trendColors]}`}>
        {value}
      </div>
      <div className="text-sm text-slate-500">{subtitle}</div>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const colors: any = {
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
