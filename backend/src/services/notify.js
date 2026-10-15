const Notification = require('../models/Notification');

let io = null;
const setIo = (instance) => { io = instance; };

/** Save a notification and push it live to the user's open tabs (frontend listens for "notification:new"). */
async function notify(userId, { type = 'info', title, message = '' }) {
  const notification = await Notification.create({ userId, type, title, message });
  if (io) io.to(`user:${userId}`).emit('notification:new', { notification });
  return notification;
}

module.exports = { notify, setIo };
