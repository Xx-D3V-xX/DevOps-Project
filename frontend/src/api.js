import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
});

export default api;

export function createRoom() {
  return api.post('/api/rooms');
}

export function getRoom(code) {
  return api.get(`/api/rooms/${code}`);
}
