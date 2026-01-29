import { useEffect, useState, useCallback, useRef } from 'react';

interface WSMessage {
  type: string;
  data?: any;
  timestamp?: number;
}

/**
 * Get WebSocket URL dynamically based on current window location
 * This ensures the WebSocket works in production and on different ports
 */
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

export function useWebSocket(url: string = getWebSocketUrl()) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const intentionalClose = useRef(false);

  const connect = useCallback(() => {
    // Don't reconnect if we already have an open connection
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0; // Reset attempts on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          
          // Respond to ping with pong
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
          
          setLastMessage(message);
        } catch {
          // Silent fail for invalid messages
        }
      };

      ws.onerror = () => {
        // Silent fail
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Only attempt to reconnect if not intentionally closed
        if (!intentionalClose.current) {
          reconnectAttempts.current++;
          
          // Exponential backoff: 5s, 10s, 20s, max 30s
          const delay = Math.min(5000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch {
      // Silent fail
    }
  }, [url]);

  useEffect(() => {
    intentionalClose.current = false;
    connect();

    return () => {
      intentionalClose.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { isConnected, lastMessage, sendMessage };
}
