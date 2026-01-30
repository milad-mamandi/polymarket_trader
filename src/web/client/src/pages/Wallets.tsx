import { useState } from 'react';
import { formatPercent, formatNumber, timeAgo, safeToFixed } from '../lib/utils';
import { Search, X, ExternalLink, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useWallets, useWallet } from '../hooks/useQueries';
import type { Wallet, Trade } from '../lib/types';

export function Wallets() {
  // Use React Query hook for data fetching
  const { data, isLoading, error: queryError } = useWallets();
  const wallets = data?.wallets || [];
  
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sorting (local UI state)
  const [sortBy, setSortBy] = useState<'trades' | 'winRate' | 'volume' | 'recent'>('trades');

  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load wallets') : null;

  // Filter and sort wallets
  const filteredWallets = wallets
    .filter((wallet: Wallet) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return wallet.address.toLowerCase().includes(query);
    })
    .sort((a: Wallet, b: Wallet) => {
      switch (sortBy) {
        case 'trades':
          return b.total_trades - a.total_trades;
        case 'winRate':
          return b.winRate - a.winRate;
        case 'volume':
          return (b.total_volume || 0) - (a.total_volume || 0);
        case 'recent':
          return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
        default:
          return 0;
      }
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-slate-400">Loading wallets...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-4">
        <p className="font-semibold">Error loading wallets</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Tracked Wallets</h1>
        <p className="text-slate-400 mt-1">
          {filteredWallets.length} wallet{filteredWallets.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Search and Sort */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Search by Address</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="0x..."
                className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
              />
            </div>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'trades' | 'winRate' | 'volume' | 'recent')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="trades">Most Trades</option>
              <option value="winRate">Highest Win Rate</option>
              <option value="volume">Highest Volume</option>
              <option value="recent">Most Recent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Wallets Grid */}
      {filteredWallets.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-8 text-center text-slate-400">
          No wallets found
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWallets.map((wallet: Wallet) => (
            <WalletCard
              key={wallet.address}
              wallet={wallet}
              onClick={() => setSelectedWallet(wallet.address)}
            />
          ))}
        </div>
      )}

      {/* Wallet Details Modal */}
      {selectedWallet && (
        <WalletModal
          address={selectedWallet}
          onClose={() => setSelectedWallet(null)}
        />
      )}
    </div>
  );
}

function WalletCard({ wallet, onClick }: { wallet: Wallet; onClick: () => void }) {
  const badges = [];
  if (wallet.is_whale) badges.push('WHALE');
  if (wallet.is_new_suspicious) badges.push('NEW');

  return (
    <div
      onClick={onClick}
      className="bg-slate-800 hover:bg-slate-750 rounded-lg p-4 cursor-pointer transition-colors border border-slate-700 hover:border-slate-600"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm text-white truncate mb-1">
            {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
          </div>
          <div className="flex gap-1">
            {badges.map(badge => (
              <span
                key={badge}
                className="inline-flex items-center px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded"
              >
                {badge}
              </span>
            ))}
            {badges.length === 0 && (
              <span className="inline-flex items-center px-2 py-0.5 bg-slate-600/20 text-slate-400 text-xs rounded">
                TRACKED
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Total Trades</span>
          <span className="text-white font-semibold">{wallet.total_trades}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Win Rate</span>
          <span className={`font-semibold ${wallet.winRate >= 60 ? 'text-green-400' : wallet.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
            {formatPercent(wallet.winRate / 100)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Score</span>
          <span className="text-white font-semibold">{safeToFixed(wallet.suspicion_score, 1)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Last Seen</span>
          <span className="text-slate-300 text-sm">{timeAgo(wallet.last_seen)}</span>
        </div>
      </div>
    </div>
  );
}

function WalletModal({ address, onClose }: { address: string; onClose: () => void }) {
  // Use React Query hook for fetching wallet details
  const { data, isLoading, error: queryError } = useWallet(address);
  
  const wallet = data?.wallet || null;
  const trades = data?.trades || [];
  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load wallet details') : null;

  const walletUrl = `https://polygonscan.com/address/${address}`;
  const badges = [];
  if (wallet?.is_whale) badges.push('WHALE');
  if (wallet?.is_new_suspicious) badges.push('NEW');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-700">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white mb-2 font-mono break-all">{address}</h2>
            <div className="flex gap-2">
              {badges.map(badge => (
                <span
                  key={badge}
                  className="inline-flex items-center px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded"
                >
                  {badge}
                </span>
              ))}
              {badges.length === 0 && (
                <span className="inline-flex items-center px-2 py-1 bg-slate-600/20 text-slate-400 text-xs rounded">
                  TRACKED
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors ml-4"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <div className="text-slate-400">Loading wallet details...</div>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-4">
              <p className="font-semibold">Error loading wallet</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : wallet ? (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Total Trades"
                  value={wallet.total_trades.toString()}
                  icon={<Activity className="h-5 w-5 text-blue-400" />}
                />
                <StatCard
                  label="Wins"
                  value={wallet.win_count.toString()}
                  icon={<TrendingUp className="h-5 w-5 text-green-400" />}
                />
                <StatCard
                  label="Losses"
                  value={wallet.loss_count.toString()}
                  icon={<TrendingDown className="h-5 w-5 text-red-400" />}
                />
                <StatCard
                  label="Win Rate"
                  value={formatPercent(wallet.winRate / 100)}
                  icon={<Activity className="h-5 w-5 text-slate-400" />}
                  valueColor={wallet.winRate >= 60 ? 'text-green-400' : wallet.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}
                />
              </div>

              {/* More Info */}
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Suspicion Score" value={safeToFixed(wallet.suspicion_score, 1)} />
                <InfoItem label="First Seen" value={timeAgo(wallet.first_seen)} />
                <InfoItem label="Last Seen" value={timeAgo(wallet.last_seen)} />
                {wallet.total_volume && (
                  <InfoItem label="Total Volume" value={`$${formatNumber(wallet.total_volume)}`} />
                )}
              </div>

              {/* View on Polygonscan */}
              <a
                href={walletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-semibold"
              >
                View on Polygonscan
                <ExternalLink className="h-4 w-4" />
              </a>

              {/* Trade History */}
              {trades.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Trade History ({trades.length})</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {trades.map((trade: Trade) => (
                      <TradeRow key={trade.id} trade={trade} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, valueColor = 'text-white' }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="bg-slate-700/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      <div className="text-white font-semibold">{value}</div>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  return (
    <div className="bg-slate-700/50 rounded-lg p-3 hover:bg-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-medium text-sm truncate flex-1 mr-4">
          {trade.market_title}
        </span>
        <StatusBadge status={trade.status} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">{trade.outcome}</span>
        <div className="flex items-center gap-3">
          {trade.pnl !== null && (
            <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
              {trade.pnl >= 0 ? '+' : ''}${safeToFixed(trade.pnl, 2)}
            </span>
          )}
          <span className="text-slate-500">{timeAgo(trade.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    OPEN: 'bg-blue-500/20 text-blue-400',
    WON: 'bg-green-500/20 text-green-400',
    LOST: 'bg-red-500/20 text-red-400',
    CANCELLED: 'bg-slate-500/20 text-slate-400',
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs rounded ${styles[status as keyof typeof styles] || styles.CANCELLED}`}>
      {status}
    </span>
  );
}
