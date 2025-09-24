document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const totalStudents = document.getElementById('total-students');
  const totalQuizzes = document.getElementById('total-quizzes');
  const averageScore = document.getElementById('average-score');
  const quizContainer = document.getElementById('quiz-container');
  const studentListBody = document.getElementById('student-list-body');
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

    // Display student performance
    displayStudentPerformance(data);
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
          <h3>Quiz on ${quizDate} at ${quizTime}</h3>
          <span class="quiz-stats">
            ${totalStudents} Student${totalStudents !== 1 ? 's' : ''} | 
            ${totalQuestions} Question${totalQuestions !== 1 ? 's' : ''}
          </span>
        </div>
        <div class="student-scores">
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

      quizElement.addEventListener('click', () => {
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

      quizContainer.appendChild(quizElement);
    });
  }

  function displayStudentPerformance(data) {
    studentListBody.innerHTML = '';
    
    // Calculate student statistics
    const studentStats = {};
    
    // Initialize student stats
    Object.keys(data.students).forEach(studentName => {
      studentStats[studentName] = {
        quizzesTaken: 0,
        totalScore: 0,
        totalQuestions: 0,
        lastQuizDate: 0
      };
    });
    
    // Calculate statistics from quiz data
    data.quizzes.forEach(quiz => {
      Object.entries(quiz.responses).forEach(([studentName, responses]) => {
        const stats = studentStats[studentName];
        if (stats) {
          stats.quizzesTaken++;
          stats.totalScore += responses.filter(r => r.isCorrect).length;
          stats.totalQuestions += responses.length;
          stats.lastQuizDate = Math.max(stats.lastQuizDate, quiz.timestamp);
        }
      });
    });
    
    // Display student statistics
    Object.entries(studentStats)
      .sort(([,a], [,b]) => b.lastQuizDate - a.lastQuizDate)
      .forEach(([studentName, stats]) => {
        const row = document.createElement('tr');
        const averageScore = stats.totalQuestions > 0
          ? ((stats.totalScore / stats.totalQuestions) * 100).toFixed(1)
          : 0;
        const lastQuizDate = stats.lastQuizDate > 0
          ? new Date(stats.lastQuizDate).toLocaleDateString()
          : 'N/A';
        
        row.innerHTML = `
          <td>${studentName}</td>
          <td>${stats.quizzesTaken}</td>
          <td>${averageScore}%</td>
          <td>${lastQuizDate}</td>
        `;
        
        studentListBody.appendChild(row);
      });
  }

  // Event listeners
  refreshBtn.addEventListener('click', fetchData);

  // Initial load
  fetchData();
});
