document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const totalStudents = document.getElementById('total-students');
  const totalQuizzes = document.getElementById('total-quizzes');
  const averageScore = document.getElementById('average-score');
  const quizContainer = document.getElementById('quiz-container');
  const refreshBtn = document.getElementById('refresh-btn');

  // Fetch and display data
  async function fetchData() {
    try {
      const response = await fetch('/api/teacher/dashboard');
      const data = await response.json();
      displayData(data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }

  function displayData(data) {
    // Update statistics
    totalStudents.textContent = Object.keys(data.students).length;
    totalQuizzes.textContent = data.quizzes.length;

    // Calculate overall average score
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    data.quizzes.forEach(quiz => {
      Object.values(quiz.responses).forEach(responses => {
        totalCorrect += responses.filter(r => r.isCorrect).length;
        totalQuestions += responses.length;
      });
    });
    
    const averagePercentage = totalQuestions > 0
      ? ((totalCorrect / totalQuestions) * 100).toFixed(1)
      : 0;
    averageScore.textContent = `${averagePercentage}%`;

    // Display quizzes
    displayQuizzes(data.quizzes);
  }

  function displayQuizzes(quizzes) {
    quizContainer.innerHTML = '';
    
    quizzes.sort((a, b) => b.timestamp - a.timestamp).forEach(quiz => {
      const quizDate = new Date(quiz.timestamp).toLocaleDateString();
      const quizTime = new Date(quiz.timestamp).toLocaleTimeString();
      
      const quizElement = document.createElement('div');
      quizElement.className = 'quiz-item';
      
      const responses = Object.values(quiz.responses);
      const totalStudents = responses.length;
      const totalQuestions = quiz.totalQuestions;

      quizElement.innerHTML = `
        <div class="quiz-header">
          <div class="quiz-info">
            <h3>Quiz on ${quizDate} at ${quizTime}</h3>
            <span class="quiz-stats">
              ${totalStudents} Student${totalStudents !== 1 ? 's' : ''} | 
              ${totalQuestions} Question${totalQuestions !== 1 ? 's' : ''}
            </span>
          </div>
          <div class="expand-icon">▼</div>
        </div>
        <div class="student-scores" style="display: none;">
          ${Object.entries(quiz.responses).map(([studentName, responses]) => {
            const correctAnswers = responses.filter(r => r.isCorrect).length;
            const percentage = ((correctAnswers / totalQuestions) * 100).toFixed(1);
            return `
              <div class="student-score ${percentage >= 70 ? 'good' : percentage >= 50 ? 'average' : 'needs-improvement'}">
                ${studentName}: ${correctAnswers}/${totalQuestions} (${percentage}%)
              </div>
            `;
          }).join('')}
        </div>
      `;

      const header = quizElement.querySelector('.quiz-header');
      const studentScores = quizElement.querySelector('.student-scores');
      const expandIcon = quizElement.querySelector('.expand-icon');

      // Add click handler for the quiz header
      header.addEventListener('click', () => {
        const isHidden = studentScores.style.display === 'none';
        studentScores.style.display = isHidden ? 'grid' : 'none';
        expandIcon.textContent = isHidden ? '▲' : '▼';
      });

      // Add separate click handler for student scores
      studentScores.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent event from bubbling up to quiz header
        
        // Show detailed responses
        const existingDetails = document.querySelector('.quiz-details');
        if (existingDetails) {
          if (existingDetails.dataset.quizTime === quiz.timestamp.toString()) {
            existingDetails.remove();
            return;
          }
          existingDetails.remove();
        }

        const detailsElement = document.createElement('div');
        detailsElement.className = 'quiz-details';
        detailsElement.dataset.quizTime = quiz.timestamp;
        
        // Create student performance table for this quiz
        const table = document.createElement('table');
        table.className = 'student-list';
        table.innerHTML = `
          <thead>
            <tr>
              <th>Question</th>
              <th>Student Responses</th>
            </tr>
          </thead>
          <tbody>
            ${responses[0].map((_, questionIndex) => {
              const questionData = responses[0][questionIndex];
              return `
                <tr>
                  <td>
                    <strong>Question ${questionIndex + 1}:</strong><br>
                    ${questionData.question}<br>
                    <span class="correct">Correct Answer: ${questionData.correctAnswer}</span>
                  </td>
                  <td>
                    ${Object.entries(quiz.responses).map(([studentName, studentResponses]) => {
                      const response = studentResponses[questionIndex];
                      return `
                        <div class="student-response ${response.isCorrect ? 'correct' : 'incorrect'}">
                          <strong>${studentName}:</strong> ${response.selectedAnswer}
                          ${response.isCorrect ? '✓' : '✗'}
                        </div>
                      `;
                    }).join('')}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        `;
        
        detailsElement.appendChild(table);
        quizElement.after(detailsElement);
      });

      // Add the quiz element to the container
      quizContainer.appendChild(quizElement);
    });
  }

  // Event listeners
  refreshBtn.addEventListener('click', fetchData);

  // Clear data button
  const clearDataBtn = document.getElementById('clear-data-btn');
  clearDataBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all student data? This cannot be undone.')) {
      try {
        const response = await fetch('/api/teacher/clear-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          alert('All data cleared successfully');
          fetchData(); // Refresh the display
        } else {
          const data = await response.json();
          alert('Error clearing data: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error clearing data:', error);
        alert('Error clearing data. Please try again.');
      }
    }
  });

  // Initial load
  fetchData();
});