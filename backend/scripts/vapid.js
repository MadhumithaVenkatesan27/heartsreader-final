// npm run vapid  ->  prints the two keys for browser push; paste them into .env (never share the private one)
const webpush = require('web-push');
const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`);
