const { Server } = require('socket.io');
const prisma = require('../db');

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];

// roomCode -> { users: Map<socketId, { username, color }>, lastContent: string }
const rooms = new Map();

// roomCode -> timestamp of last DB write
const lastWriteTimes = new Map();

// socketId -> [{ roomCode, sessionId }]
const socketSessions = new Map();

function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, { users: new Map(), lastContent: '' });
  }
  return rooms.get(roomCode);
}

function assignColor(roomCode) {
  const room = rooms.get(roomCode);
  const usedColors = room ? new Set([...room.users.values()].map(u => u.color)) : new Set();
  return COLORS.find(c => !usedColors.has(c)) ?? COLORS[room.users.size % COLORS.length];
}

function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    socket.on('join_room', async ({ roomCode, username }) => {
      try {
        const room = getOrCreateRoom(roomCode);
        const color = assignColor(roomCode);
        room.users.set(socket.id, { username, color });

        socket.join(roomCode);

        const dbRoom = await prisma.room.findUnique({
          where: { code: roomCode },
          select: { id: true, language: true, content: true },
        });

        const users = [...room.users.values()];

        socket.emit('room_joined', {
          users,
          language: dbRoom?.language ?? 'python',
          content: dbRoom?.content ?? '',
        });

        socket.to(roomCode).emit('user_joined', { username, color });

        if (dbRoom) {
          const session = await prisma.roomSession.create({
            data: { roomId: dbRoom.id, username },
          });

          const sessions = socketSessions.get(socket.id) ?? [];
          sessions.push({ roomCode, sessionId: session.id });
          socketSessions.set(socket.id, sessions);
        }
      } catch (err) {
        console.error('join_room error:', err.message);
      }
    });

    socket.on('code_change', async ({ roomCode, content }) => {
      try {
        socket.to(roomCode).emit('code_update', { content });

        const roomState = rooms.get(roomCode);
        if (roomState) roomState.lastContent = content;

        const now = Date.now();
        const lastWrite = lastWriteTimes.get(roomCode) ?? 0;
        if (now - lastWrite > 5000) {
          lastWriteTimes.set(roomCode, now);
          await prisma.room.update({
            where: { code: roomCode },
            data: { content },
          });
        }
      } catch (err) {
        console.error('code_change error:', err.message);
      }
    });

    socket.on('language_change', async ({ roomCode, language }) => {
      try {
        socket.to(roomCode).emit('language_update', { language });
        await prisma.room.update({
          where: { code: roomCode },
          data: { language },
        });
      } catch (err) {
        console.error('language_change error:', err.message);
      }
    });

    socket.on('cursor_move', ({ roomCode, position }) => {
      try {
        const room = rooms.get(roomCode);
        const user = room?.users.get(socket.id);
        if (!user) return;

        socket.to(roomCode).emit('cursor_update', {
          username: user.username,
          color: user.color,
          position,
        });
      } catch (err) {
        console.error('cursor_move error:', err.message);
      }
    });

    socket.on('disconnect', async () => {
      try {
        const sessions = socketSessions.get(socket.id) ?? [];
        socketSessions.delete(socket.id);

        for (const { roomCode, sessionId } of sessions) {
          const room = rooms.get(roomCode);
          if (!room) continue;

          const user = room.users.get(socket.id);
          room.users.delete(socket.id);

          if (room.users.size === 0) {
            // flush final content before evicting from memory
            const content = room.lastContent;
            rooms.delete(roomCode);
            lastWriteTimes.delete(roomCode);
            await prisma.room.update({
              where: { code: roomCode },
              data: { content },
            });
          }

          if (user) {
            io.to(roomCode).emit('user_left', { username: user.username });
          }

          await prisma.roomSession.update({
            where: { id: sessionId },
            data: { leftAt: new Date() },
          });
        }
      } catch (err) {
        console.error('disconnect error:', err.message);
      }
    });
  });

  return io;
}

module.exports = { setupSocket };
