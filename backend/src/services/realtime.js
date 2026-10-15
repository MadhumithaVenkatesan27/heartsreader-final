const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { setIo } = require('./notify');

/** socket.io: the frontend connects with { auth: { token } } (the access token). */
function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.frontendOrigins, credentials: true },
  });
  io.use((socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token || '', config.jwt.accessSecret);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });
  io.on('connection', (socket) => socket.join(`user:${socket.data.userId}`));
  setIo(io);
  return io;
}

module.exports = { attachRealtime };
