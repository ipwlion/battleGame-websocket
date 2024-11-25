const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const morgan = require('morgan');
require('dotenv').config();
require('./src/utils/initDb');

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

  // Creazione della stanza
  socket.on('create_room', ({ roomName, username }) => {
    if (!rooms[roomName]) {
      rooms[roomName] = { players: [] };
    }
    const role = rooms[roomName].players.length === 0 ? 'player1' : 'player2';
    rooms[roomName].players.push({ id: socket.id, username, role, position: { x: 0, y: 0 } });
    socket.join(roomName);
    io.to(roomName).emit('room_update', rooms[roomName]);
  });

  // Join nella stanza
  socket.on('join_room', ({ roomName, username }) => {
    if (rooms[roomName]) {
      if (rooms[roomName].players.length >= 2) {
        socket.emit('error', 'Room is full.');
        return;
      }
      const role = rooms[roomName].players.length === 0 ? 'player1' : 'player2';
      rooms[roomName].players.push({ id: socket.id, username, role, position: { x: 0, y: 0 } });
      socket.join(roomName);
      io.to(roomName).emit('room_update', rooms[roomName]);
    } else {
      socket.emit('error', 'Room does not exist.');
    }
  });

  // Movimento del giocatore
  socket.on('player_action', ({ roomName, movementData }) => {
    const player = rooms[roomName]?.players.find((p) => p.id === socket.id);
    if (player) {
      player.position = movementData.position; // Aggiorna la posizione del giocatore
      // Invia l'azione solo all'altro giocatore
      socket.to(roomName).emit('enemy_action', { enemyId: socket.id, movementData });
    }
  });

  // Disconnessione
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    for (const roomName in rooms) {
      rooms[roomName].players = rooms[roomName].players.filter((p) => p.id !== socket.id);
      io.to(roomName).emit('room_update', rooms[roomName]);
      if (rooms[roomName].players.length === 0) {
        delete rooms[roomName];
      }
    }
  });

  // Inizio del gioco
  socket.on('start_game', ({ roomName }) => {
    if (rooms[roomName] && rooms[roomName].players.length === 2) {
      io.to(roomName).emit('game_started', { message: 'The game has started!' });
    } else {
      socket.emit('error', 'Not enough players to start the game.');
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