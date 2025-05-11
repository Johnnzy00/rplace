const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });
const PORT = 80;

app.use(cors());
app.use(bodyParser.json());

const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 2000;
const canvas = Array(CANVAS_HEIGHT).fill().map(() => Array(CANVAS_WIDTH).fill('#FFFFFF'));

// In-memory user and IP store
const users = new Map();
const ipAccounts = new Map();
const sessions = new Map(); // sessionId => username

// Middleware to check IP limit and authentication
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;
  if (!username || !password) return res.status(400).send('Username and password required');

  if (users.has(username)) return res.status(400).send('Username taken');

  const ipCount = ipAccounts.get(ip) || 0;
  if (ipCount >= 5) return res.status(403).send('Max accounts for this IP reached');

  users.set(username, { password });
  ipAccounts.set(ip, ipCount + 1);
  res.send('Registered successfully');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  if (!user || user.password !== password) return res.status(401).send('Invalid credentials');

  const sessionId = Math.random().toString(36).substring(2);
  sessions.set(sessionId, username);
  res.json({ sessionId });
});

io.on('connection', (socket) => {
  socket.on('auth', ({ sessionId }) => {
    const username = sessions.get(sessionId);
    if (!username) return socket.disconnect();
    socket.username = username;
  });

  socket.on('placePixel', ({ x, y, color }) => {
    if (!socket.username || x < 0 || y < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) return;

    const now = Date.now();
    if (!socket.lastPlaceTime || now - socket.lastPlaceTime > 3600000) {
      canvas[y][x] = color;
      io.emit('pixelUpdate', { x, y, color });
      socket.lastPlaceTime = now;
    } else {
      socket.emit('errorMsg', 'You can place a pixel only once every hour');
    }
  });

  socket.emit('canvasState', canvas);
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

