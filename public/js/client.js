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
  const refreshLeaderboardBtn = document.getElementById('refresh-leaderboard-btn');

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
    
    // If we have leaderboard data passed in, display it
    if (leaderboard && Array.isArray(leaderboard) && leaderboard.length > 0) {
      displayLeaderboard(leaderboard);
    } else {
      // Otherwise fetch fresh data
      fetchLeaderboardData();
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

  // Check for game over state in session storage during initialization
  if (sessionStorage.getItem('triviaGameOver') === 'true') {
    console.log('Found gameOver flag in sessionStorage - showing game over screen');
    showGameOver(); // This will now fetch leaderboard data
  }

  // Socket.IO event listeners
  socket.on('gameState', (state) => {
    console.log("Received gameState:", state);
    
    if (state.gameOver) {
      // Handle game over first to prevent trying to show question 6
      sessionStorage.setItem('triviaGameOver', 'true');
      showGameOver(state.leaderboard);
    } else if (state.gameStarted) {
      // Only show the game area if the game isn't over
      currentQuestion = state.currentQuestion;
      currentQuestionIndex = state.currentQuestionIndex;
      totalQuestions = state.roundsTotal;
      
      // Check if we're trying to show a question beyond the total
      if (currentQuestionIndex >= totalQuestions) {
        console.log("Invalid question index, showing game over");
        sessionStorage.setItem('triviaGameOver', 'true');
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
    
    // Log the received data
    console.log('Received gameOver event with data:', data);
    
    // Show game over screen with leaderboard data if available
    showGameOver(data && data.leaderboard ? data.leaderboard : null);
  });

  socket.on('gameReset', () => {
    // Clear game over flag when game is reset
    sessionStorage.removeItem('triviaGameOver');
    resetGameState();
    showJoinArea();
  });

  // Create a simpler function for requesting leaderboard data directly via HTTP
  function fetchLeaderboardData() {
    console.log('Fetching leaderboard data via HTTP API');
    
    // Show loading message
    const leaderboardContainer = document.getElementById('client-leaderboard');
    if (leaderboardContainer) {
      leaderboardContainer.innerHTML = '<p style="text-align:center;">Loading leaderboard...</p>';
    }
    
    // Use the correct API endpoint
    fetch('/api/get-leaderboard')
      .then(response => {
        console.log('API response status:', response.status);
        return response.json();
      })
      .then(data => {
        console.log('Received leaderboard data:', data);
        
        if (data && data.gameOver && data.leaderboard && Array.isArray(data.leaderboard)) {
          // Update the display with the fresh data
          displayLeaderboard(data.leaderboard);
        } else {
          // If no data, show message
          if (leaderboardContainer) {
            leaderboardContainer.innerHTML = '<p style="text-align:center;">Leaderboard not available</p>';
          }
        }
      })
      .catch(error => {
        console.error('Error fetching leaderboard data:', error);
        if (leaderboardContainer) {
          leaderboardContainer.innerHTML = '<p style="text-align:center;">Could not load leaderboard</p>';
        }
      });
  }

  // Create a separate function to display the leaderboard
  function displayLeaderboard(leaderboardData) {
    const leaderboardContainer = document.getElementById('client-leaderboard');
    if (!leaderboardContainer || !leaderboardData || !Array.isArray(leaderboardData) || leaderboardData.length === 0) {
      return;
    }
    
    leaderboardContainer.innerHTML = '';
    
    // Create leaderboard element
    const leaderboardElement = document.createElement('div');
    leaderboardElement.style.marginTop = '20px';
    leaderboardElement.style.padding = '15px';
    leaderboardElement.style.backgroundColor = '#2d2d2d';
    leaderboardElement.style.borderRadius = '8px';
    
    const header = document.createElement('h3');
    header.textContent = 'Final Leaderboard';
    header.style.textAlign = 'center';
    header.style.color = '#4da6ff';
    header.style.marginBottom = '10px';
    leaderboardElement.appendChild(header);
    
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    
    // Add table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const rankHeader = document.createElement('th');
    rankHeader.textContent = 'Rank';
    rankHeader.style.padding = '8px';
    rankHeader.style.textAlign = 'left';
    rankHeader.style.borderBottom = '1px solid #444';
    rankHeader.style.backgroundColor = '#1e1e1e';
    rankHeader.style.color = '#4da6ff';
    
    const nameHeader = document.createElement('th');
    nameHeader.textContent = 'Player';
    nameHeader.style.padding = '8px';
    nameHeader.style.textAlign = 'left';
    nameHeader.style.borderBottom = '1px solid #444';
    nameHeader.style.backgroundColor = '#1e1e1e';
    nameHeader.style.color = '#4da6ff';
    
    const scoreHeader = document.createElement('th');
    scoreHeader.textContent = 'Score';
    scoreHeader.style.padding = '8px';
    scoreHeader.style.textAlign = 'left';
    scoreHeader.style.borderBottom = '1px solid #444';
    scoreHeader.style.backgroundColor = '#1e1e1e';
    scoreHeader.style.color = '#4da6ff';
    
    headerRow.appendChild(rankHeader);
    headerRow.appendChild(nameHeader);
    headerRow.appendChild(scoreHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Add table body with player data
    const tbody = document.createElement('tbody');
    
    leaderboardData.forEach((player, index) => {
      const row = document.createElement('tr');
      
      // Add rank cell (position)
      const rankCell = document.createElement('td');
      rankCell.textContent = `${index + 1}`;
      rankCell.style.padding = '8px';
      rankCell.style.textAlign = 'left';
      rankCell.style.borderBottom = index === leaderboardData.length - 1 ? 'none' : '1px solid #444';
      
      // Add player name cell
      const nameCell = document.createElement('td');
      nameCell.textContent = player.name;
      nameCell.style.padding = '8px';
      nameCell.style.textAlign = 'left';
      nameCell.style.borderBottom = index === leaderboardData.length - 1 ? 'none' : '1px solid #444';
      
      // Highlight the current player
      if (player.name === playerName) {
        nameCell.style.color = '#4da6ff';
        nameCell.style.fontWeight = 'bold';
        row.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
      }
      
      // Add score cell
      const scoreCell = document.createElement('td');
      scoreCell.textContent = `${player.score}`;
      scoreCell.style.padding = '8px';
      scoreCell.style.textAlign = 'left';
      scoreCell.style.borderBottom = index === leaderboardData.length - 1 ? 'none' : '1px solid #444';
      
      row.appendChild(rankCell);
      row.appendChild(nameCell);
      row.appendChild(scoreCell);
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    leaderboardElement.appendChild(table);
    leaderboardContainer.appendChild(leaderboardElement);
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

  // Add a new event listener for leaderboard data responses
  socket.on('leaderboardData', (data) => {
    console.log('Received leaderboardData event:', data);
    if (data && Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
      // Store the leaderboard data
      const leaderboardJSON = JSON.stringify(data.leaderboard);
      try {
        sessionStorage.setItem('triviaLeaderboard', leaderboardJSON);
        localStorage.setItem('triviaLeaderboard', leaderboardJSON);
      } catch (e) {
        console.error('Error storing leaderboard data:', e);
      }
      
      // Update the display
      showGameOver(data.leaderboard);
    }
  });

  // Add event listener for the refresh leaderboard button
  if (refreshLeaderboardBtn) {
    refreshLeaderboardBtn.addEventListener('click', () => {
      console.log('Manual leaderboard refresh requested');
      fetchLeaderboardData();
    });
  }
}); 