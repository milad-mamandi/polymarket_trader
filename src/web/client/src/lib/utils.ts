// Utility functions

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars) return address;
  return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
}

export function timeAgo(timestamp: string | Date): string {
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = now - time;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatMs(ms: number): string {
  if (ms >= 86400000) {
    const days = ms / 86400000;
    return `= ${days >= 2 ? days.toFixed(1) : days.toFixed(0)} day${days >= 2 ? 's' : ''}`;
  }
  if (ms >= 3600000) {
    const hours = ms / 3600000;
    return `= ${hours >= 2 ? hours.toFixed(1) : hours.toFixed(0)} hour${hours >= 2 ? 's' : ''}`;
  }
  if (ms >= 60000) {
    const minutes = ms / 60000;
    return `= ${minutes >= 2 ? minutes.toFixed(1) : minutes.toFixed(0)} minute${minutes >= 2 ? 's' : ''}`;
  }
  if (ms >= 1000) {
    const seconds = ms / 1000;
    return `= ${seconds >= 2 ? seconds.toFixed(1) : seconds.toFixed(0)} second${seconds >= 2 ? 's' : ''}`;
  }
  return `= ${ms} millisecond${ms !== 1 ? 's' : ''}`;
}

/**
 * Safe toFixed - returns 'N/A' for null/undefined values
 * Prevents "Cannot read properties of undefined (reading 'toFixed')" errors
 */
export function safeToFixed(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value == null || isNaN(value)) return 'N/A';
  return value.toFixed(decimals);
}

/**
 * Safe USD formatter - returns 'N/A' for null/undefined values
 */
export function safeFormatUSD(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return 'N/A';
  return formatUSD(value);
}

/**
 * Safe percent formatter - returns 'N/A' for null/undefined values
 */
export function safeFormatPercent(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value == null || isNaN(value)) return 'N/A';
  return formatPercent(value, decimals);
}
