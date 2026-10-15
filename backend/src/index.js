const http = require('http');
const mongoose = require('mongoose');
const config = require('./config');
const createApp = require('./app');
const { attachRealtime } = require('./services/realtime');
const { verifyMailer } = require('./utils/mailer');

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('✔ MongoDB connected');
  const app = createApp();
  const server = http.createServer(app);
  attachRealtime(server); // socket.io: pushes "notification:new" to the browser
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE'
      ? `✖ Port ${config.port} is already in use by another program. Close it, or change PORT in .env.`
      : `✖ Server error: ${err.message}`);
    process.exit(1);
  });
  server.listen(config.port, () => console.log(`✔ API listening on http://localhost:${config.port}${config.payments.mock ? '  (MOCK payments ON)' : ''}`));

  verifyMailer();

  const stop = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  if (/ENOTFOUND|ECONNREFUSED|ServerSelection|timed out/i.test(err.message)) {
    console.error('Hint: cannot reach MongoDB. Local Docker: run "docker compose up -d". Atlas: add your IP under Network Access and check the user/password in MONGO_URI.');
  }
  if (/bad auth|Authentication failed/i.test(err.message)) {
    console.error('Hint: wrong database user or password in MONGO_URI (special characters in the password must be URL-encoded, e.g. @ becomes %40).');
  }
  process.exit(1);
});
