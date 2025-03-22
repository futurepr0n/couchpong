const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Store active game rooms
const gameRooms = new Map();

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create-room', (req, res) => {
  const roomId = uuidv4().substring(0, 8); // Create a shorter room ID
  gameRooms.set(roomId, { 
    createdAt: Date.now(),
    players: 0 
  });
  
  res.redirect(`/game.html?room=${roomId}`);
});

app.get('/rooms', (req, res) => {
  // Clean up rooms that haven't been used for more than 2 hours
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  
  for (const [roomId, roomData] of gameRooms.entries()) {
    if (roomData.createdAt < twoHoursAgo && roomData.players === 0) {
      gameRooms.delete(roomId);
    }
  }
  
  // Return list of active rooms
  const rooms = Array.from(gameRooms.keys());
  res.json({ rooms });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  let currentRoom = null;
  
  console.log('A client connected:', socket.id);

  // Join a specific room
  socket.on('joinRoom', (roomId) => {
    // Validate if room exists
    if (!gameRooms.has(roomId)) {
      socket.emit('roomError', { message: 'Room does not exist' });
      return;
    }
    
    // Leave previous room if any
    if (currentRoom) {
      socket.leave(currentRoom);
      const roomData = gameRooms.get(currentRoom);
      if (roomData) {
        roomData.players--;
        gameRooms.set(currentRoom, roomData);
      }
    }
    
    // Join new room
    socket.join(roomId);
    currentRoom = roomId;
    
    // Update room data
    const roomData = gameRooms.get(roomId);
    roomData.players++;
    gameRooms.set(roomId, roomData);
    
    console.log(`Client ${socket.id} joined room ${roomId}`);
    socket.emit('roomJoined', { roomId });
  });

  // When the controller sends a throw
  socket.on('throw', (data) => {
    if (!currentRoom) {
      console.error('Throw received but client is not in a room');
      return;
    }
    
    console.log(`Received throw data in room ${currentRoom}:`, data);
    
    // Validate the throw data
    if (data && typeof data === 'object' && 
        'x' in data && 'y' in data && 'z' in data &&
        !isNaN(data.x) && !isNaN(data.y) && !isNaN(data.z)) {
      
      // Send the throw data only to clients in this room
      io.to(currentRoom).emit('throw', data);
    } else {
      console.error('Invalid throw data received:', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Update room players count
    if (currentRoom && gameRooms.has(currentRoom)) {
      const roomData = gameRooms.get(currentRoom);
      roomData.players--;
      gameRooms.set(currentRoom, roomData);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});