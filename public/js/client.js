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

  function showGameOver() {
    joinArea.classList.add('hidden');
    waitingArea.classList.add('hidden');
    gameArea.classList.add('hidden');
    gameOver.classList.remove('hidden');
  }

  // Check for saved player data before initializing Socket.IO
  const savedPlayerData = localStorage.getItem('triviaPlayerData');
  if (savedPlayerData) {
    try {
      const playerData = JSON.parse(savedPlayerData);
      if (playerData && playerData.name) {
        playerName = playerData.name;
        console.log(`Found saved player name: ${playerName}`);
      }
    } catch (e) {
      console.error('Error parsing saved player data', e);
      localStorage.removeItem('triviaPlayerData');
    }
  }

  // Connect to Socket.IO server with options for Vercel serverless
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity, // Keep trying indefinitely
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000, // Cap at 5 seconds
    timeout: 20000,
    autoConnect: true,
    query: playerName ? { name: playerName } : undefined // Include player name if available
  });

  // Add explicit reconnection handling
  socket.on('reconnect', (attemptNumber) => {
    console.log(`Reconnected after ${attemptNumber} attempts`);
    
    // If we have player data saved, automatically rejoin the game
    if (playerName) {
      console.log(`Auto-rejoining as ${playerName}`);
      
      // Update query parameters for next reconnection attempt
      if (socket.io && socket.io.opts) {
        socket.io.opts.query = { name: playerName };
      }
      
      socket.emit('joinGame', playerName);
      isReconnecting = true;
      
      // Check if we had selected an answer for the current question
      try {
        const storedAnswer = sessionStorage.getItem(`triviaAnswer_${currentQuestionIndex}`);
        if (storedAnswer && currentQuestion) {
          console.log(`Re-submitting answer: ${storedAnswer}`);
          // After a short delay to ensure reconnection is complete
          setTimeout(() => {
            socket.emit('submitAnswer', storedAnswer);
          }, 500);
        }
      } catch (e) {
        console.error('Error resubmitting answer on reconnect:', e);
      }
    }
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`Reconnection attempt ${attemptNumber}`);
  });

  socket.on('reconnect_error', (error) => {
    console.log('Reconnection error:', error);
  });

  socket.on('reconnect_failed', () => {
    console.log('Failed to reconnect');
    // Maybe show a message to the user that they need to refresh
  });

  socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
  });

  // Add disconnect handling
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    
    // Save the current game state in session storage
    try {
      // Store the key information we need to restore on reconnect
      const gameState = {
        playerName,
        currentQuestionIndex,
        selectedAnswer,
        totalQuestions,
        inGame: true
      };
      sessionStorage.setItem('triviaGameState', JSON.stringify(gameState));
    } catch (e) {
      console.error('Error saving game state on disconnect:', e);
    }
  });

  // Handle reconnection needed event from server
  socket.on('reconnectionNeeded', (data) => {
    console.log('Reconnection needed with name:', data.name);
    if (data.name) {
      playerName = data.name;
      socket.emit('joinGame', playerName);
    }
  });

  // Initialize UI based on saved data
  if (playerName) {
    // Pre-fill the input field
    playerNameInput.value = playerName;
    
    // Always show join area first instead of auto-joining
    showJoinArea();
    
    // Update socket query params for reconnection if needed
    if (socket.io && socket.io.opts && !socket.io.opts.query) {
      socket.io.opts.query = { name: playerName };
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

  // After socket event handling, check for saved game state on load
  const savedGameState = sessionStorage.getItem('triviaGameState');
  if (savedGameState) {
    try {
      const gameState = JSON.parse(savedGameState);
      if (gameState.inGame && gameState.playerName) {
        console.log('Restoring game state from session storage:', gameState);
        playerName = gameState.playerName;
        currentQuestionIndex = gameState.currentQuestionIndex;
        selectedAnswer = gameState.selectedAnswer;
        totalQuestions = gameState.totalQuestions;
        
        // Auto-rejoin on page load if we have a saved game state
        if (socket.connected) {
          console.log('Auto-rejoining with saved game state');
          socket.emit('joinGame', playerName);
          playerNameDisplay.textContent = playerName;
          isReconnecting = true;
        }
      }
    } catch (e) {
      console.error('Error parsing saved game state:', e);
      sessionStorage.removeItem('triviaGameState');
    }
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
    
    // If we're reconnecting and already have an answer for this question, resubmit it
    if (isReconnecting) {
      try {
        const storedAnswer = sessionStorage.getItem(`triviaAnswer_${currentQuestionIndex}`);
        if (storedAnswer) {
          console.log(`Resubmitting stored answer for question ${currentQuestionIndex + 1}: ${storedAnswer}`);
          selectedAnswer = storedAnswer;
          
          // Update the UI first
          setTimeout(updateSelectedButton, 50);
          
          // Then resubmit the answer to the server after a short delay
          setTimeout(() => {
            socket.emit('submitAnswer', storedAnswer);
          }, 300);
        }
      } catch (e) {
        console.error('Error resubmitting stored answer:', e);
      }
    }
    
    // Save current game state
    try {
      const gameState = {
        playerName,
        currentQuestionIndex,
        selectedAnswer,
        totalQuestions,
        inGame: true
      };
      sessionStorage.setItem('triviaGameState', JSON.stringify(gameState));
    } catch (e) {
      console.error('Error saving game state:', e);
    }
  });

  socket.on('nextQuestion', (data) => {
    // Reset all state for the new question
    currentQuestion = data.currentQuestion;
    currentQuestionIndex = data.currentQuestionIndex;
    selectedAnswer = null;
    
    // Clear UI
    optionsContainer.innerHTML = '';
    
    // Remove stored state for the previous question index
    if (currentQuestionIndex > 0) {
      sessionStorage.removeItem(`triviaAnswer_${currentQuestionIndex - 1}`);
    }
    
    // Save updated game state to session storage
    try {
      const gameState = {
        playerName,
        currentQuestionIndex,
        selectedAnswer: null,
        totalQuestions,
        inGame: true
      };
      sessionStorage.setItem('triviaGameState', JSON.stringify(gameState));
    } catch (e) {
      console.error('Error saving game state:', e);
    }
    
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
    // Clear game over flag and answers when game is reset
    sessionStorage.removeItem('triviaGameOver');
    
    // Clear all stored answers
    for (let i = 0; i < 50; i++) { // Clear up to 50 potential questions
      sessionStorage.removeItem(`triviaAnswer_${i}`);
    }
    
    resetGameState();
    showJoinArea();
  });


  // Add a function to update button visuals based on the selected answer
  function updateSelectedButton() {
    // Only proceed if we have a selected answer and the options are displayed
    if (!selectedAnswer || !optionsContainer) return;
    
    // Find all option buttons
    const optionButtons = optionsContainer.querySelectorAll('.option-btn');
    
    // Reset all buttons to default first
    optionButtons.forEach(btn => {
      btn.className = 'option-btn';
      // Also reset the inline styles to ensure consistency
      btn.style.backgroundColor = '#333333';
      btn.style.color = '#e0e0e0';
      btn.style.borderColor = '#444';
    });
    
    // Find the selected button and apply the selected class and styles
    optionButtons.forEach(btn => {
      if (btn.textContent === selectedAnswer) {
        btn.className = 'option-btn selected';
        // Explicitly set styles to ensure they're applied
        btn.style.backgroundColor = '#2196f3';
        btn.style.color = 'white';
        btn.style.borderColor = '#0d8bf2';
      }
    });
  }

  // Modify the answerSubmitted event handler
  socket.on('answerSubmitted', (answer) => {
    selectedAnswer = answer;
    
    // Apply the selection styling
    updateSelectedButton();
    
    // Store the answer in sessionStorage to persist across refreshes
    try {
      sessionStorage.setItem(`triviaAnswer_${currentQuestionIndex}`, answer);
    } catch (e) {
      console.error('Error storing answer in session storage:', e);
    }
  });

  socket.on('error', (message) => {
    alert('Error: ' + message);
  });

  // Event listeners
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    playerName = playerNameInput.value.trim();
    
    if (playerName) {
      // Save player data to localStorage for potential reconnection
      localStorage.setItem('triviaPlayerData', JSON.stringify({
        name: playerName,
        lastConnected: new Date().toISOString()
      }));
      
      // Update socket query params for potential future reconnections
      if (socket.io && socket.io.opts) {
        socket.io.opts.query = { name: playerName };
      }
      
      console.log(`Joining/rejoining as ${playerName}`);
      socket.emit('joinGame', playerName);
      playerNameDisplay.textContent = playerName;
      isReconnecting = true; // Flag for reconnection handling
      showWaitingArea();
    }
  });

  // Update the displayQuestion function to reapply selection when displaying a question
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
        selectedAnswer = option;
        
        // Apply the selection styling
        updateSelectedButton();
        
        // Save the selected answer in session storage
        try {
          sessionStorage.setItem(`triviaAnswer_${currentQuestionIndex}`, option);
          
          // Update the game state in session storage with the new answer
          const gameState = JSON.parse(sessionStorage.getItem('triviaGameState') || '{}');
          gameState.selectedAnswer = option;
          sessionStorage.setItem('triviaGameState', JSON.stringify(gameState));
        } catch (e) {
          console.error('Error saving selected answer:', e);
        }
        
        // Submit answer to server
        socket.emit('submitAnswer', option);
      };
      
      optionsContainer.appendChild(button);
    });
    
    // Check if there's a stored answer for this question and select it
    try {
      const storedAnswer = sessionStorage.getItem(`triviaAnswer_${currentQuestionIndex}`);
      if (storedAnswer) {
        selectedAnswer = storedAnswer;
        // Apply the selection styling with a slight delay to ensure the buttons are rendered
        setTimeout(updateSelectedButton, 50);
      }
    } catch (e) {
      console.error('Error retrieving stored answer:', e);
    }
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