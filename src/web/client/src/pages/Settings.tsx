import { useState } from 'react';
import { useToast } from '../components/ToastProvider';
import { formatMs, formatNumber, safeToFixed } from '../lib/utils';
import { Save, AlertCircle, Trash2, AlertTriangle, Shield } from 'lucide-react';
import { useConfig, useUpdateConfig, useBotControl } from '../hooks/useQueries';
import axios from 'axios';
import type { ConfigValue, SafetyStatus, KillSwitchStatus } from '../lib/types';

interface ConfigItem {
  key: string;
  value: ConfigValue;
  type: string;
  category: string;
  description: string;
  min?: number;
  max?: number;
  masked?: boolean;
  secret?: boolean;
  options?: string[];
}

export function Settings() {
  // Use React Query hooks
  const { data: configData, isLoading, error: queryError, refetch } = useConfig();
  const updateConfigMutation = useUpdateConfig();
  const { resetData } = useBotControl();
  
  const [editedValues, setEditedValues] = useState<Record<string, ConfigValue>>({});
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showKillSwitchDialog, setShowKillSwitchDialog] = useState(false);
  const [killSwitchAction, setKillSwitchAction] = useState<'activate' | 'deactivate'>('activate');
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);
  
  const { showToast } = useToast();

  const config = configData?.config || null;
  const killSwitchStatus: KillSwitchStatus = configData?.killSwitch || { activated: false };
  const safetyStatus: SafetyStatus | null = configData?.safetyStatus || null;
  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load configuration') : null;

  async function handleSave() {
    if (Object.keys(editedValues).length === 0) {
      showToast('No changes to save', 'info');
      return;
    }

    updateConfigMutation.mutate(editedValues, {
      onSuccess: () => {
        showToast(`Saved ${Object.keys(editedValues).length} change(s). Restart the bot for changes to take effect.`, 'success');
        setEditedValues({});
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to save configuration';
        showToast(message, 'error');
      }
    });
  }

  function handleChange(key: string, value: ConfigValue) {
    setEditedValues(prev => ({
      ...prev,
      [key]: value
    }));
  }

  async function handleReset() {
    resetData.mutate(undefined, {
      onSuccess: () => {
        showToast('Trading data reset successfully! All paper trades and performance history cleared.', 'success');
        setShowResetDialog(false);
        
        // Navigate to dashboard
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to reset data';
        showToast(message, 'error');
      }
    });
  }

  async function handleKillSwitch(action: 'activate' | 'deactivate') {
    setKillSwitchLoading(true);
    
    try {
      const endpoint = action === 'activate' 
        ? '/api/config/killswitch/activate' 
        : '/api/config/killswitch/deactivate';
      
      const response = await axios.post(endpoint, {
        reason: 'User action from dashboard'
      });
      
      showToast(response.data.message, 'success');
      setShowKillSwitchDialog(false);
      
      // Refetch config to update status
      refetch();
    } catch (err: unknown) {
      let message = `Failed to ${action} kill switch`;
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        message = err.response.data.error;
      } else if (err instanceof Error) {
        message = err.message;
      }
      showToast(message, 'error');
    } finally {
      setKillSwitchLoading(false);
    }
  }

  function renderInput(item: ConfigItem) {
    const currentValue = editedValues[item.key] !== undefined ? editedValues[item.key] : item.value;
    const hasChanges = editedValues[item.key] !== undefined;
    const isTimingField = item.key.endsWith('_MS');

    if (item.type === 'boolean') {
      return (
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={currentValue === true || currentValue === 'true'}
            onChange={(e) => handleChange(item.key, e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      );
    }

    if (item.type === 'number') {
      return (
        <div className="space-y-1">
          <input
            type="number"
            value={typeof currentValue === 'number' ? currentValue : ''}
            onChange={(e) => handleChange(item.key, e.target.value === '' ? '' : Number(e.target.value))}
            min={item.min}
            max={item.max}
            className={`
              w-full px-3 py-2 bg-slate-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
              ${hasChanges ? 'border-yellow-500' : 'border-slate-600'}
            `}
          />
          {/* Show formatted number with commas */}
          {typeof currentValue === 'number' && currentValue >= 1000 && (
            <div className="text-xs text-slate-500">
              = {formatNumber(Number(currentValue))}
            </div>
          )}
          {/* Show time conversion for ms fields */}
          {isTimingField && typeof currentValue === 'number' && (
            <div className="text-xs text-blue-400">
              {formatMs(Number(currentValue))}
            </div>
          )}
        </div>
      );
    }

    if (item.type === 'string') {
      if (item.secret && item.masked) {
        return (
          <input
            type="password"
            value={typeof currentValue === 'string' ? currentValue : ''}
            onChange={(e) => handleChange(item.key, e.target.value)}
            placeholder="Enter new value to change"
            className={`
              w-full px-3 py-2 bg-slate-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
              ${hasChanges ? 'border-yellow-500' : 'border-slate-600'}
            `}
          />
        );
      }

      return (
        <input
          type="text"
          value={typeof currentValue === 'string' ? currentValue : ''}
          onChange={(e) => handleChange(item.key, e.target.value)}
          className={`
            w-full px-3 py-2 bg-slate-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
            ${hasChanges ? 'border-yellow-500' : 'border-slate-600'}
          `}
        />
      );
    }

    if (item.type === 'select' && item.options) {
      const selectValue = typeof currentValue === 'string' || typeof currentValue === 'number' 
        ? String(currentValue) 
        : '';
      return (
        <select
          value={selectValue}
          onChange={(e) => handleChange(item.key, e.target.value)}
          className={`
            w-full px-3 py-2 bg-slate-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
            ${hasChanges ? 'border-yellow-500' : 'border-slate-600'}
          `}
        >
          {item.options.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-slate-400">Loading settings...</div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ Error</div>
          <div className="text-slate-400 mb-4">{error || 'Failed to load settings'}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Group config by category
  const categories: Record<string, ConfigItem[]> = {};
  (Object.values(config) as ConfigItem[]).forEach((item: ConfigItem) => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 mt-1">Configure bot behavior and trading parameters</p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateConfigMutation.isPending || Object.keys(editedValues).length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {updateConfigMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Alerts */}
      {/* Restart Required Warning - Always visible */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium text-blue-200 mb-1">Configuration Changes Require Bot Restart</div>
          <div className="text-xs text-blue-300">
            Changes to settings are saved to the .env file but won't take effect until you restart the bot process. 
            The bot must be restarted manually to reload configuration values.
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-200">{error}</div>
        </div>
      )}

      {Object.keys(editedValues).length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
          <div className="text-sm text-yellow-200">
            You have {Object.keys(editedValues).length} unsaved change(s). Click "Save Changes" to apply.
          </div>
        </div>
      )}

      {/* Config Categories */}
      {Object.entries(categories).map(([category, items]) => (
        <div key={category} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="bg-slate-750 px-6 py-3 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">{category}</h2>
          </div>
          <div className="p-6 space-y-6">
            {items.map(item => (
              <div key={item.key} className="space-y-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-slate-200">
                      {item.key.replace(/_/g, ' ')}
                    </label>
                    <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                    {item.min !== undefined && item.max !== undefined && (
                      <p className="text-xs text-slate-500 mt-1">
                        Range: {item.min} - {item.max}
                      </p>
                    )}
                  </div>
                  <div className="w-64">
                    {renderInput(item)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Emergency Controls - Kill Switch (only shown if real trading mode) */}
      {config && config['TRADING_MODE']?.value === 'real' && (
        <div className="bg-slate-800 rounded-lg border border-orange-700 overflow-hidden">
          <div className="bg-orange-900/20 px-6 py-3 border-b border-orange-700">
            <h2 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Emergency Controls
            </h2>
          </div>
          <div className="p-6 space-y-4">
            {/* Dry Run Mode Banner */}
            {safetyStatus?.dryRunMode && (
              <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-blue-400" />
                <div>
                  <div className="text-sm font-medium text-blue-200">DRY RUN MODE ACTIVE</div>
                  <div className="text-xs text-blue-300">Trades are logged but NOT executed on Polymarket</div>
                </div>
              </div>
            )}

            {/* Kill Switch Status */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-700">
              <div>
                <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  {killSwitchStatus.activated ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Kill Switch: ACTIVE
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 text-green-500" />
                      Kill Switch: Inactive
                    </>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {killSwitchStatus.activated 
                    ? 'All real trading is currently disabled. Open orders have been cancelled.'
                    : 'Emergency stop is ready if needed. Click to immediately cancel all orders and disable trading.'}
                </p>
                {killSwitchStatus.activated && killSwitchStatus.activatedAt && (
                  <p className="text-xs text-slate-500 mt-1">
                    Activated: {new Date(killSwitchStatus.activatedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setKillSwitchAction(killSwitchStatus.activated ? 'deactivate' : 'activate');
                  setShowKillSwitchDialog(true);
                }}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                  ${killSwitchStatus.activated 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'}
                `}
              >
                <AlertTriangle className="w-4 h-4" />
                {killSwitchStatus.activated ? 'Reactivate Trading' : 'Emergency Stop'}
              </button>
            </div>

            {/* Safety Status */}
            {safetyStatus && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Trading Hours Status</p>
                  <p className={`font-medium ${safetyStatus.withinTradingHours ? 'text-green-400' : 'text-yellow-400'}`}>
                    {safetyStatus.withinTradingHours ? 'Active' : 'Outside Hours'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Daily Budget</p>
                  <p className="font-medium text-white">
                    ${safeToFixed(safetyStatus.remainingBudget, 2)} / ${safeToFixed(safetyStatus.dailyLimit, 2)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Today's Spending</p>
                  <p className="font-medium text-white">
                    ${safeToFixed(safetyStatus.todaySpending, 2)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Trading Status</p>
                  <p className={`font-medium ${safetyStatus.tradingEnabled && !killSwitchStatus.activated ? 'text-green-400' : 'text-red-400'}`}>
                    {safetyStatus.tradingEnabled && !killSwitchStatus.activated ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Kill Switch</p>
                  <p className={`font-medium ${safetyStatus.killSwitchEnabled ? 'text-red-400' : 'text-green-400'}`}>
                    {safetyStatus.killSwitchEnabled ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Dry Run Mode</p>
                  <p className={`font-medium ${safetyStatus.dryRunMode ? 'text-blue-400' : 'text-slate-500'}`}>
                    {safetyStatus.dryRunMode ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Slippage Limit</p>
                  <p className="font-medium text-white">
                    {config && config['REAL_TRADING_MAX_SLIPPAGE_PERCENT']?.value 
                      ? `${config['REAL_TRADING_MAX_SLIPPAGE_PERCENT'].value}%`
                      : '2%'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Confirmation Delay</p>
                  <p className="font-medium text-white">
                    {config && config['REAL_TRADING_CONFIRMATION_DELAY_MS']?.value 
                      ? (Number(config['REAL_TRADING_CONFIRMATION_DELAY_MS'].value) === 0 
                          ? 'Instant' 
                          : formatMs(Number(config['REAL_TRADING_CONFIRMATION_DELAY_MS'].value)))
                      : 'Instant'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Danger Zone - Reset Trading Data */}
      <div className="bg-slate-800 rounded-lg border border-red-700 overflow-hidden">
        <div className="bg-red-900/20 px-6 py-3 border-b border-red-700">
          <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
        </div>
        <div className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-medium text-slate-200">Reset Trading Data</h3>
              <p className="text-xs text-slate-400 mt-1">
                Clear all paper trades and performance history. This action cannot be undone.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Note: Detected wallets and their trades will be preserved.
              </p>
            </div>
            <button
              onClick={() => setShowResetDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Reset Data
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Reset Trading Data?</h3>
                <p className="text-sm text-slate-300 mb-2">
                  This will permanently delete:
                </p>
                <ul className="text-sm text-slate-400 list-disc list-inside space-y-1 mb-4">
                  <li>All paper trades (open and closed)</li>
                  <li>All performance history</li>
                  <li>Paper balance will reset to initial value</li>
                </ul>
                <p className="text-sm text-slate-300">
                  Detected wallets and their trades will <strong>not</strong> be affected.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowResetDialog(false)}
                disabled={resetData.isPending}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetData.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {resetData.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Resetting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Yes, Reset Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kill Switch Confirmation Dialog */}
      {showKillSwitchDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className={`w-6 h-6 flex-shrink-0 mt-0.5 ${killSwitchAction === 'activate' ? 'text-red-500' : 'text-green-500'}`} />
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {killSwitchAction === 'activate' ? 'Activate Kill Switch?' : 'Deactivate Kill Switch?'}
                </h3>
                <p className="text-sm text-slate-300 mb-2">
                  {killSwitchAction === 'activate' ? (
                    <>This will immediately:</>
                  ) : (
                    <>This will allow real trading to resume.</>
                  )}
                </p>
                {killSwitchAction === 'activate' && (
                  <ul className="text-sm text-slate-400 list-disc list-inside space-y-1 mb-4">
                    <li>Cancel ALL open orders</li>
                    <li>Disable real trading</li>
                    <li>Require manual reactivation</li>
                  </ul>
                )}
                <p className="text-sm text-yellow-300 font-medium">
                  {killSwitchAction === 'activate' 
                    ? 'This is an emergency stop. Only use if you need to halt trading immediately.'
                    : 'Make sure you want to resume real trading before proceeding.'}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowKillSwitchDialog(false)}
                disabled={killSwitchLoading}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleKillSwitch(killSwitchAction)}
                disabled={killSwitchLoading}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50
                  ${killSwitchAction === 'activate' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-green-600 hover:bg-green-700'}
                `}
              >
                {killSwitchLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    {killSwitchAction === 'activate' ? 'Yes, Activate Kill Switch' : 'Yes, Reactivate Trading'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
