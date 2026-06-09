import type { Server } from 'http';
import type { Store } from 'express-session';
import { WebSocketServer } from 'ws';
import { MASTERMIND_WS_PATH } from '@shared/mastermind/events';
import { authenticateUpgrade } from './auth';
import { handleConnection } from './connection';
import { getAllClients, removeClient } from './registry';

const HEARTBEAT_INTERVAL_MS = 30_000;

// Attaches the Mastermind WebSocket layer to the existing HTTP server. Uses noServer mode
// and routes the `upgrade` event by path. In dev, Vite's HMR owns the other upgrade paths;
// in prod we're the only handler, so unknown paths must be destroyed rather than left hanging.
export function initWebSocket(
    server: Server,
    sessionStore: Store,
    { isDevelopment }: { isDevelopment: boolean },
): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        const { pathname } = new URL(req.url ?? '', 'http://localhost');
        if (pathname !== MASTERMIND_WS_PATH) {
            if (!isDevelopment) socket.destroy(); // no other handler in prod — don't leak it
            return;
        }

        void (async () => {
            try {
                const userId = await authenticateUpgrade(req, sessionStore);
                if (!userId) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }
                wss.handleUpgrade(req, socket, head, (ws) => {
                    handleConnection(ws, userId);
                });
            } catch (err) {
                console.error('[ws] upgrade auth error:', err);
                socket.destroy();
            }
        })();
    });

    // Reap dead connections: ping every interval; a client that missed the last ping is gone.
    const heartbeat = setInterval(() => {
        for (const client of getAllClients()) {
            if (!client.isAlive) {
                client.ws.terminate();
                removeClient(client);
                continue;
            }
            client.isAlive = false;
            client.ws.ping();
        }
    }, HEARTBEAT_INTERVAL_MS);

    wss.on('close', () => clearInterval(heartbeat));

    return wss;
}
