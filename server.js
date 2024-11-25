const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./src/routes/auth');
const errorHandler = require('./src/middleware/errorHandler');
const { pool } = require('./src/utils/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.use('/auth', authRoutes);




// Error Handling Middleware
app.use(errorHandler);

// WebSocket Handling
let rooms = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('create_room', ({ roomName, username }) => {
    if (!rooms[roomName]) {
      rooms[roomName] = { players: [] };
    }
    rooms[roomName].players.push({ id: socket.id, username, position: { x: 0, y: 0 } });
    socket.join(roomName);
    io.to(roomName).emit('room_update', rooms[roomName]);
  });

  socket.on('start_game', ({ roomName }) => {
    if (rooms[roomName] && rooms[roomName].players.length >= 2) {
      io.to(roomName).emit('game_started', { message: 'The game has started!' });
    } else {
      socket.emit('error', 'Not enough players to start the game.');
    }
  });
  
  socket.on('join_room', ({ roomName, username }) => {
    if (rooms[roomName]) {
      rooms[roomName].players.push({ id: socket.id, username, position: { x: 0, y: 0 } });
      socket.join(roomName);
      io.to(roomName).emit('room_update', rooms[roomName]);
    } else {
      socket.emit('error', 'Room does not exist.');
    }
  });

  socket.on('player_action', ({ roomName, movementData }) => {
    // Invia l'azione del giocatore a tutti gli altri nella stanza
    io.to(roomName).emit('enemy_action', { movementData });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    for (const roomName in rooms) {
      rooms[roomName].players = rooms[roomName].players.filter((p) => p.id !== socket.id);
      
      // Notifica agli altri giocatori nella stanza
      io.to(roomName).emit('room_update', rooms[roomName]);
      
      if (rooms[roomName].players.length === 0) {
        delete rooms[roomName];
      }
    }
  });
});
app.get('/rooms', (req, res) => {
  res.json(rooms);
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});