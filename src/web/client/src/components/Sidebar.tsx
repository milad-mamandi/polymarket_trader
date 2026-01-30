import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { 
  LayoutDashboard, 
  Activity, 
  TrendingUp, 
  Wallet, 
  Settings,
  ListOrdered 
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Activity', path: '/activity', icon: Activity },
  { name: 'Trades', path: '/trades', icon: TrendingUp },
  { name: 'Orders', path: '/orders', icon: ListOrdered },
  { name: 'Wallets', path: '/wallets', icon: Wallet },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-2xl">🐋</span>
          Whale Scout
        </h1>
        <p className="text-xs text-slate-400 mt-1">Paper Trading Monitor</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                  ${isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
        <div>Version 2.0.0</div>
        <div className="mt-1">Dashboard-Only Edition</div>
      </div>
    </div>
  );
}
