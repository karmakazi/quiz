const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const qrcode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static('public'));

// Load questions from JSON file
const questionsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8'));
const questions = questionsData.questions;

// Game state
const gameState = {
  players: {},
  currentQuestionIndex: 0,
  gameStarted: false,
  gameOver: false,
  roundsTotal: 5, // We'll use 5 questions per game
  disconnectedPlayers: {}, // Store disconnected players' data
};

// Get local IP address for QR code
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const networkInterface = interfaces[name];
    if (!networkInterface) continue;
    
    for (const iface of networkInterface) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost'; // Fallback
}

const PORT = process.env.PORT || 3000;
const ipAddress = getLocalIpAddress();
const serverUrl = `http://${ipAddress}:${PORT}`;

// Generate QR code for client connection
async function generateQRCode() {
  try {
    const qrCodeDataUrl = await qrcode.toDataURL(`${serverUrl}/client`);
    return qrCodeDataUrl;
  } catch (err) {
    console.error('Error generating QR code:', err);
    return '';
  }
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Send current game state to new connections
  socket.emit('gameState', {
    ...gameState,
    currentQuestion: gameState.gameStarted ? questions[gameState.currentQuestionIndex] : null,
    // Include winners if the game is over
    winners: gameState.gameOver ? Object.values(gameState.players).filter(p => {
      const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score), 0);
      return p.score === maxScore;
    }) : []
  });

  // Player joins the game
  socket.on('joinGame', (playerName) => {
    // Check if this might be a reconnecting player
    let isReconnection = false;
    
    // Look for a disconnected player with the same name - direct lookup by name
    if (gameState.disconnectedPlayers[playerName]) {
      isReconnection = true;
      
      // Get the player data
      const playerData = gameState.disconnectedPlayers[playerName];
      
      // Restore the player's data with the new socket ID
      gameState.players[socket.id] = {
        ...playerData,
        id: socket.id,
      };
      
      // Remove from disconnected players
      delete gameState.disconnectedPlayers[playerName];
      
      console.log(`Player ${playerName} reconnected with new ID: ${socket.id}`);
    } else if (!gameState.gameStarted) {
      // New player joining before game starts
      gameState.players[socket.id] = {
        id: socket.id,
        name: playerName,
        score: 0,
        currentAnswer: null,
      };
      
      console.log(`Player ${playerName} joined the game`);
    } else {
      // Can't join a game in progress as a new player
      socket.emit('error', 'Game already in progress');
      return;
    }
    
    // Notify everyone about the player
    io.emit('playerJoined', {
      players: gameState.players,
      playerId: socket.id,
    });
  });

  // Host starts the game
  socket.on('startGame', () => {
    if (Object.keys(gameState.players).length > 0) {
      gameState.gameStarted = true;
      gameState.currentQuestionIndex = 0;
      gameState.gameOver = false;
      
      io.emit('gameStarted', {
        currentQuestion: questions[gameState.currentQuestionIndex],
        currentQuestionIndex: gameState.currentQuestionIndex,
        totalQuestions: gameState.roundsTotal,
      });
      
      console.log('Game started');
    } else {
      socket.emit('error', 'Need at least one player to start');
    }
  });

  // Player submits an answer
  socket.on('submitAnswer', (answer) => {
    if (gameState.gameStarted && !gameState.gameOver && gameState.players[socket.id]) {
      gameState.players[socket.id].currentAnswer = answer;
      socket.emit('answerSubmitted', answer);
      io.emit('playerAnswered', { playerId: socket.id });
      console.log(`Player ${gameState.players[socket.id].name} submitted answer: ${answer}`);
    }
  });

  // Host moves to next question
  socket.on('nextQuestion', () => {
    if (!gameState.gameStarted || gameState.gameOver) return;
    
    // Update scores based on current answers
    const currentQuestion = questions[gameState.currentQuestionIndex];
    
    Object.values(gameState.players).forEach((player) => {
      if (player.currentAnswer === currentQuestion.correctAnswer) {
        player.score += 1;
      }
      player.currentAnswer = null;
    });
    
    gameState.currentQuestionIndex += 1;
    
    // Check if game is over
    if (gameState.currentQuestionIndex >= gameState.roundsTotal) {
      gameState.gameOver = true;
      
      // Find winner(s)
      const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score), 0);
      const winners = Object.values(gameState.players).filter(p => p.score === maxScore);
      
      io.emit('gameOver', {
        players: gameState.players,
        winners,
      });
      
      console.log('Game over');
    } else {
      io.emit('nextQuestion', {
        currentQuestion: questions[gameState.currentQuestionIndex],
        currentQuestionIndex: gameState.currentQuestionIndex,
        totalQuestions: gameState.roundsTotal,
        players: gameState.players,
      });
      
      console.log(`Moving to question ${gameState.currentQuestionIndex + 1}`);
    }
  });

  // Reset the game
  socket.on('resetGame', () => {
    gameState.players = {};
    gameState.disconnectedPlayers = {}; // Clear disconnected players too
    gameState.currentQuestionIndex = 0;
    gameState.gameStarted = false;
    gameState.gameOver = false;
    
    io.emit('gameReset');
    console.log('Game reset');
  });

  // Disconnect event
  socket.on('disconnect', () => {
    if (gameState.players[socket.id]) {
      const playerData = gameState.players[socket.id];
      
      // Store the player data using NAME as the key for easier reconnection
      gameState.disconnectedPlayers[playerData.name] = playerData;
      
      // Remove from active players
      delete gameState.players[socket.id];
      
      // Notify other players
      io.emit('playerLeft', {
        players: gameState.players,
        playerId: socket.id,
      });
      
      console.log(`Player ${playerData.name} disconnected (data saved for reconnection)`);
    }
    console.log('Client disconnected:', socket.id);
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/api/server-info', async (req, res) => {
  const qrCode = await generateQRCode();
  res.json({ 
    url: serverUrl,
    clientUrl: `${serverUrl}/client`,
    qrCode 
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://${ipAddress}:${PORT}`);
  console.log(`Host view: http://localhost:${PORT}`);
  console.log(`Client view: http://localhost:${PORT}/client`);
}); 