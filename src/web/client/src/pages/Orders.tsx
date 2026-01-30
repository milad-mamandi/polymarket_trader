import { useState, useEffect } from 'react';
import { formatUSD, formatPercent, timeAgo, safeToFixed } from '../lib/utils';
import { Filter, Download, X, ExternalLink, TrendingUp, TrendingDown, XCircle, DollarSign } from 'lucide-react';
import { useOrders, useOrderStats, useCancelOrder, useClosePosition } from '../hooks/useQueries';
import { useWebSocket } from '../hooks/useWebSocket';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../hooks/useQueries';
import { useToast } from '../components/ToastProvider';
import type { Order, OrderStatus } from '../lib/types';

export function Orders() {
  // Use React Query hooks for data fetching
  const { data, isLoading, error } = useOrders({ limit: 1000 });
  const { data: statsData } = useOrderStats();
  const cancelOrderMutation = useCancelOrder();
  const closePositionMutation = useClosePosition();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  
  const orders = data?.orders || [];
  
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closeSellType, setCloseSellType] = useState<'market' | 'limit'>('market');
  const [closeLimitPrice, setCloseLimitPrice] = useState<string>('');
  
  // Filters (local UI state)
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination (local UI state)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket();
  
  useEffect(() => {
    if (!lastMessage) return;
    
    if (lastMessage.type === 'order:status_changed' || 
        lastMessage.type === 'order:filled' ||
        lastMessage.type === 'order:partial_fill') {
      // Invalidate orders query to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      queryClient.invalidateQueries({ queryKey: queryKeys.orderStats });
    }
  }, [lastMessage, queryClient]);

  // Filter orders
  const filteredOrders = orders.filter((order: Order) => {
    // Type filter
    if (typeFilter !== 'all' && order.type !== typeFilter) {
      return false;
    }
    
    // Status filter
    if (statusFilter !== 'all' && order.status !== statusFilter) {
      return false;
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        order.marketTitle.toLowerCase().includes(query) ||
        order.outcome.toLowerCase().includes(query) ||
        order.triggeredBy.toLowerCase().includes(query) ||
        order.orderId?.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  // Paginate
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + itemsPerPage);

  // Cancel order handler
  async function handleCancelOrder(orderId: string) {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    
    try {
      await cancelOrderMutation.mutateAsync(orderId);
    } catch (error) {
      alert('Failed to cancel order: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  // Close position handler
  async function handleClosePosition() {
    if (!selectedOrder) return;
    
    try {
      const request = {
        type: selectedOrder.type,
        sellType: closeSellType,
        ...(closeSellType === 'limit' && { limitPrice: parseFloat(closeLimitPrice) }),
      };

      const result = await closePositionMutation.mutateAsync({ 
        orderId: selectedOrder.id, 
        request 
      });

      showToast(result.message, 'success');
      setShowCloseDialog(false);
      setSelectedOrder(null);
      setCloseSellType('market');
      setCloseLimitPrice('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to close position';
      showToast(message, 'error');
    }
  }

  // Export to CSV
  function exportToCSV() {
    const headers = ['ID', 'Type', 'Market', 'Outcome', 'Status', 'Order ID', 'Entry Price', 'Exit Price', 'Amount', 'Shares', 'P&L', 'Fee', 'Confidence', 'Triggered By', 'Timestamp'];
    const rows = filteredOrders.map((o: Order) => [
      o.id,
      o.type,
      `"${o.marketTitle}"`,
      o.outcome,
      o.status,
      o.orderId || '',
      o.entryPrice,
      o.exitPrice || '',
      o.amount,
      o.shares,
      o.pnl || '',
      o.feePaid || '',
      o.confidenceScore,
      o.triggeredBy,
      o.timestamp
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whale-scout-orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Get status badge color
  function getStatusColor(status: OrderStatus): string {
    switch (status) {
      case 'OPEN':
      case 'FILLED':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'PENDING':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'PARTIALLY_FILLED':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'WON':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'LOST':
      case 'FAILED':
      case 'EXPIRED':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'CANCELLED':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-slate-400">Loading orders...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-4">
        <p className="font-semibold">Error loading orders</p>
        <p className="text-sm mt-1">{error instanceof Error ? error.message : 'Failed to load orders'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Order Monitor</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time order status tracking (paper + real)</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Stats Cards */}
      {statsData && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm">Total Orders</div>
            <div className="text-2xl font-bold text-white mt-1">{statsData.combined.total}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm">Pending</div>
            <div className="text-2xl font-bold text-yellow-400 mt-1">{statsData.combined.pending}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm">Open</div>
            <div className="text-2xl font-bold text-blue-400 mt-1">{statsData.combined.open}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm">Amount at Risk</div>
            <div className="text-2xl font-bold text-orange-400 mt-1">${safeToFixed(statsData.combined.openAmount, 0)}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm">Paper</div>
            <div className="text-2xl font-bold text-purple-400 mt-1">{statsData.paper.total}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm">Real</div>
            <div className="text-2xl font-bold text-orange-400 mt-1">{statsData.real?.total || 0}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-sm font-medium">Filters:</span>
          </div>
          
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-700 text-white rounded px-3 py-1.5 text-sm border border-slate-600"
          >
            <option value="all">All Types</option>
            <option value="paper">Paper</option>
            <option value="real">Real</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-700 text-white rounded px-3 py-1.5 text-sm border border-slate-600"
          >
            <option value="all">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="OPEN">Open</option>
            <option value="FILLED">Filled</option>
            <option value="PARTIALLY_FILLED">Partially Filled</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="FAILED">Failed</option>
          </select>
          
          <input
            type="text"
            placeholder="Search markets, outcomes, wallets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] bg-slate-700 text-white rounded px-3 py-1.5 text-sm border border-slate-600 placeholder-slate-400"
          />
          
          {(typeFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setTypeFilter('all');
                setStatusFilter('all');
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="text-slate-400 hover:text-white text-sm flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
        
        <div className="mt-3 text-sm text-slate-400">
          Showing {paginatedOrders.length} of {filteredOrders.length} orders
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900 border-b border-slate-700">
              <tr>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Type</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Market</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Outcome</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Status</th>
                <th className="text-right p-4 text-slate-400 font-medium text-sm">Amount</th>
                <th className="text-right p-4 text-slate-400 font-medium text-sm">Entry Price</th>
                <th className="text-right p-4 text-slate-400 font-medium text-sm">P&L</th>
                <th className="text-left p-4 text-slate-400 font-medium text-sm">Time</th>
                <th className="text-right p-4 text-slate-400 font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    No orders found
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order: Order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="p-4">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        order.type === 'real' ? 'bg-orange-500/20 text-orange-400' : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {order.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="text-white font-medium max-w-xs truncate">{order.marketTitle}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-slate-300 text-sm">{order.outcome}</div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="p-4 text-right text-white font-mono">{formatUSD(order.amount)}</td>
                    <td className="p-4 text-right text-slate-300">{formatPercent(order.entryPrice)}</td>
                    <td className="p-4 text-right">
                      {order.pnl !== null && order.pnl !== undefined ? (
                        <div className={`flex items-center justify-end gap-1 ${order.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {order.pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span className="font-mono">{formatUSD(order.pnl)}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-400 text-sm">{timeAgo(order.timestamp)}</td>
                    <td className="p-4 text-right">
                      {order.type === 'real' && (order.status === 'OPEN' || order.status === 'PENDING') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelOrder(order.id);
                          }}
                          className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded transition-colors"
                          title="Cancel Order"
                          disabled={cancelOrderMutation.isPending}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-sm text-slate-400">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedOrder(null)}>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Order Details</h2>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-slate-400 text-sm">Order ID</div>
                  <div className="text-white font-mono text-sm">{selectedOrder.id}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-sm">Type</div>
                  <div className="text-white">{selectedOrder.type.toUpperCase()}</div>
                </div>
              </div>
              
              <div>
                <div className="text-slate-400 text-sm">Market</div>
                <div className="text-white font-medium">{selectedOrder.marketTitle}</div>
              </div>
              
              <div>
                <div className="text-slate-400 text-sm">Outcome</div>
                <div className="text-white">{selectedOrder.outcome}</div>
              </div>
              
              {selectedOrder.orderId && (
                <div>
                  <div className="text-slate-400 text-sm">CLOB Order ID</div>
                  <div className="text-white font-mono text-sm">{selectedOrder.orderId}</div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-slate-400 text-sm">Status</div>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium border mt-1 ${getStatusColor(selectedOrder.status)}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <div>
                  <div className="text-slate-400 text-sm">Confidence Score</div>
                  <div className="text-white">{selectedOrder.confidenceScore}%</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-slate-400 text-sm">Entry Price</div>
                  <div className="text-white">{formatPercent(selectedOrder.entryPrice)}</div>
                </div>
                {selectedOrder.exitPrice && (
                  <div>
                    <div className="text-slate-400 text-sm">Exit Price</div>
                    <div className="text-white">{formatPercent(selectedOrder.exitPrice)}</div>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-slate-400 text-sm">Amount</div>
                  <div className="text-white font-mono">{formatUSD(selectedOrder.amount)}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-sm">Shares</div>
                  <div className="text-white">{safeToFixed(selectedOrder.shares, 2)}</div>
                </div>
              </div>
              
              {selectedOrder.pnl !== null && selectedOrder.pnl !== undefined && (
                <div>
                  <div className="text-slate-400 text-sm">Profit/Loss</div>
                  <div className={`text-lg font-bold ${selectedOrder.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatUSD(selectedOrder.pnl)}
                  </div>
                </div>
              )}
              
              {selectedOrder.feePaid && (
                <div>
                  <div className="text-slate-400 text-sm">Fee Paid</div>
                  <div className="text-white font-mono">{formatUSD(selectedOrder.feePaid)}</div>
                </div>
              )}
              
              {selectedOrder.transactionHash && (
                <div>
                  <div className="text-slate-400 text-sm">Transaction Hash</div>
                  <div className="text-blue-400 font-mono text-sm flex items-center gap-2">
                    <span className="truncate">{selectedOrder.transactionHash}</span>
                    <a
                      href={`https://polygonscan.com/tx/${selectedOrder.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-300"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}
              
              <div>
                <div className="text-slate-400 text-sm">Triggered By</div>
                <div className="text-white font-mono text-sm">{selectedOrder.triggeredBy}</div>
              </div>
              
              <div>
                <div className="text-slate-400 text-sm">Timestamp</div>
                <div className="text-white">{new Date(selectedOrder.timestamp).toLocaleString()}</div>
              </div>
            </div>
            
            {selectedOrder.type === 'real' && (selectedOrder.status === 'OPEN' || selectedOrder.status === 'PENDING') && (
              <div className="mt-6 pt-6 border-t border-slate-700">
                <div className="flex gap-2">
                  {/* Close Position button (for OPEN orders) */}
                  {selectedOrder.status === 'OPEN' && (
                    <button
                      onClick={() => setShowCloseDialog(true)}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <DollarSign className="w-4 h-4" />
                      Close Position
                    </button>
                  )}
                  
                  {/* Cancel button (for pending/open real orders) */}
                  <button
                    onClick={() => {
                      handleCancelOrder(selectedOrder.id);
                      setSelectedOrder(null);
                    }}
                    className={`${selectedOrder.status === 'OPEN' ? 'flex-1' : 'w-full'} px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2`}
                    disabled={cancelOrderMutation.isPending}
                  >
                    <XCircle className="w-4 h-4" />
                    {cancelOrderMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Close Position Dialog */}
      {showCloseDialog && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Close Position</h3>
                <p className="text-sm text-slate-400 mt-1">
                  {selectedOrder.type === 'paper' ? 'Paper' : 'Real'} Trade - {selectedOrder.marketTitle}
                </p>
              </div>
              <button
                onClick={() => setShowCloseDialog(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedOrder.type === 'paper' ? (
              /* Paper trade - simple market close */
              <div className="space-y-4">
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-sm text-slate-300">
                    This will close your position at the current market price.
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    Shares: {safeToFixed(selectedOrder.shares, 2)} @ {formatPercent(selectedOrder.entryPrice)}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCloseDialog(false)}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClosePosition}
                    disabled={closePositionMutation.isPending}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    {closePositionMutation.isPending ? 'Closing...' : 'Close at Market'}
                  </button>
                </div>
              </div>
            ) : (
              /* Real trade - market or limit sell */
              <div className="space-y-4">
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-xs text-slate-400">
                    Shares: {safeToFixed(selectedOrder.shares, 2)} @ {formatPercent(selectedOrder.entryPrice)}
                  </div>
                </div>

                {/* Sell Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Sell Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCloseSellType('market')}
                      className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                        closeSellType === 'market'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      Market
                    </button>
                    <button
                      onClick={() => setCloseSellType('limit')}
                      className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                        closeSellType === 'limit'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      Limit
                    </button>
                  </div>
                </div>

                {/* Limit Price Input */}
                {closeSellType === 'limit' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Limit Price
                    </label>
                    <input
                      type="number"
                      value={closeLimitPrice}
                      onChange={(e) => setCloseLimitPrice(e.target.value)}
                      placeholder="0.50"
                      step="0.01"
                      min="0"
                      max="1"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="text-xs text-slate-400 mt-1">
                      Price must be between 0 and 1
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCloseDialog(false)}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClosePosition}
                    disabled={closePositionMutation.isPending || (closeSellType === 'limit' && !closeLimitPrice)}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    {closePositionMutation.isPending ? 'Placing Order...' : `Sell ${closeSellType === 'market' ? 'at Market' : 'Limit'}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
