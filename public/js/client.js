document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const joinArea = document.getElementById('join-area');
  const waitingArea = document.getElementById('waiting-area');
  const gameArea = document.getElementById('game-area');
  const gameOver = document.getElementById('game-over');
  const joinForm = document.getElementById('join-form');
  const playerNameInput = document.getElementById('player-name');
  const playerNameDisplay = document.getElementById('player-name-display');
  const questionNumber = document.getElementById('question-number');
  const questionText = document.getElementById('question-text');
  const optionsContainer = document.getElementById('options-container');
  const answerStatus = document.getElementById('answer-status');

  // Game state
  let playerName = '';
  let currentQuestion = null;
  let currentQuestionIndex = 0;
  let totalQuestions = 5;
  let selectedAnswer = null;
  let isReconnecting = false;

  // Connect to Socket.IO server with options for Vercel serverless
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    autoConnect: true
  });

  // Helper functions first so they're available
  function showJoinArea() {
    joinArea.classList.remove('hidden');
    waitingArea.classList.add('hidden');
    gameArea.classList.add('hidden');
    gameOver.classList.add('hidden');
  }

  function showWaitingArea() {
    joinArea.classList.add('hidden');
    waitingArea.classList.remove('hidden');
    gameArea.classList.add('hidden');
    gameOver.classList.add('hidden');
  }

  function showGameArea() {
    joinArea.classList.add('hidden');
    waitingArea.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameOver.classList.add('hidden');
  }

  function showGameOver(leaderboard = null) {
    joinArea.classList.add('hidden');
    waitingArea.classList.add('hidden');
    gameArea.classList.add('hidden');
    gameOver.classList.remove('hidden');
    
    // Display leaderboard if available
    const leaderboardContainer = document.getElementById('client-leaderboard');
    if (leaderboardContainer) {
      leaderboardContainer.innerHTML = '';
      
      if (leaderboard && leaderboard.length > 0) {
        // Create leaderboard element
        const leaderboardElement = document.createElement('div');
        leaderboardElement.classList.add('leaderboard');
        leaderboardElement.innerHTML = '<h3>Final Leaderboard</h3>';
        
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
        
        leaderboard.forEach((player, index) => {
          const row = document.createElement('tr');
          
          // Add rank cell (position)
          const rankCell = document.createElement('td');
          rankCell.textContent = `${index + 1}`;
          
          // Add player name cell
          const nameCell = document.createElement('td');
          nameCell.textContent = player.name;
          
          // Highlight the current player
          if (player.name === playerName) {
            nameCell.classList.add('current-player');
            row.classList.add('current-player-row');
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
        leaderboardContainer.appendChild(leaderboardElement);
        
        // Add some style for the leaderboard
        const style = document.createElement('style');
        style.textContent = `
          .leaderboard {
            margin-top: 20px;
            padding: 15px;
            background-color: #2d2d2d;
            border-radius: 8px;
          }
          .leaderboard-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .leaderboard-table th,
          .leaderboard-table td {
            padding: 8px;
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
          .current-player {
            color: #4da6ff;
            font-weight: bold;
          }
          .current-player-row {
            background-color: rgba(33, 150, 243, 0.1);
          }
        `;
        document.head.appendChild(style);
      } else {
        leaderboardContainer.innerHTML = '<p>Leaderboard not available</p>';
      }
    }
  }

  // Check for saved player data immediately on load
  const savedPlayerData = localStorage.getItem('triviaPlayerData');
  if (savedPlayerData) {
    try {
      const playerData = JSON.parse(savedPlayerData);
      playerName = playerData.name;
      
      if (playerName) {
        // Just pre-fill the name input, but don't auto-join
        playerNameInput.value = playerName;
        
        // Only store the name for reconnection logic but don't auto-join
        isReconnecting = false;
        
        // Always show the join area first
        showJoinArea();
      }
    } catch (e) {
      console.error('Error parsing saved player data', e);
      localStorage.removeItem('triviaPlayerData');
      showJoinArea();
    }
  } else {
    showJoinArea();
  }

  // Reset partial game state
  resetGameState();

  // Socket.IO event listeners
  socket.on('gameState', (state) => {
    console.log("Received gameState:", state);
    
    if (state.gameOver) {
      // Handle game over first to prevent trying to show question 6
      showGameOver();
    } else if (state.gameStarted) {
      // Only show the game area if the game isn't over
      currentQuestion = state.currentQuestion;
      currentQuestionIndex = state.currentQuestionIndex;
      totalQuestions = state.roundsTotal;
      
      // Check if we're trying to show a question beyond the total
      if (currentQuestionIndex >= totalQuestions) {
        console.log("Invalid question index, showing game over");
        showGameOver();
      } else {
        showGameArea();
        displayQuestion();
      }
    } else if (isReconnecting) {
      // We're reconnecting but game hasn't started yet
      showWaitingArea();
    }
  });

  socket.on('gameStarted', (data) => {
    currentQuestion = data.currentQuestion;
    currentQuestionIndex = data.currentQuestionIndex;
    totalQuestions = data.totalQuestions;
    showGameArea();
    displayQuestion();
  });

  socket.on('nextQuestion', (data) => {
    // Reset all state for the new question
    currentQuestion = data.currentQuestion;
    currentQuestionIndex = data.currentQuestionIndex;
    selectedAnswer = null;
    
    // Clear UI
    optionsContainer.innerHTML = '';
    
    // Remove any stored state for this question
    sessionStorage.removeItem(`triviaQuestion_${currentQuestionIndex}`);
    localStorage.removeItem(`triviaQuestion_${currentQuestionIndex}`);
    
    showGameArea();
    displayQuestion();
  });

  socket.on('gameOver', (data) => {
    // Store game over state in session storage so refreshing will still show game over
    sessionStorage.setItem('triviaGameOver', 'true');
    
    // Store leaderboard data if available
    if (data && data.leaderboard) {
      sessionStorage.setItem('triviaLeaderboard', JSON.stringify(data.leaderboard));
    }
    
    showGameOver(data ? data.leaderboard : null);
  });

  socket.on('gameReset', () => {
    // Clear game over flag when game is reset
    sessionStorage.removeItem('triviaGameOver');
    sessionStorage.removeItem('triviaLeaderboard');
    resetGameState();
    showJoinArea();
  });

  // Check for game over state in session storage during initialization
  if (sessionStorage.getItem('triviaGameOver') === 'true') {
    try {
      const leaderboard = JSON.parse(sessionStorage.getItem('triviaLeaderboard') || '[]');
      showGameOver(leaderboard);
    } catch (e) {
      console.error('Error parsing stored leaderboard', e);
      showGameOver();
    }
  }

  socket.on('answerSubmitted', (answer) => {
    selectedAnswer = answer;
    
    // Keep only the button selection UI update
    const optionButtons = optionsContainer.querySelectorAll('.option-btn');
    optionButtons.forEach(button => {
      // Reset all buttons to default first
      button.className = 'option-btn';
      
      // Then set only the matching one to selected
      if (button.textContent === answer) {
        button.className = 'option-btn selected';
      }
    });
  });

  socket.on('error', (message) => {
    alert('Error: ' + message);
  });

  // Event listeners
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    playerName = playerNameInput.value.trim();
    
    if (playerName) {
      // Save player data to localStorage
      localStorage.setItem('triviaPlayerData', JSON.stringify({
        name: playerName
      }));
      
      socket.emit('joinGame', playerName);
      playerNameDisplay.textContent = playerName;
      isReconnecting = true; // Now we're in reconnection mode
      showWaitingArea();
    }
  });

  function displayQuestion() {
    if (!currentQuestion) return;
    
    questionNumber.textContent = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
    questionText.textContent = currentQuestion.question;
    
    // Clear options container
    optionsContainer.innerHTML = '';
    
    // Create option buttons with minimal functionality
    currentQuestion.options.forEach(option => {
      const button = document.createElement('button');
      button.className = 'option-btn'; // Only default class
      button.textContent = option;
      
      // Simple click handler
      button.onclick = function() {
        // First remove selected class from all buttons
        const allButtons = optionsContainer.querySelectorAll('.option-btn');
        allButtons.forEach(btn => btn.className = 'option-btn');
        
        // Then add selected class only to this button
        this.className = 'option-btn selected';
        
        // Submit answer
        socket.emit('submitAnswer', option);
      };
      
      optionsContainer.appendChild(button);
    });
  }

  function resetGameState() {
    // Clear game state variables (except playerName)
    currentQuestion = null;
    currentQuestionIndex = 0;
    selectedAnswer = null;
    
    // Clear any stored session data
    sessionStorage.removeItem('triviaGameState');
    
    // Reset UI elements
    optionsContainer.innerHTML = '';
    
    // Remove any selected classes from buttons
    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.className = 'option-btn';
    });
    
    // Don't clear playerName or localStorage since we use that for reconnection
  }
}); 