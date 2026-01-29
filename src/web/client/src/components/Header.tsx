import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { LogOut, Circle } from 'lucide-react';
import type { BotStatus } from '../lib/types';

export function Header() {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    try {
      const status = await api.getBotStatus();
      setBotStatus(status);
    } catch (error) {
      console.error('Failed to load bot status:', error);
    }
  }

  function handleLogout() {
    api.logout().then(() => window.location.reload());
  }

  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
      <div className="flex justify-between items-center">
        {/* Bot Status */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Circle 
              className={`w-3 h-3 ${botStatus?.running ? 'fill-green-500 text-green-500' : 'fill-gray-500 text-gray-500'}`}
            />
            <span className="text-sm font-medium text-slate-300">
              Bot {botStatus?.running ? 'Running' : 'Stopped'}
            </span>
            {botStatus?.running && botStatus.uptime > 0 && (
              <span className="text-xs text-slate-500">
                ({formatUptime(botStatus.uptime)})
              </span>
            )}
          </div>

          {botStatus?.lastError && (
            <div className="text-xs text-red-400 max-w-md truncate">
              Error: {botStatus.lastError}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
