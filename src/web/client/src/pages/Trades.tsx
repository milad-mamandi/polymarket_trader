import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatUSD, formatPercent, timeAgo } from '../lib/utils';
import { Filter, Download, X, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';
import type { Trade } from '../lib/types';

export function Trades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  useEffect(() => {
    loadTrades();
  }, []);

  async function loadTrades() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTrades({ limit: 1000 }); // Load all trades
      setTrades(data.trades || []); // Extract trades array from response
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    // Status filter
    if (statusFilter !== 'all' && trade.status !== statusFilter) {
      return false;
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        trade.market_title.toLowerCase().includes(query) ||
        trade.outcome.toLowerCase().includes(query) ||
        trade.triggered_by.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  // Paginate
  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTrades = filteredTrades.slice(startIndex, startIndex + itemsPerPage);

  // Export to CSV
  function exportToCSV() {
    const headers = ['ID', 'Market', 'Outcome', 'Status', 'Entry Price', 'Exit Price', 'Amount', 'Shares', 'P&L', 'Confidence', 'Triggered By', 'Timestamp'];
    const rows = filteredTrades.map(t => [
      t.id,
      `"${t.market_title}"`,
      t.outcome,
      t.status,
      t.entry_price,
      t.exit_price || '',
      t.virtual_amount,
      t.shares,
      t.pnl || '',
      t.confidence_score,
      t.triggered_by,
      t.timestamp
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whale-scout-trades-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-slate-400">Loading trades...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-4">
        <p className="font-semibold">Error loading trades</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Paper Trades</h1>
          <p className="text-slate-400 mt-1">
            Showing {filteredTrades.length} of {trades.length} trades
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Filter className="h-5 w-5" />
          Filters
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Market, outcome, or wallet..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="WON">Won</option>
              <option value="LOST">Lost</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Trades Table */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Market</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Outcome</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">Entry</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">Amount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">P&L</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">Confidence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {paginatedTrades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No trades found
                  </td>
                </tr>
              ) : (
                paginatedTrades.map((trade) => (
                  <tr
                    key={trade.id}
                    onClick={() => setSelectedTrade(trade)}
                    className="hover:bg-slate-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-white max-w-xs truncate">
                      {trade.market_title}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                        {trade.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={trade.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {formatPercent(trade.entry_price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {formatUSD(trade.virtual_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trade.pnl !== null ? (
                        <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {trade.pnl >= 0 ? '+' : ''}{formatUSD(trade.pnl)}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-slate-300">
                        {trade.confidence_score.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {timeAgo(trade.timestamp)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
            <div className="text-sm text-slate-400">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Trade Details Modal */}
      {selectedTrade && (
        <TradeModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
      )}
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

function TradeModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const marketUrl = `https://polymarket.com/event/${trade.market_id}`;
  const walletUrl = `https://polygonscan.com/address/${trade.triggered_by}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-700">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white mb-2">{trade.market_title}</h2>
            <div className="flex items-center gap-3">
              <StatusBadge status={trade.status} />
              <span className="inline-flex items-center px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                {trade.outcome}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* P&L Summary (if resolved) */}
          {trade.pnl !== null && (
            <div className={`rounded-lg p-4 ${trade.pnl >= 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {trade.pnl >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-400" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-400" />
                  )}
                  <span className="text-sm text-slate-300">Profit & Loss</span>
                </div>
                <span className={`text-2xl font-bold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {trade.pnl >= 0 ? '+' : ''}{formatUSD(trade.pnl)}
                </span>
              </div>
            </div>
          )}

          {/* Trade Details */}
          <div className="grid grid-cols-2 gap-4">
            <InfoItem label="Entry Price" value={formatPercent(trade.entry_price)} />
            <InfoItem label="Exit Price" value={trade.exit_price ? formatPercent(trade.exit_price) : '-'} />
            <InfoItem label="Amount" value={formatUSD(trade.virtual_amount)} />
            <InfoItem label="Shares" value={trade.shares.toFixed(2)} />
            <InfoItem label="Confidence Score" value={trade.confidence_score.toFixed(1)} />
            <InfoItem label="Created" value={timeAgo(trade.timestamp)} />
          </div>

          {/* Triggered By */}
          <div>
            <div className="text-sm text-slate-400 mb-2">Triggered By Wallet</div>
            <a
              href={walletUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-mono text-sm"
            >
              <span className="truncate">{trade.triggered_by}</span>
              <ExternalLink className="h-4 w-4 flex-shrink-0" />
            </a>
          </div>

          {/* View on Polymarket */}
          <a
            href={marketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-semibold"
          >
            View Market on Polymarket
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
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
