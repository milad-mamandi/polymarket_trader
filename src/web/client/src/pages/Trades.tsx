import { useState } from 'react';
import { formatUSD, formatPercent, timeAgo, safeToFixed } from '../lib/utils';
import { Filter, Download, X, ExternalLink, TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import { useTrades } from '../hooks/useQueries';
import type { Trade } from '../lib/types';

export function Trades() {
  // Use React Query hook for data fetching
  const { data, isLoading, error } = useTrades({ limit: 1000 });
  const trades = data?.trades || [];
  
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  
  // Filters (local UI state)
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<string>('all');
  
  // Sorting (local UI state)
  const [sortColumn, setSortColumn] = useState<string>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Pagination (local UI state)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Helper function to format end date
  const formatEndDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) return 'Closed';
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Tomorrow';
      if (diffDays < 7) return `${diffDays}d`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '-';
    }
  };

  // Helper function to check if closing soon (within 24 hours)
  const isClosingSoon = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
      return diffHours >= 0 && diffHours < 24;
    } catch {
      return false;
    }
  };

  // Apply quick filters
  const applyQuickFilter = (trade: Trade): boolean => {
    if (quickFilter === 'all') return true;
    if (!trade.market_end_date) return false;
    
    try {
      const endDate = new Date(trade.market_end_date);
      const now = new Date();
      const diffMs = endDate.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (quickFilter === 'today') return diffHours >= 0 && diffHours < 24;
      if (quickFilter === 'week') return diffDays >= 0 && diffDays <= 7;
      if (quickFilter === 'soon') return diffHours >= 0 && diffHours < 48;
    } catch {
      return false;
    }
    
    return true;
  };

  // Filter trades
  const filteredTrades = trades.filter((trade: Trade) => {
    // Status filter
    if (statusFilter !== 'all' && trade.status !== statusFilter) {
      return false;
    }
    
    // Quick filter
    if (!applyQuickFilter(trade)) {
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

  // Sort trades
  const sortedTrades = [...filteredTrades].sort((a, b) => {
    let aVal: any;
    let bVal: any;
    
    switch (sortColumn) {
      case 'market_end_date':
        aVal = a.market_end_date ? new Date(a.market_end_date).getTime() : 0;
        bVal = b.market_end_date ? new Date(b.market_end_date).getTime() : 0;
        break;
      case 'timestamp':
        aVal = new Date(a.timestamp).getTime();
        bVal = new Date(b.timestamp).getTime();
        break;
      case 'virtual_amount':
        aVal = a.virtual_amount;
        bVal = b.virtual_amount;
        break;
      case 'confidence_score':
        aVal = a.confidence_score;
        bVal = b.confidence_score;
        break;
      case 'pnl':
        aVal = a.pnl || 0;
        bVal = b.pnl || 0;
        break;
      default:
        aVal = 0;
        bVal = 0;
    }
    
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  // Paginate
  const totalPages = Math.ceil(sortedTrades.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTrades = sortedTrades.slice(startIndex, startIndex + itemsPerPage);

  // Toggle sort column
  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  // Export to CSV
  function exportToCSV() {
    const headers = ['ID', 'Market', 'Outcome', 'Status', 'Closes', 'Entry Price', 'Exit Price', 'Amount', 'Shares', 'P&L', 'Confidence', 'Triggered By', 'Timestamp'];
    const rows = sortedTrades.map((t: Trade) => [
      t.id,
      t.market_title,
      t.outcome,
      t.status,
      t.market_end_date || '',
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

  if (isLoading) {
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
        <p className="text-sm mt-1">{error instanceof Error ? error.message : 'Failed to load trades'}</p>
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
            Showing {sortedTrades.length} of {trades.length} trades
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
          Filters & Sorting
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Sort By */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Sort By</label>
            <select
              value={sortColumn}
              onChange={(e) => setSortColumn(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="timestamp">Trade Date</option>
              <option value="market_end_date">End Date</option>
              <option value="virtual_amount">Amount</option>
              <option value="confidence_score">Confidence</option>
              <option value="pnl">P&L</option>
            </select>
          </div>

          {/* Sort Direction */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Direction</label>
            <select
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        {/* Quick Filters */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">Quick Filters</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setQuickFilter('all');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                quickFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              All Trades
            </button>
            <button
              onClick={() => {
                setQuickFilter('today');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                quickFilter === 'today'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Clock className="h-3 w-3 inline mr-1" />
              Closing Today
            </button>
            <button
              onClick={() => {
                setQuickFilter('soon');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                quickFilter === 'soon'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Clock className="h-3 w-3 inline mr-1" />
              Closing Soon (48h)
            </button>
            <button
              onClick={() => {
                setQuickFilter('week');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                quickFilter === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              This Week
            </button>
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
                <th 
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('market_end_date')}
                >
                  Closes <SortIcon column="market_end_date" />
                </th>
                <th 
                  className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('entry_price')}
                >
                  Entry <SortIcon column="entry_price" />
                </th>
                <th 
                  className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('virtual_amount')}
                >
                  Amount <SortIcon column="virtual_amount" />
                </th>
                <th 
                  className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('pnl')}
                >
                  P&L <SortIcon column="pnl" />
                </th>
                <th 
                  className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('confidence_score')}
                >
                  Confidence <SortIcon column="confidence_score" />
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('timestamp')}
                >
                  Time <SortIcon column="timestamp" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {paginatedTrades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No trades found
                  </td>
                </tr>
              ) : (
                paginatedTrades.map((trade: Trade) => (
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
                    <td className="px-4 py-3 text-sm">
                      {trade.market_end_date ? (
                        <span className={isClosingSoon(trade.market_end_date) ? 'text-yellow-400 font-semibold' : 'text-slate-300'}>
                          {formatEndDate(trade.market_end_date)}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
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
                        {safeToFixed(trade.confidence_score, 1)}
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
  // Use market_slug if available, fallback to market_id for older trades
  const marketUrl = trade.market_slug 
    ? `https://polymarket.com/event/${trade.market_slug}`
    : `https://polymarket.com/event/${trade.market_id}`;
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
            <InfoItem label="Shares" value={safeToFixed(trade.shares, 2)} />
            <InfoItem label="Confidence Score" value={safeToFixed(trade.confidence_score, 1)} />
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
