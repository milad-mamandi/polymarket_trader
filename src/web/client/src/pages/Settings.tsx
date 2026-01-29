import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from '../components/ToastProvider';
import { formatMs, formatNumber } from '../lib/utils';
import { Save, AlertCircle, Trash2 } from 'lucide-react';

interface ConfigItem {
  key: string;
  value: any;
  type: string;
  category: string;
  description: string;
  min?: number;
  max?: number;
  masked?: boolean;
  secret?: boolean;
}

export function Settings() {
  const [config, setConfig] = useState<Record<string, ConfigItem> | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);
  
  const { showToast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getConfig();
      setConfig(data.config);
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (Object.keys(editedValues).length === 0) {
      showToast('No changes to save', 'info');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      await api.updateConfig(editedValues);
      
      showToast(`Saved ${Object.keys(editedValues).length} change(s). Restart the bot for changes to take effect.`, 'success');
      setEditedValues({});
      
      // Reload config to get updated values
      setTimeout(loadConfig, 1000);
    } catch (err: any) {
      showToast(err.message || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleChange(key: string, value: any) {
    setEditedValues(prev => ({
      ...prev,
      [key]: value
    }));
  }

  async function handleReset() {
    try {
      setResetting(true);
      await api.resetData();
      showToast('Trading data reset successfully! All paper trades and performance history cleared.', 'success');
      setShowResetDialog(false);
      
      // Optionally reload config or navigate to dashboard
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (err: any) {
      showToast(err.message || 'Failed to reset data', 'error');
    } finally {
      setResetting(false);
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
            value={currentValue || ''}
            onChange={(e) => handleChange(item.key, e.target.value)}
            min={item.min}
            max={item.max}
            className={`
              w-full px-3 py-2 bg-slate-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
              ${hasChanges ? 'border-yellow-500' : 'border-slate-600'}
            `}
          />
          {/* Show formatted number with commas */}
          {currentValue && currentValue >= 1000 && (
            <div className="text-xs text-slate-500">
              = {formatNumber(Number(currentValue))}
            </div>
          )}
          {/* Show time conversion for ms fields */}
          {isTimingField && currentValue && (
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
            value={currentValue || ''}
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
          value={currentValue || ''}
          onChange={(e) => handleChange(item.key, e.target.value)}
          className={`
            w-full px-3 py-2 bg-slate-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
            ${hasChanges ? 'border-yellow-500' : 'border-slate-600'}
          `}
        />
      );
    }

    return null;
  }

  if (loading) {
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
            onClick={loadConfig}
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
  Object.values(config).forEach(item => {
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
          disabled={saving || Object.keys(editedValues).length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Alerts */}
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
                disabled={resetting}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {resetting ? (
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
    </div>
  );
}
