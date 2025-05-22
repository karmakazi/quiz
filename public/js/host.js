document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const waitingRoom = document.getElementById('waiting-room');
  const gameArea = document.getElementById('game-area');
  const gameOver = document.getElementById('game-over');
  const qrCode = document.getElementById('qr-code');
  const joinUrl = document.getElementById('join-url');
  const waitingPlayersList = document.getElementById('waiting-players-list');
  const playersList = document.getElementById('players-list');
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
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity, // Keep trying indefinitely
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000, // Cap at 5 seconds
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
    updatePlayersList();
    startGameBtn.disabled = Object.keys(players).length === 0;
  });

  socket.on('playerAnswered', (data) => {
    playersWhoAnswered.add(data.playerId);
    updatePlayersList();
  });

  socket.on('gameStarted', (data) => {
    currentQuestion = data.currentQuestion;
    currentQuestionIndex = data.currentQuestionIndex;
    totalQuestions = data.totalQuestions;
    playersWhoAnswered.clear();
    showGameArea();
    displayQuestion();
    updatePlayersList();
  });

  socket.on('nextQuestion', (data) => {
    // Store the current question as previous before updating
    previousQuestion = currentQuestion;
    currentQuestion = data.currentQuestion;
    currentQuestionIndex = data.currentQuestionIndex;
    players = data.players;
    scoreChanges = data.scoreChanges || {};
    playersWhoAnswered.clear();
    displayQuestion();
    updatePlayersList();
    updatePreviousAnswer();
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

  function displayQuestion() {
    if (!currentQuestion) return;
    
    questionNumber.textContent = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
    questionText.textContent = currentQuestion.question;
    
    optionsList.innerHTML = '';
    currentQuestion.options.forEach(option => {
      const li = document.createElement('li');
      li.textContent = option;
      if (option === currentQuestion.correctAnswer) {
        li.dataset.correct = 'true';
      }
      optionsList.appendChild(li);
    });
  }

  function updatePreviousAnswer() {
    const previousAnswerDiv = document.getElementById('previous-answer');
    const previousQuestionText = document.getElementById('previous-question-text');
    const previousCorrectAnswer = document.getElementById('previous-correct-answer');

    if (previousQuestion) {
      previousAnswerDiv.classList.remove('hidden');
      previousQuestionText.textContent = previousQuestion.question;
      previousCorrectAnswer.textContent = `Correct Answer: ${previousQuestion.correctAnswer}`;
    } else {
      previousAnswerDiv.classList.add('hidden');
    }
  }

  function showWaitingRoom() {
    waitingRoom.classList.remove('hidden');
    gameArea.classList.add('hidden');
    gameOver.classList.add('hidden');
    document.getElementById('previous-answer').classList.add('hidden');
  }

  function showGameArea() {
    waitingRoom.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameOver.classList.add('hidden');
    updatePreviousAnswer();
  }

  function showGameOver(winners = [], leaderboard = []) {
    waitingRoom.classList.add('hidden');
    gameArea.classList.add('hidden');
    gameOver.classList.remove('hidden');
    
    winnersContainer.innerHTML = '';
    
    // Create winner announcement
    const winnerAnnouncement = document.createElement('div');
    
    if (winners.length === 0) {
      winnerAnnouncement.innerHTML = '<p>No winners!</p>';
    } else if (winners.length === 1) {
      winnerAnnouncement.innerHTML = `
        <h3>Winner: ${winners[0].name}</h3>
        <p>Score: ${winners[0].score} points</p>
      `;
    } else {
      winnerAnnouncement.innerHTML = '<h3>It\'s a tie!</h3>';
      
      const tiedWinnersList = document.createElement('ul');
      tiedWinnersList.style.listStyleType = 'none';
      tiedWinnersList.style.padding = '0';
      
      winners.forEach(winner => {
        const li = document.createElement('li');
        li.textContent = `${winner.name}: ${winner.score} points`;
        tiedWinnersList.appendChild(li);
      });
      
      winnerAnnouncement.appendChild(tiedWinnersList);
    }
    
    winnersContainer.appendChild(winnerAnnouncement);
    
    // Create full leaderboard
    const leaderboardElement = document.createElement('div');
    leaderboardElement.classList.add('leaderboard');
    leaderboardElement.innerHTML = '<h3>Final Leaderboard</h3>';
    
    // Use leaderboard data if available, otherwise sort players by score
    const sortedPlayers = leaderboard.length > 0 ? 
      leaderboard : 
      Object.values(players).sort((a, b) => b.score - a.score);
    
    if (sortedPlayers.length > 0) {
      const table = document.createElement('table');
      table.classList.add('leaderboard-table');
      
      // Add table header
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      const rankHeader = document.createElement('th');
      rankHeader.textContent = 'Rank';
      
      const nameHeader = document.createElement('th');
      nameHeader.textContent = 'Player';
      
      const scoreHeader = document.createElement('th');
      scoreHeader.textContent = 'Score';
      
      headerRow.appendChild(rankHeader);
      headerRow.appendChild(nameHeader);
      headerRow.appendChild(scoreHeader);
      thead.appendChild(headerRow);
      table.appendChild(thead);
      
      // Add table body with player data
      const tbody = document.createElement('tbody');
      
      sortedPlayers.forEach((player, index) => {
        const row = document.createElement('tr');
        
        // Add rank cell (position)
        const rankCell = document.createElement('td');
        rankCell.textContent = `${index + 1}`;
        
        // Add player name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = player.name;
        
        // Highlight winners
        if (winners.some(w => w.id === player.id)) {
          nameCell.classList.add('winner');
        }
        
        // Add score cell
        const scoreCell = document.createElement('td');
        scoreCell.textContent = `${player.score}`;
        
        row.appendChild(rankCell);
        row.appendChild(nameCell);
        row.appendChild(scoreCell);
        tbody.appendChild(row);
      });
      
      table.appendChild(tbody);
      leaderboardElement.appendChild(table);
    } else {
      leaderboardElement.innerHTML += '<p>No players found</p>';
    }
    
    winnersContainer.appendChild(leaderboardElement);
    
    // Add some style for the leaderboard
    const style = document.createElement('style');
    style.textContent = `
      .leaderboard {
        margin-top: 30px;
        padding: 20px;
        background-color: #2d2d2d;
        border-radius: 8px;
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
    `;
    document.head.appendChild(style);
  }
}); 