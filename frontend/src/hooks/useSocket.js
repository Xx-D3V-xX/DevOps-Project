import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket(roomCode, username) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const [remoteContent, setRemoteContent] = useState(null);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [roomLanguage, setRoomLanguage] = useState('python');

  useEffect(() => {
    if (!roomCode || !username) return;

    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:4000');
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.emit('join_room', { roomCode, username });

    socket.on('room_joined', ({ users: initialUsers, language, content }) => {
      setUsers(initialUsers);
      setRoomLanguage(language);
      setRemoteContent(content);
    });

    socket.on('user_joined', ({ username: name, color }) => {
      setUsers(prev => [...prev, { username: name, color }]);
    });

    socket.on('user_left', ({ username: name }) => {
      setUsers(prev => prev.filter(u => u.username !== name));
    });

    socket.on('code_update', ({ content }) => {
      setRemoteContent(content);
    });

    socket.on('cursor_update', ({ username: name, color, position }) => {
      setRemoteCursors(prev => ({ ...prev, [name]: { color, position } }));
    });

    socket.on('language_update', ({ language }) => {
      setRoomLanguage(language);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode, username]);

  return {
    socket: socketRef.current,
    connected,
    users,
    remoteContent,
    remoteCursors,
    roomLanguage,
  };
}
