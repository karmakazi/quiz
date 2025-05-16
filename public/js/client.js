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

  // Connect to Socket.IO server
  const socket = io();

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

  // Check for saved player data immediately on load
  const savedPlayerData = localStorage.getItem('triviaPlayerData');
  if (savedPlayerData) {
    try {
      const playerData = JSON.parse(savedPlayerData);
      playerName = playerData.name;
      
      if (playerName) {
        // Mark as reconnecting and prefill name
        isReconnecting = true;
        playerNameInput.value = playerName;
        playerNameDisplay.textContent = playerName;
        
        // Auto-rejoin if we have player data
        console.log("Attempting to reconnect as:", playerName);
        socket.emit('joinGame', playerName);
        
        // Show waiting area while reconnecting
        showWaitingArea();
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
    
    if (state.gameStarted) {
      currentQuestion = state.currentQuestion;
      currentQuestionIndex = state.currentQuestionIndex;
      totalQuestions = state.roundsTotal;
      showGameArea();
      displayQuestion();
    } else if (state.gameOver) {
      showGameOver();
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
    answerStatus.classList.add('hidden');
    answerStatus.textContent = '';
    optionsContainer.innerHTML = '';
    
    // Remove any stored state for this question
    sessionStorage.removeItem(`triviaQuestion_${currentQuestionIndex}`);
    localStorage.removeItem(`triviaQuestion_${currentQuestionIndex}`);
    
    showGameArea();
    displayQuestion();
  });

  socket.on('gameOver', () => {
    showGameOver();
  });

  socket.on('gameReset', () => {
    resetGameState();
    showJoinArea();
  });

  socket.on('answerSubmitted', (answer) => {
    selectedAnswer = answer;
    answerStatus.textContent = `Your answer "${answer}" has been submitted.`;
    answerStatus.classList.remove('hidden');
    answerStatus.classList.add('success-message');
    
    // Update UI to show selected answer using simplified approach
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
    answerStatus.classList.add('hidden');
    optionsContainer.innerHTML = '';
    
    // Remove any selected classes from buttons
    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.className = 'option-btn';
    });
    
    // Don't clear playerName or localStorage since we use that for reconnection
  }
}); 