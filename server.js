const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const morgan = require('morgan');
require('dotenv').config();
require('./src/utils/initDb');
const cors = require('cors');

const authRoutes = require('./src/routes/auth');
const errorHandler = require('./src/middleware/errorHandler');
const { pool } = require('./src/utils/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());

// Middleware
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.use('/auth', authRoutes);

// Error Handling Middleware
app.use(errorHandler);

// WebSocket Handling
let rooms = {};
const userSockets = new Map(); // Mappa userId -> socket.id

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('register_user', ({ userId }) => {
    socket.userId = userId;
    userSockets.set(userId, socket.id); // Mappa userId -> socket.id
    console.log(`User ${userId} registered with socket ID ${socket.id}`);
  });
// Creazione della stanza
socket.on('create_room', async ({ roomName, userId }) => {
  try {
    // Recupera i dati del giocatore dal database
    const result = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (result.rowCount === 0) {
      return socket.emit('error', 'Player not found.');
    }

    const username = result.rows[0].username;

    // Crea o aggiorna la stanza
    if (!rooms[roomName]) {
      rooms[roomName] = { players: [] };
    }
    const role = rooms[roomName].players.length === 0 ? 'player1' : 'player2';
    rooms[roomName].players.push({ id: socket.id, userId, username, role, position: { x: 0, y: 0 }, hp: 10 });
    socket.join(roomName);

    io.to(roomName).emit('room_update', rooms[roomName]);
    io.emit('rooms_update', {
      rooms,
      roomName
    }); // Invio solo i nomi delle stanze
  } catch (error) {
    console.error('Error creating room:', error.message);
    socket.emit('error', 'An error occurred while creating the room.');
  }
});

// Join nella stanza
socket.on('join_room', async ({ roomName, userId }) => {
  try {
    // Recupera i dati del giocatore dal database

    const result = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (result.rowCount === 0) {
      return socket.emit('error', 'Player not found.');
    }

    const username = result.rows[0].username;

    if (rooms[roomName]) {
      if (rooms[roomName].players.length >= 2) {
        return socket.emit('error', 'Room is full.');
      }

      const role = rooms[roomName].players.length === 0 ? 'player1' : 'player2';
      rooms[roomName].players.push({ id: socket.id, userId, username, role, position: { x: 0, y: 0 }, hp: 10 });
      socket.join(roomName);

      io.to(roomName).emit('room_update', rooms[roomName]);
      io.emit('rooms_update', {
        rooms,
        roomName
    }); // Invio solo i nomi delle stanze
    } else {
      socket.emit('error', 'Room does not exist.');
    }
  } catch (error) {
    console.error('Error joining room:', error.message);
    socket.emit('error', 'An error occurred while joining the room.');
  }
});


socket.on('select_character', ({ roomName, character }) => {
  const room = rooms[roomName];
  if (!room) return;

  const player = room.players.find((p) => p.id === socket.id);
  if (player) {
    player.character = character;
    console.log(`${player.username} selected ${character.name} in room ${roomName}`);

    // Notifica agli altri giocatori della stanza
    io.to(roomName).emit('character_selected', {
      playerId: socket.id,
      room: room.players,
    });
  }
});

socket.on('update_hp', ({ roomName, newHp, userId }) => {
  const room = rooms[roomName];
  if (!room) return;

  const targetPlayer = room.players.find(p => p.userId !== userId);
  if (targetPlayer) {
      targetPlayer.hp = newHp;

      // Sincronizza l'aggiornamento con tutti i giocatori
      io.to(roomName).emit('update_hp', {
          targetPlayer,
          newHp,
      });

      // Controlla se il giocatore è sconfitto
      if (targetPlayer.hp <= 0) {
          delete rooms[roomName];
          console.log(`Room ${roomName} has been reset.`);
          console.log(`${targetPlayer.username} defeated in room ${roomName}`);
      }
  }
});


socket.on('exit_room', ({ roomName }) => {
  try {
    if (rooms[roomName]) {
      const room = rooms[roomName];

      // Trova il giocatore nella stanza
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);

      if (playerIndex !== -1) {
        // Rimuovi il giocatore
        const removedPlayer = room.players.splice(playerIndex, 1)[0];
        console.log(`Player ${removedPlayer.username} exited room ${roomName}`);

        // Riassegna i ruoli se necessario
        if (room.players.length > 0) {
          room.players[0].role = 'player1';
          if (room.players.length > 1) {
            room.players[1].role = 'player2';
          }
        }

        // Aggiorna gli altri giocatori nella stanza
        io.to(roomName).emit('room_update', rooms[roomName]);

        // Se la stanza è vuota, cancellala
        if (room.players.length === 0) {
          delete rooms[roomName];
          console.log(`Room ${roomName} deleted because it is empty.`);
        }

        // Aggiorna la lista delle stanze globalmente
        io.emit('rooms_update', { rooms });
      } else {
        console.log(`Player not found in room ${roomName}`);
      }
    } else {
      console.log(`Room ${roomName} does not exist.`);
    }
  } catch (error) {
    console.error('Error handling exit_room:', error.message);
  }
});

  // Movimento del giocatore
  socket.on('player_action', ({ roomName, movementData, userId }) => {
    try {
      const room = rooms[roomName];
      if (!room) {
        console.error(`Room ${roomName} not found`);
        return;
      }
  
      // Trova il giocatore
      const player = room.players.find((p) => p.userId === userId);
      if (!player) {
        console.error(`Player with userId ${userId} not found`);
        return;
      }
  
      // Aggiorna i dati in memoria
      player.position = movementData.position;
      player.currentAction = movementData.action;
  
      // Trova il nemico
      const enemy = room.players.find((p) => p.userId !== userId);
      if (!enemy) {
        console.error(`Enemy not found in room ${roomName}`);
        return;
      }
  
      // Calcola la posizione relativa per il nemico
      const screenWidth = 800; // Usa la larghezza effettiva del gioco
      const relativePosition = {
        x: screenWidth - movementData.position.x,
        y: movementData.position.y,
      };
  
      // Invia al nemico la posizione calcolata
      io.to(enemy.id).emit('enemy_action', {
        enemyData: {
          id: player.userId,
          position: relativePosition,
          action: player.currentAction,
        },
      });
    } catch (error) {
      console.error('Error processing player action:', error.message);
      socket.emit('error', 'An error occurred while processing the action.');
    }
  });
  
  // Disconnessione
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  
    if (socket.userId) {
      userSockets.delete(socket.userId);
      console.log(`User ${socket.userId} disconnected.`);
    }

    // Cerca la stanza in cui si trova il giocatore
    for (const roomName in rooms) {
      const room = rooms[roomName];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
  
      if (playerIndex !== -1) {
        // Rimuovi il giocatore dalla stanza
        const removedPlayer = room.players.splice(playerIndex, 1)[0];
        console.log(`Removed player ${removedPlayer.username} from room ${roomName}`);
  
        // Invia un aggiornamento ai giocatori nella stanza
        io.to(roomName).emit('room_update', rooms[roomName]);
  
        // Se la stanza è vuota, cancellala
        if (room.players.length === 0) {
          delete rooms[roomName];
          console.log(`Room ${roomName} deleted because it is empty.`);
        }
  
        // Aggiorna la lista delle stanze globalmente
        io.emit('rooms_update', { rooms });
        break;
      }
    }
  });
  
  socket.on('invite_player', async ({ roomName, inviterId, inviteeName }) => {
    try {
      // Trova l'invitato nel database
      const result = await pool.query('SELECT id FROM users WHERE username = $1', [inviteeName]);
      if (result.rowCount === 0) {
        return socket.emit('error', `Player ${inviteeName} not found.`);
      }
  
      const inviteeId = result.rows[0].id;
  
      // Trova il socket ID dell'invitato
      const inviteeSocketId = userSockets.get(String(inviteeId));
      console.log('inviteeId (typeof):', typeof inviteeId);
      console.log('Keys in userSockets (typeof):', Array.from(userSockets.keys()).map((key) => ({ key, type: typeof key })));
      
      console.log('Mapping userSockets:', Array.from(userSockets.entries())); // Log completo della mappa
      console.log('inviteeId:', inviteeId);
      console.log('inviteeSocketId:', inviteeSocketId);
  
      if (!inviteeSocketId) {
        return socket.emit('error', `Player ${inviteeName} is not online.`);
      }
  
      const inviterName = rooms[roomName]?.players.find((p) => p.userId === inviterId)?.username || 'Unknown';
  
      // Invia una notifica all'invitato
      io.to(inviteeSocketId).emit('invite_notification', {
        roomName,
        inviterId,
        inviterName,
      });
  
      console.log(`Player ${inviteeName} invited to join room ${roomName}`);
    } catch (error) {
      console.error('Error inviting player:', error.message);
      socket.emit('error', 'An error occurred while inviting the player.');
    }
  });
  

  // Inizio del gioco
  socket.on('start_game', ({ roomName }) => {
    if (rooms[roomName] && rooms[roomName].players.length === 2) {
      io.to(roomName).emit('game_started', { data: rooms[roomName], message: 'The game has started!' });
    } else {
      socket.emit('error', 'Not enough players to start the game.');
    }
  });
});

app.get('/rooms', async (req, res) => {
  try {
    const roomsWithDetails = await Promise.all(
      Object.entries(rooms).map(async ([roomName, room]) => {
        const players = await Promise.all(
          room.players.map(async (player) => {
            const result = await pool.query('SELECT * FROM users WHERE id = $1', [player.userId]);
            return result.rows[0];
          })
        );
        return { roomName, players };
      })
    );
    res.json(roomsWithDetails);
  } catch (error) {
    console.error('Error fetching rooms:', error.message);
    res.status(500).json({ error: 'An error occurred while fetching rooms.' });
  }
});


// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});