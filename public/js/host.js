document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const waitingRoom = document.getElementById('waiting-room');
  const gameArea = document.getElementById('game-area');
  const gameOver = document.getElementById('game-over');
  const responseCount = document.getElementById('response-count');
  const totalPlayers = document.getElementById('total-players');
  const qrCode = document.getElementById('qr-code');
  const joinUrl = document.getElementById('join-url');
  const waitingPlayersList = document.getElementById('waiting-players-list');
  const startGameBtn = document.getElementById('start-game-btn');
  const nextBtn = document.getElementById('next-btn');
  const newGameBtn = document.getElementById('new-game-btn');
  const questionNumber = document.getElementById('question-number');
  const questionText = document.getElementById('question-text');
  const optionsList = document.getElementById('options-list');
  const winnersContainer = document.getElementById('winners-container');

  // Game state
  let players = {};
  let currentQuestion = null;
  let previousQuestion = null;
  let currentQuestionIndex = 0;
  let totalQuestions = 5;
  let playersWhoAnswered = new Set();
  let scoreChanges = {};

  // Connect to Socket.IO server with options for Vercel serverless
  const socket = io(window.location.origin, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true
  });

  // Add reconnection handling
  socket.on('reconnect', () => {
    console.log('Host reconnected to server');
    // Request updated game state from server
    // The server will automatically send it
  });

  socket.on('reconnect_error', (error) => {
    console.log('Reconnection error:', error);
  });

  socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
  });

  // Fetch server info and set up QR code
  fetch('/api/server-info')
    .then(response => response.json())
    .then(data => {
      qrCode.src = data.qrCode;
      joinUrl.textContent = `or visit: ${data.clientUrl}`;
    })
    .catch(error => console.error('Error fetching server info:', error));

  // Socket.IO event listeners
  socket.on('gameState', (state) => {
    players = state.players;
    currentQuestionIndex = state.currentQuestionIndex;
    
    if (state.gameOver) {
      // Handle game over first to prevent trying to show question 6
      showGameOver(state.winners || [], state.leaderboard || []);
    } else if (state.gameStarted) {
      // Only show the game area if the game isn't over
      currentQuestion = state.currentQuestion;
      
      // Check if we're trying to show a question beyond the total
      if (currentQuestionIndex >= totalQuestions) {
        console.log("Invalid question index, showing game over");
        showGameOver();
      } else {
        showGameArea();
        displayQuestion();
        updatePlayersList();
      }
    } else {
      updateWaitingPlayersList();
    }
  });

  socket.on('playerJoined', (data) => {
    players = data.players;
    updateWaitingPlayersList();
    startGameBtn.disabled = Object.keys(players).length === 0;
  });

  socket.on('playerLeft', (data) => {
    players = data.players;
    updateWaitingPlayersList();
    updateResponseCounter();
    startGameBtn.disabled = Object.keys(players).length === 0;
  });

  socket.on('playerAnswered', (data) => {
    playersWhoAnswered.add(data.playerId);
    updateResponseCounter();
  });

  socket.on('gameStarted', (data) => {
    currentQuestion = data.currentQuestion;
    currentQuestionIndex = data.currentQuestionIndex;
    totalQuestions = data.totalQuestions;
    playersWhoAnswered = new Set(); // Reset the set completely
    showGameArea();
    displayQuestion();
    updateResponseCounter();
  });

  socket.on('nextQuestion', (data) => {
    // Store the current question as previous before updating
    previousQuestion = currentQuestion;
    currentQuestion = data.currentQuestion;
    currentQuestionIndex = data.currentQuestionIndex;
    players = data.players;
    scoreChanges = data.scoreChanges || {};
      playersWhoAnswered = new Set(); // Reset the set completely
      displayQuestion();
      updateResponseCounter();
  });

  socket.on('gameOver', (data) => {
    players = data.players;
    const winners = data.winners;
    const leaderboard = data.leaderboard || [];
    // Store game over state and winners in session storage for reliable refresh handling
    sessionStorage.setItem('triviaGameOver', 'true');
    sessionStorage.setItem('triviaGameWinners', JSON.stringify(winners));
    sessionStorage.setItem('triviaLeaderboard', JSON.stringify(leaderboard));
    showGameOver(winners, leaderboard);
  });

  socket.on('gameReset', () => {
    // Clear game over data when game is reset
    sessionStorage.removeItem('triviaGameOver');
    sessionStorage.removeItem('triviaGameWinners');
    sessionStorage.removeItem('triviaLeaderboard');
    players = {};
    currentQuestion = null;
    currentQuestionIndex = 0;
    playersWhoAnswered.clear();
    showWaitingRoom();
    updateWaitingPlayersList();
  });

  // Check for game over state in session storage during initialization
  if (sessionStorage.getItem('triviaGameOver') === 'true') {
    try {
      const storedWinners = JSON.parse(sessionStorage.getItem('triviaGameWinners') || '[]');
      const storedLeaderboard = JSON.parse(sessionStorage.getItem('triviaLeaderboard') || '[]');
      showGameOver(storedWinners, storedLeaderboard);
    } catch (e) {
      console.error('Error parsing stored winners or leaderboard', e);
      showGameOver([]);
    }
  }

  // Event listeners
  startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
  });

  nextBtn.addEventListener('click', () => {
    socket.emit('nextQuestion');
  });

  newGameBtn.addEventListener('click', () => {
    socket.emit('resetGame');
  });

  // Helper functions
  function updateWaitingPlayersList() {
    waitingPlayersList.innerHTML = '';
    Object.values(players).forEach(player => {
      const li = document.createElement('li');
      li.textContent = player.name;
      waitingPlayersList.appendChild(li);
    });
    
    startGameBtn.disabled = Object.keys(players).length === 0;
  }

  function updatePlayersList() {
    playersList.innerHTML = '';
    Object.values(players).forEach(player => {
      const li = document.createElement('li');
      const hasAnswered = playersWhoAnswered.has(player.id);
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = player.name;
      if (hasAnswered) {
        nameSpan.classList.add('player-answered');
      }
      
      // Create score display with appropriate visual indicators
      const scoreSpan = document.createElement('span');
      
      // Check if we have score change data for this player
      const playerScoreChange = scoreChanges[player.id];
      
      if (playerScoreChange) {
        // Create a container for the icon and score
        const scoreContainer = document.createElement('div');
        scoreContainer.style.display = 'flex';
        scoreContainer.style.alignItems = 'center';
        scoreContainer.style.gap = '5px';
        
        // Add an icon based on whether the answer was correct
        const icon = document.createElement('span');
        
        if (playerScoreChange.isCorrect) {
          // Check mark for correct answers
          icon.innerHTML = '✓';
          icon.style.color = '#4CAF50'; // Green
          icon.style.fontWeight = 'bold';
        } else {
          // X mark for incorrect answers
          icon.innerHTML = '✗';
          icon.style.color = '#F44336'; // Red
          icon.style.fontWeight = 'bold';
        }
        
        scoreContainer.appendChild(icon);
        
        // Create the score text
        const scoreText = document.createElement('span');
        scoreText.textContent = `Score: ${player.score}`;
        
        // Apply color based on score change
        if (playerScoreChange.scoreChanged && playerScoreChange.isCorrect) {
          scoreText.style.color = '#2196F3'; // Blue for increased score
          scoreText.style.fontWeight = 'bold';
        } else if (!playerScoreChange.scoreChanged && !playerScoreChange.isCorrect) {
          scoreText.style.color = '#F44336'; // Red for no change
        }
        
        scoreContainer.appendChild(scoreText);
        scoreSpan.appendChild(scoreContainer);
      } else {
        // Default display if no score change data
        scoreSpan.textContent = `Score: ${player.score}`;
      }
      
      li.appendChild(nameSpan);
      li.appendChild(scoreSpan);
      playersList.appendChild(li);
    });
    
    // Clear score changes after updating the display
    // This ensures the colors only show right after a question
    setTimeout(() => {
      scoreChanges = {};
    }, 5000); // Clear after 5 seconds so the colors remain visible for a while
  }

  function updateResponseCounter() {
    const numResponses = playersWhoAnswered.size;
    const numPlayers = Object.keys(players).length;
    responseCount.textContent = numResponses;
    totalPlayers.textContent = numPlayers;
    
    // Keep button always enabled, just update the counter
    nextBtn.disabled = false;
  }

  function displayQuestion() {
    if (!currentQuestion) return;
    
    questionNumber.textContent = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
    questionText.textContent = currentQuestion.question;
    
    // Update question image
    const questionImage = document.getElementById('question-image');
    if (currentQuestion.image) {
      questionImage.src = currentQuestion.image;
      questionImage.style.display = 'block';
    } else {
      questionImage.style.display = 'none';
    }
    
    optionsList.innerHTML = '';
    currentQuestion.options.forEach(option => {
      const li = document.createElement('li');
      li.textContent = option;
      optionsList.appendChild(li);
    });
  }


  function showWaitingRoom() {
    waitingRoom.classList.remove('hidden');
    gameArea.classList.add('hidden');
    gameOver.classList.add('hidden');
  }

  function showGameArea() {
    waitingRoom.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameOver.classList.add('hidden');
  }

  function showGameOver() {
    waitingRoom.classList.add('hidden');
    gameArea.classList.add('hidden');
    gameOver.classList.remove('hidden');
    document.getElementById('new-game-btn').focus();
    
    // Add some style for the leaderboard
    const style = document.createElement('style');
    style.textContent = `
      .leaderboard {
        margin-top: 15px;
        padding: 20px;
        background-color: #2d2d2d;
        border-radius: 8px;
        max-width: 800px;
        margin-left: auto;
        margin-right: auto;
      }
      .leaderboard-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
      }
      .leaderboard-table th,
      .leaderboard-table td {
        padding: 10px;
        text-align: left;
        border-bottom: 1px solid #444;
      }
      .leaderboard-table th {
        background-color: #1e1e1e;
        color: #4da6ff;
      }
      .leaderboard-table tr:last-child td {
        border-bottom: none;
      }
      .leaderboard-table .winner {
        color: gold;
        font-weight: bold;
      }
      .winner-heading {
        text-align: center;
        color: #4da6ff;
        margin: 0 0 10px 0;
      }
      .game-over {
        justify-content: flex-start;
        padding-top: 40px;
        overflow-y: auto;
      }
    `;
    document.head.appendChild(style);
  }
}); 