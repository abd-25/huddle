import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { autoConnect: false });

export function connectSocket() {
  socket.auth = { token: localStorage.getItem('token') };
  if (!socket.connected) socket.connect();
}
export function disconnectSocket() {
  socket.disconnect();
}
