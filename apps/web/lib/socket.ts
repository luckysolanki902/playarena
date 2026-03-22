import { io, Socket } from 'socket.io-client';
import { useSessionStore } from './store';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = useSessionStore.getState().token;
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
    // If the server rejects the token (expired or invalid), clear the local
    // session so the user is sent back to the name-entry screen.
    socket.on('connect_error', (err) => {
      if (err.message === 'AUTH_FAILED' || err.message === 'AUTH_REQUIRED') {
        useSessionStore.getState().clearSession();
        socket = null;
      }
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
