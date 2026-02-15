const io = require('socket.io-client');

// Get the auth token from command line or use a test token
const token = process.argv[2];

if (!token) {
  console.error('Please provide a JWT token as the first argument');
  console.error('Usage: node test-websocket.js <jwt-token>');
  process.exit(1);
}

console.log('[Test] Connecting to WebSocket server...');
console.log('[Test] Token:', token.substring(0, 50) + '...');

const socket = io('http://localhost:4000', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  auth: {
    token: token
  }
});

socket.on('connect', () => {
  console.log('[Test] ✅ Connected successfully!');
  console.log('[Test] Socket ID:', socket.id);
  
  // Test sending a message
  socket.emit('test', { message: 'Hello from test client' });
  
  // Disconnect after 3 seconds
  setTimeout(() => {
    console.log('[Test] Disconnecting...');
    socket.disconnect();
  }, 3000);
});

socket.on('connect_error', (error) => {
  console.error('[Test] ❌ Connection error:', error.message);
  console.error('[Test] Error type:', error.type);
  console.error('[Test] Full error:', error);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('[Test] Disconnected:', reason);
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('[Test] General error:', error);
});
