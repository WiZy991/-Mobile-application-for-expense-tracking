const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('./database/init');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('auth_required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      // Determine if staff or client
      const staffResult = await dbQuery(
        'SELECT id, role FROM staff WHERE id = $1 AND is_active = true',
        [userId]
      );

      if (staffResult.rows.length > 0) {
        socket.userType = 'staff';
        socket.userId = staffResult.rows[0].id;
        socket.userRole = staffResult.rows[0].role;
      } else {
        const clientResult = await dbQuery(
          'SELECT id FROM clients WHERE id = $1',
          [userId]
        );
        if (clientResult.rows.length > 0) {
          socket.userType = 'client';
          socket.userId = clientResult.rows[0].id;
          socket.userRole = 'client';
        } else {
          return next(new Error('user_not_found'));
        }
      }

      next();
    } catch (err) {
      next(new Error('invalid_token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[WS] Connected: ${socket.userType}:${socket.userId} (${socket.userRole})`);

    socket.on('join_ticket', (ticketId) => {
      const room = `ticket:${ticketId}`;
      socket.join(room);
      console.log(`[WS] ${socket.userType}:${socket.userId} joined ${room}`);
    });

    socket.on('leave_ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });

    // Managers join a special room to receive all ticket events
    if (socket.userRole === 'manager' || socket.userRole === 'director') {
      socket.join('managers');
    }

    socket.on('typing', ({ ticketId }) => {
      socket.to(`ticket:${ticketId}`).emit('typing', {
        ticketId,
        userId: socket.userId,
        userType: socket.userType,
      });
    });

    socket.on('stop_typing', ({ ticketId }) => {
      socket.to(`ticket:${ticketId}`).emit('stop_typing', {
        ticketId,
        userId: socket.userId,
      });
    });

    // Direct chat rooms (Phase 3)
    socket.on('join_conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Disconnected: ${socket.userType}:${socket.userId}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitTicketMessage(ticketId, message) {
  if (!io) return;
  io.to(`ticket:${ticketId}`).emit('new_message', { ticketId, message });
  io.to('managers').emit('new_message', { ticketId, message });
}

function emitTicketStatusChanged(ticketId, status) {
  if (!io) return;
  io.to(`ticket:${ticketId}`).emit('status_changed', { ticketId, status });
  io.to('managers').emit('status_changed', { ticketId, status });
}

function emitConversationMessage(conversationId, message) {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit('new_direct_message', { conversationId, message });
}

module.exports = { initSocket, getIO, emitTicketMessage, emitTicketStatusChanged, emitConversationMessage };
