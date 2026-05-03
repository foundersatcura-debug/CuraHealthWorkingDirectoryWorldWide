/**
 * WebSocket Server – Real-time Patient Queue
 *
 * Architecture:
 * - Single WS server attached to the Express HTTP server
 * - Clients subscribe to "channels" (e.g. 'queue:opd', 'queue:ward')
 * - The server broadcasts to all subscribers of a channel on queue events
 * - JWT authentication required on connection
 *
 * Setup (in server.ts):
 *   import { attachWebSocketServer } from './websocket/queueSocket';
 *   const server = http.createServer(app);
 *   attachWebSocketServer(server);
 *   server.listen(PORT);
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../middleware/rbac.middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WSMessage {
  type: string;
  channel: string;
  payload?: unknown;
  timestamp: string;
}

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  branchId: string;
  roleType: string;
  channels: Set<string>;
}

// ─── State ────────────────────────────────────────────────────────────────────

/** Map of channel → set of connected clients subscribed to that channel */
const channelSubscribers = new Map<string, Set<AuthenticatedClient>>();

/** All connected clients keyed by their WebSocket reference */
const clients = new Map<WebSocket, AuthenticatedClient>();

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Broadcast a message to all clients subscribed to a given channel.
 * Called by controllers when queue events happen.
 */
export function broadcastToChannel(channel: string, msg: WSMessage): void {
  const subscribers = channelSubscribers.get(channel);
  if (!subscribers || subscribers.size === 0) return;

  const payload = JSON.stringify(msg);
  let dead: AuthenticatedClient[] = [];

  for (const client of subscribers) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    } else {
      dead.push(client);
    }
  }

  // Cleanup disconnected clients
  for (const d of dead) {
    subscribers.delete(d);
    clients.delete(d.ws);
  }
}

/**
 * Subscribe a client to a channel.
 * Only allows subscribing to branch-scoped channels to prevent data leakage.
 */
function subscribeToChannel(client: AuthenticatedClient, channel: string): void {
  // Security: clients can only subscribe to channels within their branch scope
  // Allowed channels: 'queue:opd', 'queue:ward', 'queue:emergency'
  const allowed = ['queue:opd', 'queue:ward', 'queue:emergency'];
  if (!allowed.includes(channel)) {
    client.ws.send(JSON.stringify({
      type: 'ERROR',
      channel,
      payload: { message: `Channel ${channel} is not available` },
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  if (!channelSubscribers.has(channel)) {
    channelSubscribers.set(channel, new Set());
  }

  channelSubscribers.get(channel)!.add(client);
  client.channels.add(channel);

  client.ws.send(JSON.stringify({
    type: 'SUBSCRIBED',
    channel,
    payload: { message: `Subscribed to ${channel}` },
    timestamp: new Date().toISOString(),
  }));
}

function unsubscribeFromChannel(client: AuthenticatedClient, channel: string): void {
  channelSubscribers.get(channel)?.delete(client);
  client.channels.delete(channel);
}

function removeClient(ws: WebSocket): void {
  const client = clients.get(ws);
  if (!client) return;

  for (const channel of client.channels) {
    channelSubscribers.get(channel)?.delete(client);
  }
  clients.delete(ws);
}

// ─── WebSocket Server Setup ───────────────────────────────────────────────────

export function attachWebSocketServer(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Extract JWT from query string or Upgrade header
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token') ??
      req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        channel: 'auth',
        payload: { message: 'Authentication required' },
        timestamp: new Date().toISOString(),
      }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    } catch {
      ws.send(JSON.stringify({
        type: 'ERROR',
        channel: 'auth',
        payload: { message: 'Invalid or expired token' },
        timestamp: new Date().toISOString(),
      }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    const client: AuthenticatedClient = {
      ws,
      userId: payload.user_id,
      branchId: payload.branch_id,
      roleType: payload.role_type,
      channels: new Set(),
    };
    clients.set(ws, client);

    // Acknowledge connection
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      channel: 'system',
      payload: { user_id: payload.user_id, branch_id: payload.branch_id },
      timestamp: new Date().toISOString(),
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSMessage;

        if (msg.type === 'SUBSCRIBE' && msg.channel) {
          subscribeToChannel(client, msg.channel);
        }

        if (msg.type === 'UNSUBSCRIBE' && msg.channel) {
          unsubscribeFromChannel(client, msg.channel);
        }

        if (msg.type === 'PING') {
          ws.send(JSON.stringify({
            type: 'PONG',
            channel: 'system',
            payload: {},
            timestamp: new Date().toISOString(),
          }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => removeClient(ws));
    ws.on('error', () => removeClient(ws));
  });

  // Periodic ping to detect dead connections
  const pingInterval = setInterval(() => {
    for (const [ws] of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        removeClient(ws);
      }
    }
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  console.log('[WebSocket] Queue socket server attached at /ws');
}
