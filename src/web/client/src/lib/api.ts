// API base URL
const API_BASE = '/api';

// API client
class ApiClient {
  async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
    } catch {
      // Response wasn't JSON, use default error message
    }
    throw new Error(errorMessage);
  }

    return response.json();
  }

  // Auth
  async login(password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async checkAuth() {
    return this.request('/auth/check');
  }

  // Stats
  async getOverview() {
    return this.request('/stats/overview');
  }

  async getPerformance(days = 30) {
    return this.request(`/stats/performance?days=${days}`);
  }

  async getDailyStats() {
    return this.request('/stats/daily');
  }

  // Trades
  async getTrades(params: { limit?: number; status?: string } = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.status) query.set('status', params.status);
    return this.request(`/trades?${query}`);
  }

  async getTrade(id: string) {
    return this.request(`/trades/${id}`);
  }

  async getTradeStats() {
    return this.request('/trades/stats');
  }

  // Wallets
  async getWallets() {
    return this.request('/wallets');
  }

  async getWallet(address: string) {
    return this.request(`/wallets/${address}`);
  }

  async getWalletStats() {
    return this.request('/wallets/stats');
  }

  // Activity
  async getRecentActivity(limit = 20) {
    return this.request(`/activity/recent?limit=${limit}`);
  }

  // Bot controls
  async getBotStatus() {
    return this.request('/bot/status');
  }

  async startBot() {
    return this.request('/bot/start', { method: 'POST' });
  }

  async stopBot() {
    return this.request('/bot/stop', { method: 'POST' });
  }

  async restartBot() {
    return this.request('/bot/restart', { method: 'POST' });
  }
}

export const api = new ApiClient();
