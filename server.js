const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const qrcode = require('qrcode');

// Function to load student data
function loadStudentData() {
  const studentDataPath = path.join(__dirname, 'data', 'students.json');
  try {
    if (fs.existsSync(studentDataPath)) {
      return JSON.parse(fs.readFileSync(studentDataPath, 'utf8'));
    }
    return { students: {}, quizzes: [] };
  } catch (error) {
    console.error('Error loading student data:', error);
    return { students: {}, quizzes: [] };
  }
}

// Function to save student data
function saveStudentData(data) {
  const studentDataPath = path.join(__dirname, 'data', 'students.json');
  try {
    fs.writeFileSync(studentDataPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving student data:', error);
  }
}

const app = express();
const server = http.createServer(app);

// Socket.io with CORS configuration for Vercel
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true
  },
  // This adapter helps with serverless deployment
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Serve static files
app.use(express.static('public'));

// CORS middleware for express
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Add basic routes for HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API endpoint for teacher dashboard
// Admin API endpoints
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public', 'images', 'questions'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

app.get('/api/admin/questions', (req, res) => {
  try {
    const questions = questionsData.questions;
    res.json(questions);
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: 'Error getting questions' });
  }
});

app.post('/api/admin/questions', upload.single('image'), (req, res) => {
  try {
    const { question, options, correctAnswer } = req.body;
    const parsedOptions = JSON.parse(options);
    
    const newQuestion = {
      id: Date.now(),
      question,
      options: parsedOptions,
      correctAnswer,
      image: req.file ? '/images/questions/' + req.file.filename : null
    };

    questionsData.questions.push(newQuestion);
    fs.writeFileSync(path.join(__dirname, 'data', 'questions.json'), JSON.stringify(questionsData, null, 2));
    
    res.json(newQuestion);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Error creating question' });
  }
});

app.put('/api/admin/questions/:id', upload.single('image'), (req, res) => {
  try {
    const { id } = req.params;
    const { question, options, correctAnswer } = req.body;
    const parsedOptions = JSON.parse(options);
    
    const questionIndex = questionsData.questions.findIndex(q => q.id === parseInt(id));
    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const oldQuestion = questionsData.questions[questionIndex];
    const updatedQuestion = {
      ...oldQuestion,
      question,
      options: parsedOptions,
      correctAnswer,
    };

    if (req.file) {
      // Delete old image if it exists
      if (oldQuestion.image) {
        const oldImagePath = path.join(__dirname, 'public', oldQuestion.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updatedQuestion.image = '/images/questions/' + req.file.filename;
    }

    questionsData.questions[questionIndex] = updatedQuestion;
    fs.writeFileSync(path.join(__dirname, 'data', 'questions.json'), JSON.stringify(questionsData, null, 2));
    
    res.json(updatedQuestion);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Error updating question' });
  }
});

app.delete('/api/admin/questions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const questionIndex = questionsData.questions.findIndex(q => q.id === parseInt(id));
    
    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questionsData.questions[questionIndex];
    if (question.image) {
      const imagePath = path.join(__dirname, 'public', question.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    questionsData.questions.splice(questionIndex, 1);
    fs.writeFileSync(path.join(__dirname, 'data', 'questions.json'), JSON.stringify(questionsData, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Error deleting question' });
  }
});

app.get('/api/teacher/dashboard', (req, res) => {
  try {
    const data = loadStudentData();
    res.json(data);
  } catch (error) {
    console.error('Error serving dashboard data:', error);
    res.status(500).json({ error: 'Error loading dashboard data' });
  }
});

// Load questions from JSON file
const questionsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8'));
let availableQuestions = shuffleArray([...questionsData.questions]); // Create a copy and shuffle immediately
const QUESTIONS_PER_GAME = 5; // Number of questions per game, can be modified

// Game state
const gameState = {
  players: {},
  currentQuestionIndex: 0,
  gameStarted: false,
  gameOver: false,
  roundsTotal: QUESTIONS_PER_GAME, // Using the configurable constant
  disconnectedPlayers: {}, // Store disconnected players' data
  leaderboard: [], // Persistent leaderboard for the current game
  currentQuestion: null, // Store the current question
  quizId: Date.now(), // Unique identifier for this quiz session
  responses: {}, // Store detailed responses for each player
};

// Function to shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
  const shuffled = [...array]; // Create a copy to avoid modifying the original
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap elements
  }
  return shuffled;
}

// Function to get next question
function getNextQuestion() {
  // If we're out of questions, shuffle the full set
  if (availableQuestions.length === 0) {
    console.log('Resetting question pool - out of questions');
    availableQuestions = [...questionsData.questions]; // Reset to full question set
    availableQuestions = shuffleArray(availableQuestions); // Reshuffle
  }
  
  // Get the next question and remove it from available questions
  const nextQuestion = availableQuestions.shift();
  return nextQuestion;
}

// Get local IP address for QR code
function getLocalIpAddress() {
  // For deployed environments, return null to let the host handle it
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

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
// For production, we'll let the host URL be determined at request time
const serverUrl = ipAddress ? `http://${ipAddress}:${PORT}` : '';

// Generate QR code for client connection
async function generateQRCode(hostUrl) {
  try {
    // Use provided hostUrl or default to serverUrl
    const baseUrl = hostUrl || serverUrl;
    // If we're in production with no baseUrl yet, default to placeholder
    if (!baseUrl && process.env.NODE_ENV === 'production') {
      // Return a placeholder
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    }
    
    const qrCodeDataUrl = await qrcode.toDataURL(`${baseUrl}/client`);
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
    currentQuestion: gameState.gameStarted ? gameState.currentQuestion : null,
    // Include winners and leaderboard if the game is over
    winners: gameState.gameOver ? Object.values(gameState.players).filter(p => {
      const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score), 0);
      return p.score === maxScore;
    }) : [],
    leaderboard: gameState.gameOver ? gameState.leaderboard : [] // Use the stored leaderboard directly
  });

  // Player joins the game
  socket.on('joinGame', (playerName) => {
    // Store the player name in the socket object for future reference
    socket.playerName = playerName;
    
    // First, check if a player with this name is already in the active players
    const existingActivePlayer = Object.values(gameState.players).find(p => p.name === playerName);
    
    if (existingActivePlayer) {
      // Update the existing player's socket ID
      const oldSocketId = existingActivePlayer.id;
      
      // Copy the player data to the new socket ID
      gameState.players[socket.id] = {
        ...existingActivePlayer,
        id: socket.id,
      };
      
      // Remove the old socket entry
      delete gameState.players[oldSocketId];
      
      console.log(`Player ${playerName} reconnected with new socket ID: ${socket.id} (replacing ${oldSocketId})`);
      
      // Notify everyone about the updated player list
      io.emit('playerJoined', {
        players: gameState.players,
        playerId: socket.id,
      });
      
      // If game is in progress, send current question to the reconnected player
      if (gameState.gameStarted && !gameState.gameOver) {
        socket.emit('gameStarted', {
          currentQuestion: gameState.currentQuestion,
          currentQuestionIndex: gameState.currentQuestionIndex,
          totalQuestions: gameState.roundsTotal,
        });
      } else if (gameState.gameOver) {
        // If the game is over, send game over event with leaderboard
        socket.emit('gameOver', {
          players: gameState.players,
          winners: Object.values(gameState.players).filter(p => {
            const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score), 0);
            return p.score === maxScore;
          }),
          leaderboard: gameState.leaderboard
        });
      }
      
      return; // Exit early since we've handled the reconnection
    }
    
    // Check if this might be a reconnecting player from disconnectedPlayers
    let isReconnection = false;
    
    // Look for a disconnected player with the same name
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
      
      console.log(`Player ${playerName} reconnected with new ID: ${socket.id} from disconnected list`);
      
      // If the game is over, send game over event with leaderboard
      if (gameState.gameOver) {
        socket.emit('gameOver', {
          players: gameState.players,
          winners: Object.values(gameState.players).filter(p => {
            const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score), 0);
            return p.score === maxScore;
          }),
          leaderboard: gameState.leaderboard
        });
      } else if (gameState.gameStarted) {
        // If game is in progress, send current game state
        socket.emit('gameStarted', {
          currentQuestion: gameState.currentQuestion,
          currentQuestionIndex: gameState.currentQuestionIndex,
          totalQuestions: gameState.roundsTotal,
        });
      }
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
      
      // Get the first question
      gameState.currentQuestion = getNextQuestion();
      
      io.emit('gameStarted', {
        currentQuestion: gameState.currentQuestion,
        currentQuestionIndex: gameState.currentQuestionIndex,
        totalQuestions: gameState.roundsTotal,
      });
      
      console.log('Game started with first question');
    } else {
      socket.emit('error', 'Need at least one player to start');
    }
  });

  // Player submits an answer
  socket.on('submitAnswer', (answer) => {
    // Check if game is active
    if (gameState.gameStarted && !gameState.gameOver) {
      // First check if the player exists with this socket ID
      if (gameState.players[socket.id]) {
        // Player found, proceed normally
        const player = gameState.players[socket.id];
        player.currentAnswer = answer;

        // Store detailed response
        if (!gameState.responses[player.name]) {
          gameState.responses[player.name] = [];
        }
        gameState.responses[player.name].push({
          questionIndex: gameState.currentQuestionIndex,
          question: gameState.currentQuestion.question,
          selectedAnswer: answer,
          correctAnswer: gameState.currentQuestion.correctAnswer,
          isCorrect: answer === gameState.currentQuestion.correctAnswer,
          timestamp: Date.now()
        });

        socket.emit('answerSubmitted', answer);
        io.emit('playerAnswered', { playerId: socket.id });
        console.log(`Player ${player.name} submitted answer: ${answer}`);
      } else {
        // Look for this player by checking all players and disconnected players
        let playerName = null;
        
        // Attempt to extract name from socket data if available
        if (socket.playerName) {
          playerName = socket.playerName;
        }
        
        // If not found, try to get from query params if socket.io passed them
        if (!playerName && socket.handshake && socket.handshake.query && socket.handshake.query.name) {
          playerName = socket.handshake.query.name;
        }
        
        if (playerName) {
          console.log(`Found player name ${playerName} for reconnection`);
          
          // Check if player exists in disconnected players
          if (gameState.disconnectedPlayers[playerName]) {
            // Reconnect the player first before processing answer
            const playerData = gameState.disconnectedPlayers[playerName];
            
            // Create new player entry with updated socket ID
            gameState.players[socket.id] = {
              ...playerData,
              id: socket.id,
              currentAnswer: answer // Set the answer immediately
            };
            
            // Clean up old socket entry if it exists
            if (playerData.oldSocketId && playerData.oldSocketId !== socket.id) {
              delete gameState.players[playerData.oldSocketId];
            }
            
            // Remove from disconnected players
            delete gameState.disconnectedPlayers[playerName];
            
            // Save player name in socket for future reference
            socket.playerName = playerName;
            
            // Send events
            socket.emit('answerSubmitted', answer);
            io.emit('playerAnswered', { playerId: socket.id });
            
            // Update all clients with new player list
            io.emit('playerJoined', {
              players: gameState.players,
              playerId: socket.id,
            });
            
            console.log(`Player ${playerName} auto-reconnected and submitted answer: ${answer}`);
          } else {
            // Check if player exists with a different socket ID
            const existingPlayer = Object.values(gameState.players).find(p => p.name === playerName);
            
            if (existingPlayer) {
              // Player exists but with a different socket ID, update it
              const oldSocketId = existingPlayer.id;
              
              // Create new player entry with updated socket ID
              gameState.players[socket.id] = {
                ...existingPlayer,
                id: socket.id,
                currentAnswer: answer
              };
              
              // Clean up old socket entry
              delete gameState.players[oldSocketId];
              
              // Save player name in socket for future reference
              socket.playerName = playerName;
              
              // Send events
              socket.emit('answerSubmitted', answer);
              io.emit('playerAnswered', { playerId: socket.id });
              
              // Update all clients with new player list
              io.emit('playerJoined', {
                players: gameState.players,
                playerId: socket.id,
              });
              
              console.log(`Player ${playerName} updated socket ID from ${oldSocketId} to ${socket.id} and submitted answer: ${answer}`);
            } else {
              // Player not found at all, ask to join
              console.log(`Player with name ${playerName} not found in any list`);
              socket.emit('error', 'Please rejoin the game');
            }
          }
        } else {
          // No player name found, ask to join
          console.log(`No player name found for socket ${socket.id}`);
          socket.emit('error', 'Please rejoin the game');
        }
      }
    } else {
      // Game not started or already over
      socket.emit('error', 'Cannot submit answer at this time');
    }
  });

  // Host moves to next question
  socket.on('nextQuestion', () => {
    if (!gameState.gameStarted || gameState.gameOver) return;
    
    // Keep track of score changes to send to clients
    const scoreChanges = {};
    
    Object.values(gameState.players).forEach((player) => {
      // Record previous score before updating
      const previousScore = player.score;
      
      // Update score if answer is correct
      if (player.currentAnswer === gameState.currentQuestion.correctAnswer) {
        player.score += 1;
      }
      
      // Record if the score changed
      scoreChanges[player.id] = {
        previousScore: previousScore,
        newScore: player.score,
        scoreChanged: previousScore !== player.score,
        isCorrect: player.currentAnswer === gameState.currentQuestion.correctAnswer
      };
      
      player.currentAnswer = null;
    });
    
    gameState.currentQuestionIndex += 1;
    
    // Check if game is over
    if (gameState.currentQuestionIndex >= gameState.roundsTotal) {
      gameState.gameOver = true;
      
      // Find winner(s)
      const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score), 0);
      const winners = Object.values(gameState.players).filter(p => p.score === maxScore);
      
      // Sort all players by score for the leaderboard (descending order)
      const sortedPlayers = Object.values(gameState.players).sort((a, b) => b.score - a.score);
      
      // Store the leaderboard in game state for reconnecting clients
      gameState.leaderboard = sortedPlayers;

      // Save quiz results to students.json
      const studentData = loadStudentData();
      const quizResults = {
        quizId: gameState.quizId,
        timestamp: Date.now(),
        responses: gameState.responses,
        totalQuestions: QUESTIONS_PER_GAME
      };
      
      // Add quiz results to the quizzes array
      studentData.quizzes.push(quizResults);

      // Update or add student records
      Object.entries(gameState.responses).forEach(([studentName, responses]) => {
        if (!studentData.students[studentName]) {
          studentData.students[studentName] = {
            name: studentName,
            quizzes: []
          };
        }
        studentData.students[studentName].quizzes.push(gameState.quizId);
      });

      // Save the updated data
      saveStudentData(studentData);
      
      // Send game over event with leaderboard to all clients
      io.emit('gameOver', {
        players: gameState.players,
        winners,
        leaderboard: sortedPlayers
      });
      
      console.log('Game over, leaderboard:', sortedPlayers);
    } else {
      // Get the next question
      gameState.currentQuestion = getNextQuestion();
      
      io.emit('nextQuestion', {
        currentQuestion: gameState.currentQuestion,
        currentQuestionIndex: gameState.currentQuestionIndex,
        totalQuestions: gameState.roundsTotal,
        players: gameState.players,
        scoreChanges: scoreChanges
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
    gameState.leaderboard = []; // Clear the leaderboard
    
    io.emit('gameReset');
    console.log('Game reset');
  });

  // Disconnect event
  socket.on('disconnect', () => {
    if (gameState.players[socket.id]) {
      const playerData = gameState.players[socket.id];
      
      // Store the player data in disconnectedPlayers with a timestamp
      gameState.disconnectedPlayers[playerData.name] = {
        ...playerData,
        disconnectedAt: Date.now(),
        oldSocketId: socket.id // Keep track of the old socket ID
      };
      
      console.log(`Player ${playerData.name} disconnected temporarily (data saved for reconnection)`);
      
      // Set a timeout to remove the player if they don't reconnect within 30 seconds
      // We DO NOT immediately remove them from the active players list
      setTimeout(() => {
        // Check if the player is still in the disconnected list and hasn't reconnected
        if (gameState.disconnectedPlayers[playerData.name]) {
          // Now check if they're still using the same socket ID (i.e., haven't reconnected)
          const isReconnected = !Object.values(gameState.players).some(p => 
            p.name === playerData.name && p.id !== gameState.disconnectedPlayers[playerData.name].oldSocketId
          );
          
          if (!isReconnected) {
            // If they haven't reconnected, now remove them from active players
            delete gameState.players[gameState.disconnectedPlayers[playerData.name].oldSocketId];
            
            // Notify other players
            io.emit('playerLeft', {
              players: gameState.players,
              playerId: gameState.disconnectedPlayers[playerData.name].oldSocketId,
            });
            
            console.log(`Player ${playerData.name} has been fully removed after timeout`);
          } else {
            // They reconnected with a new socket ID, so just clean up the disconnected entry
            delete gameState.disconnectedPlayers[playerData.name];
            console.log(`Player ${playerData.name} reconnected successfully, cleaned up disconnected entry`);
          }
        }
      }, 30000); // 30 seconds timeout
    } else {
      console.log('Client disconnected:', socket.id);
    }
  });
});

app.get('/api/server-info', async (req, res) => {
  // Determine the host URL from the request in production
  let hostUrl = serverUrl;
  if (process.env.NODE_ENV === 'production') {
    // Get protocol, hostname and port from request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    hostUrl = `${protocol}://${host}`;
  }
  
  const qrCode = await generateQRCode(hostUrl);
  res.json({ 
    url: hostUrl,
    clientUrl: `${hostUrl}/client`,
    qrCode 
  });
});

// Add a direct HTTP route to get the leaderboard data
app.get('/api/get-leaderboard', (req, res) => {
  console.log('Received request for leaderboard data');
  
  try {
    if (gameState.gameOver) {
      // Get the latest leaderboard
      const sortedPlayers = gameState.leaderboard.length > 0 
        ? gameState.leaderboard 
        : Object.values(gameState.players).sort((a, b) => b.score - a.score);
      
      // Get winners
      const maxScore = Math.max(...Object.values(gameState.players).map(p => p.score || 0), 0);
      const winners = Object.values(gameState.players).filter(p => p.score === maxScore);
      
      console.log('Returning leaderboard data:', { 
        leaderboardCount: sortedPlayers.length,
        winnerCount: winners.length
      });
      
      res.json({
        gameOver: true,
        leaderboard: sortedPlayers,
        winners: winners
      });
    } else {
      console.log('Game not over yet, no leaderboard to return');
      res.json({
        gameOver: false,
        message: 'Game is not over yet'
      });
    }
  } catch (error) {
    console.error('Error serving leaderboard data:', error);
    res.status(500).json({ error: 'Server error processing leaderboard data' });
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://${ipAddress}:${PORT}`);
  console.log(`Host view: http://localhost:${PORT}`);
  console.log(`Client view: http://localhost:${PORT}/client`);
}); 