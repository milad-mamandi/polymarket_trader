import axios, { AxiosInstance, AxiosError } from 'axios';

// API base URL
const API_BASE = '/api';

// Create axios instance with default config
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    let errorMessage = `HTTP ${error.response?.status || 'Error'}: ${error.message}`;
    
    if (error.response?.data) {
      const data = error.response.data as any;
      errorMessage = data.error || data.message || errorMessage;
    }
    
    return Promise.reject(new Error(errorMessage));
  }
);

// API client
class ApiClient {
  // Auth
  async login(password: string) {
    const { data } = await axiosInstance.post('/auth/login', { password });
    return data;
  }

  async logout() {
    const { data } = await axiosInstance.post('/auth/logout');
    return data;
  }

  async checkAuth() {
    const { data } = await axiosInstance.get('/auth/check');
    return data;
  }

  // Stats
  async getOverview() {
    const { data } = await axiosInstance.get('/stats/overview');
    return data;
  }

  async getPerformance(days = 30) {
    const { data } = await axiosInstance.get(`/stats/performance?days=${days}`);
    return data;
  }

  async getDailyStats() {
    const { data } = await axiosInstance.get('/stats/daily');
    return data;
  }

  // Trades
  async getTrades(params: { limit?: number; status?: string } = {}) {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.status) queryParams.set('status', params.status);
    const { data } = await axiosInstance.get(`/trades?${queryParams}`);
    return data;
  }

  async getTrade(id: string) {
    const { data } = await axiosInstance.get(`/trades/${id}`);
    return data;
  }

  async getTradeStats() {
    const { data } = await axiosInstance.get('/trades/stats');
    return data;
  }

  // Wallets
  async getWallets() {
    const { data } = await axiosInstance.get('/wallets');
    return data;
  }

  async getWallet(address: string) {
    const { data } = await axiosInstance.get(`/wallets/${address}`);
    return data;
  }

  async getWalletStats() {
    const { data } = await axiosInstance.get('/wallets/stats');
    return data;
  }

  // Activity
  async getRecentActivity(limit = 20) {
    const { data } = await axiosInstance.get(`/activity/recent?limit=${limit}`);
    return data;
  }

  // Bot controls
  async getBotStatus() {
    const { data } = await axiosInstance.get('/bot/status');
    return data;
  }

  async startBot() {
    const { data } = await axiosInstance.post('/bot/start');
    return data;
  }

  async stopBot() {
    const { data } = await axiosInstance.post('/bot/stop');
    return data;
  }

  async restartBot() {
    const { data } = await axiosInstance.post('/bot/restart');
    return data;
  }

  async resetData() {
    const { data } = await axiosInstance.post('/bot/reset');
    return data;
  }

  // Config
  async getConfig() {
    const { data } = await axiosInstance.get('/config');
    return data;
  }

  async updateConfig(updates: Record<string, any>) {
    const { data } = await axiosInstance.put('/config', updates);
    return data;
  }
}

export const api = new ApiClient();
