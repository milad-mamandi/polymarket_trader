import { useState, useEffect } from 'react';
import { api } from './lib/api';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      await api.checkAuth();
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
    }
  }

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return <Dashboard />;
}

export default App;
