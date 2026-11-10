import { io } from 'socket.io-client';

export const socket = io({ autoConnect: false });

export function connectSocket() {
  socket.auth = { token: localStorage.getItem('token') };
  if (!socket.connected) socket.connect();
}
export function disconnectSocket() {
  socket.disconnect();
}
