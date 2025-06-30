const WebSocket = require('ws');

console.log('Testing WebSocket connection to ws://localhost:3636...');

const ws = new WebSocket('ws://localhost:3636');

ws.on('open', () => {
  console.log('✅ Connected successfully!');
  ws.send(JSON.stringify({ type: 'test', message: 'Hello from test client' }));
  
  setTimeout(() => {
    console.log('Closing connection...');
    ws.close();
  }, 2000);
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});