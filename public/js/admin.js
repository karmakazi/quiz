document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const questionList = document.getElementById('question-list');
  const addQuestionBtn = document.getElementById('add-question');
  const modal = document.getElementById('question-modal');
  const modalClose = modal.querySelector('.close');
  const questionForm = document.getElementById('question-form');
  const modalTitle = document.getElementById('modal-title');
  const questionIdInput = document.getElementById('question-id');
  const questionTextInput = document.getElementById('question-text');
  const questionImageInput = document.getElementById('question-image');
  const imagePreview = document.getElementById('image-preview');
  const optionsContainer = document.getElementById('options-container');
  const addOptionBtn = document.getElementById('add-option');

  // Load questions
  async function loadQuestions() {
    try {
      const response = await fetch('/api/admin/questions');
      const questions = await response.json();
      displayQuestions(questions);
    } catch (error) {
      console.error('Error loading questions:', error);
    }
  }

  // Display questions
  function displayQuestions(questions) {
    questionList.innerHTML = '';
    questions.forEach(question => {
      const questionElement = document.createElement('div');
      questionElement.className = 'question-item';
      questionElement.innerHTML = `
        <div class="question-header">
          <h3>${question.question}</h3>
          <div class="question-actions">
            <button class="button edit" data-id="${question.id}">Edit</button>
            <button class="button delete" data-id="${question.id}">Delete</button>
          </div>
        </div>
        ${question.image ? `<img src="${question.image}" class="question-image" alt="Question image">` : ''}
        <ul class="options-list">
          ${question.options.map(option => `
            <li class="option-item ${option === question.correctAnswer ? 'correct' : ''}">
              ${option}
            </li>
          `).join('')}
        </ul>
      `;

      // Add event listeners for edit and delete buttons
      const editBtn = questionElement.querySelector('.edit');
      const deleteBtn = questionElement.querySelector('.delete');

      editBtn.addEventListener('click', () => openEditModal(question));
      deleteBtn.addEventListener('click', () => deleteQuestion(question.id));

      questionList.appendChild(questionElement);
    });
  }

  // Open modal for adding/editing question
  function openModal(isEdit = false) {
    modal.style.display = 'block';
    modalTitle.textContent = isEdit ? 'Edit Question' : 'Add New Question';
    if (!isEdit) {
      resetForm();
    }
  }

  // Close modal
  function closeModal() {
    modal.style.display = 'none';
    resetForm();
  }

  // Reset form
  function resetForm() {
    questionForm.reset();
    questionIdInput.value = '';
    imagePreview.style.display = 'none';
    imagePreview.src = '';
    optionsContainer.innerHTML = '';
    addDefaultOptions();
  }

  // Add default options
  function addDefaultOptions() {
    for (let i = 0; i < 5; i++) {
      addOption();
    }
  }

  // Add option input
  function addOption() {
    const optionRow = document.createElement('div');
    optionRow.className = 'option-row';
    optionRow.innerHTML = `
      <input type="radio" name="correct-answer" required>
      <input type="text" class="option-text" placeholder="Enter option" required>
      <button type="button" class="button delete">Remove</button>
    `;

    optionRow.querySelector('.delete').addEventListener('click', () => {
      if (optionsContainer.children.length > 2) {
        optionRow.remove();
      }
    });

    optionsContainer.appendChild(optionRow);
  }

  // Open edit modal
  function openEditModal(question) {
    openModal(true);
    questionIdInput.value = question.id;
    questionTextInput.value = question.question;
    
    if (question.image) {
      imagePreview.src = question.image;
      imagePreview.style.display = 'block';
    }

    optionsContainer.innerHTML = '';
    question.options.forEach((option, index) => {
      addOption();
      const optionRow = optionsContainer.children[index];
      optionRow.querySelector('.option-text').value = option;
      optionRow.querySelector('input[type="radio"]').checked = option === question.correctAnswer;
    });
  }

  // Save question
  async function saveQuestion(formData) {
    try {
      const isEdit = !!questionIdInput.value;
      const url = isEdit ? `/api/admin/questions/${questionIdInput.value}` : '/api/admin/questions';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        body: formData
      });

      if (response.ok) {
        closeModal();
        loadQuestions();
      } else {
        console.error('Error saving question:', await response.text());
      }
    } catch (error) {
      console.error('Error saving question:', error);
    }
  }

  // Delete question
  async function deleteQuestion(id) {
    if (confirm('Are you sure you want to delete this question?')) {
      try {
        const response = await fetch(`/api/admin/questions/${id}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          loadQuestions();
        } else {
          console.error('Error deleting question:', await response.text());
        }
      } catch (error) {
        console.error('Error deleting question:', error);
      }
    }
  }

  // Event Listeners
  addQuestionBtn.addEventListener('click', () => openModal());
  modalClose.addEventListener('click', closeModal);
  addOptionBtn.addEventListener('click', addOption);

  questionImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  questionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('question', questionTextInput.value);
    
    if (questionImageInput.files[0]) {
      formData.append('image', questionImageInput.files[0]);
    }

    const options = [];
    let correctAnswer = '';
    optionsContainer.querySelectorAll('.option-row').forEach(row => {
      const optionText = row.querySelector('.option-text').value;
      options.push(optionText);
      if (row.querySelector('input[type="radio"]').checked) {
        correctAnswer = optionText;
      }
    });

    formData.append('options', JSON.stringify(options));
    formData.append('correctAnswer', correctAnswer);

    await saveQuestion(formData);
  });

  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Initial load
  loadQuestions();
  addDefaultOptions();
});
