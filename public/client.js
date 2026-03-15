const socket = io();

// Элементы DOM
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const nicknameInput = document.getElementById('nickname-input');
const joinBtn = document.getElementById('join-btn');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const usersList = document.getElementById('users-list');
const userCountSpan = document.getElementById('user-count');
const voiceBtn = document.getElementById('voice-btn');
const recordingStatus = document.getElementById('recording-status');

let currentNickname = '';

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let stream = null;
let recordingTimer;
let recordingStartTime;

const MAX_RECORDING_DURATION = 60000; // 60 секунд максимум
const MIN_RECORDING_DURATION = 500;   // 500 мс минимум

// --- Вход в чат ---
joinBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (nickname === '') {
    alert('Введите ник');
    return;
  }
  currentNickname = nickname;
  
  socket.emit('join', nickname);

  fetch('/api/messages')
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  })
  .then(messages => {
    console.log('Loaded messages:', messages); // Отладка
    messagesDiv.innerHTML = '';
    
    // Проверяем, что messages - это массив
    if (Array.isArray(messages)) {
      messages.forEach(msg => {
        if (msg.type === 'voice') {
          addVoiceMessageToDom(msg);
        } else {
          addTextMessageToDom(msg);
        }
      });
    } else {
      console.error('Messages is not an array:', messages);
    }
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  })
  .catch(err => {
    console.error('Ошибка загрузки истории:', err);
    alert('Ошибка загрузки сообщений: ' + err.message);
  });

  loginContainer.style.display = 'none';
  chatContainer.style.display = 'flex';
  messageInput.disabled = false;
  sendBtn.disabled = false;
  voiceBtn.disabled = false;  
  messageInput.focus();
});

// --- Отправка текстового сообщения ---
function sendMessage() {
  const text = messageInput.value.trim();
  if (text === '') return;

  socket.emit('new message', { text });
  messageInput.value = '';
  messageInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// --- Голосовые сообщения ---
// Функция переключения записи
async function toggleRecording() {
  if (!isRecording) {
    // Начинаем запись
    await startRecording();
  } else {
    // Останавливаем запись и отправляем
    stopRecording();
  }
}

async function startRecording() {
  try {
    console.log('Запрашиваем доступ к микрофону...');
    
    stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true
      } 
    });
    
    console.log('Микрофон получен, создаем MediaRecorder');
    
    // Пробуем разные форматы
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ];
    
    let options = {};
    for (let mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        options = { mimeType };
        console.log('Используем формат:', mimeType);
        break;
      }
    }
    
    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];
    recordingStartTime = Date.now();
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
        console.log('Получен чанк, размер:', event.data.size);
      }
    };
    
    mediaRecorder.onstop = () => {
      console.log('Запись остановлена');
      
      const duration = Date.now() - recordingStartTime;
      console.log('Длительность записи:', duration, 'ms');
      
      // Проверяем минимальную длительность
      if (duration < MIN_RECORDING_DURATION || audioChunks.length === 0) {
        console.log('Запись слишком короткая, отменяем');
        alert('Запись слишком короткая');
        cleanupStream();
        updateRecordingUI(false);
        return;
      }
      
      // Создаем blob
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      console.log('Размер записи:', audioBlob.size, 'bytes');
      
      if (audioBlob.size < 2000) {
        console.log('Запись слишком маленькая, отменяем');
        alert('Запись слишком маленькая');
        cleanupStream();
        updateRecordingUI(false);
        return;
      }
      
      // Отправляем
      sendVoiceMessage(audioBlob);
      cleanupStream();
      updateRecordingUI(false);
    };
    
    mediaRecorder.onerror = (event) => {
      console.error('Ошибка MediaRecorder:', event.error);
      alert('Ошибка записи: ' + event.error);
      cleanupStream();
      updateRecordingUI(false);
    };
    
    // Запускаем запись
    mediaRecorder.start(100);
    isRecording = true;
    updateRecordingUI(true);
    
    // Автоматическая остановка через 60 секунд
    recordingTimer = setTimeout(() => {
      if (isRecording) {
        console.log('Автостоп по таймауту (60 секунд)');
        alert('Достигнут лимит записи (60 секунд)');
        stopRecording();
      }
    }, MAX_RECORDING_DURATION);
    
  } catch (err) {
    console.error('Ошибка доступа к микрофону:', err);
    let errorMessage = 'Не удалось получить доступ к микрофону. ';
    if (err.name === 'NotAllowedError') {
      errorMessage += 'Проверьте разрешения в браузере.';
    } else if (err.name === 'NotFoundError') {
      errorMessage += 'Микрофон не найден.';
    }
    alert(errorMessage);
    cleanupStream();
    updateRecordingUI(false);
  }
}

function stopRecording() {
  console.log('stopRecording вызван');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  
  if (recordingTimer) {
    clearTimeout(recordingTimer);
    recordingTimer = null;
  }
}

function cleanupStream() {
  if (stream) {
    stream.getTracks().forEach(track => {
      track.stop();
      console.log('Трек остановлен:', track.kind);
    });
    stream = null;
  }
}

function updateRecordingUI(isRec) {
  if (isRec) {
    voiceBtn.textContent = '⏹️ Остановить запись';
    voiceBtn.style.backgroundColor = '#ff4444';
    voiceBtn.classList.add('recording');
    if (recordingStatus) recordingStatus.style.display = 'inline';
    messageInput.disabled = true;
    sendBtn.disabled = true;
  } else {
    voiceBtn.textContent = '🎤 Записать голосовое';
    voiceBtn.style.backgroundColor = '';
    voiceBtn.classList.remove('recording');
    if (recordingStatus) recordingStatus.style.display = 'none';
    messageInput.disabled = false;
    sendBtn.disabled = false;
  }
}

function sendVoiceMessage(blob) {
  console.log('Отправка голосового сообщения, размер:', blob.size);
  const reader = new FileReader();
  reader.onload = () => {
    console.log('Файл прочитан, отправляем на сервер');
    socket.emit('voice message', {
      audioData: reader.result
    });
  };
  reader.onerror = (err) => {
    console.error('Ошибка чтения файла:', err);
    alert('Ошибка при отправке голосового сообщения');
  };
  reader.readAsDataURL(blob);
}
// --- КРАСИВЫЙ ПЛЕЕР ДЛЯ ГОЛОСОВЫХ (исправлено для мобильных) ---

// Создание кастомного плеера
function createCustomAudioPlayer(audioUrl, msgId) {
  const container = document.createElement('div');
  container.className = 'custom-audio-player';
  container.dataset.msgId = msgId;
  
  const audio = new Audio(audioUrl);
  audio.preload = 'metadata';
  
  // Кнопка play/pause - с явными размерами
  const playBtn = document.createElement('button');
  playBtn.className = 'play-pause-btn';
  playBtn.innerHTML = '▶';
  playBtn.setAttribute('aria-label', 'Play');
  
  // Визуализация
  const visualization = document.createElement('div');
  visualization.className = 'visualization';
  for (let i = 0; i < 5; i++) {
    const bar = document.createElement('div');
    bar.className = 'visualization-bar';
    visualization.appendChild(bar);
  }
  const bars = visualization.children;
  
  // Прогресс-бар
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container';
  
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  
  const progressHandle = document.createElement('div');
  progressHandle.className = 'progress-handle';
  
  progressBar.appendChild(progressHandle);
  progressContainer.appendChild(progressBar);
  
  // Время
  const timeDisplay = document.createElement('span');
  timeDisplay.className = 'time-display';
  timeDisplay.textContent = '0:00';
  
  // Индикатор громкости (только для десктопа, на мобильных скроем CSS)
  const volumeIndicator = document.createElement('div');
  volumeIndicator.className = 'volume-indicator';
  for (let i = 0; i < 5; i++) {
    const dot = document.createElement('div');
    dot.className = 'volume-dot';
    volumeIndicator.appendChild(dot);
  }
  
  // Собираем всё вместе
  container.appendChild(playBtn);
  container.appendChild(visualization);
  container.appendChild(progressContainer);
  container.appendChild(timeDisplay);
  container.appendChild(volumeIndicator);
  
  // --- Логика плеера ---
  let isPlaying = false;
  let animationFrame;
  
  // Обновление времени и прогресса
  audio.addEventListener('timeupdate', () => {
    const progress = (audio.currentTime / audio.duration) * 100 || 0;
    progressBar.style.width = `${progress}%`;
    
    const minutes = Math.floor(audio.currentTime / 60);
    const seconds = Math.floor(audio.currentTime % 60);
    timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });
  
  // Анимация визуализации
  function updateVisualization() {
    if (isPlaying && audio.played.length > 0) {
      // Имитация визуализации (в реальном проекте можно использовать AnalyserNode)
      for (let i = 0; i < bars.length; i++) {
        const randomHeight = Math.random() * 20 + 10; // Уменьшил максимальную высоту
        bars[i].style.height = `${randomHeight}px`;
        bars[i].classList.add('active');
      }
      animationFrame = requestAnimationFrame(updateVisualization);
    } else {
      // Возврат к состоянию покоя
      for (let i = 0; i < bars.length; i++) {
        bars[i].style.height = '12px';
        bars[i].classList.remove('active');
      }
    }
  }
  
  // Play/Pause
  playBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isPlaying) {
      audio.pause();
      playBtn.innerHTML = '▶';
      playBtn.classList.remove('playing');
      playBtn.setAttribute('aria-label', 'Play');
      cancelAnimationFrame(animationFrame);
    } else {
      audio.play();
      playBtn.innerHTML = '⏸';
      playBtn.classList.add('playing');
      playBtn.setAttribute('aria-label', 'Pause');
      updateVisualization();
    }
    isPlaying = !isPlaying;
  });
  
  // Клик по прогресс-бару
  progressContainer.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
  });
  
  // При окончании
  audio.addEventListener('ended', () => {
    isPlaying = false;
    playBtn.innerHTML = '▶';
    playBtn.classList.remove('playing');
    playBtn.setAttribute('aria-label', 'Play');
    progressBar.style.width = '0%';
    timeDisplay.textContent = '0:00';
  });
  
  return container;
}
// Обработчик для кнопки голоса (простой клик)
if (voiceBtn) {
  voiceBtn.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Клик по кнопке голоса');
    toggleRecording();
  });
}

// --- Обработчики Socket.IO ---
socket.on('new message', (msg) => {
  console.log('Получено сообщение:', msg);
  
  if (msg.type === 'voice') {
    addVoiceMessageToDom(msg);
  } else {
    addTextMessageToDom(msg);
  }
  
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// --- РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ СООБЩЕНИЙ ---

// Функция для добавления меню к сообщению
function addMessageControls(messageEl, msg) {
  // Добавляем только для своих сообщений
  if (msg.nickname !== currentNickname) return;
  
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'message-controls';
  controlsDiv.innerHTML = `
    <button class="edit-btn" title="Редактировать">✏️</button>
    <button class="delete-btn" title="Удалить">🗑️</button>
  `;
  
  messageEl.appendChild(controlsDiv);
  messageEl.classList.add('own-message');
  
  // Обработчик редактирования
  const editBtn = controlsDiv.querySelector('.edit-btn');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startEditing(messageEl, msg);
  });
  
  // Обработчик удаления
  const deleteBtn = controlsDiv.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDelete(msg.id);
  });
}

// Функция начала редактирования
function startEditing(messageEl, msg) {
  console.log('Starting edit for message:', msg); // Отладка
  
  const textDiv = messageEl.querySelector('.text');
  const originalText = textDiv.textContent;
  
  // Убираем старую область редактирования если есть
  const oldEditArea = messageEl.querySelector('.edit-area');
  if (oldEditArea) oldEditArea.remove();
  
  // Создаем поле для редактирования
  const editArea = document.createElement('div');
  editArea.className = 'edit-area';
  editArea.innerHTML = `
    <input type="text" class="edit-input" value="${escapeHtml(originalText)}">
    <div class="edit-actions">
      <button class="save-edit-btn">💾 Сохранить</button>
      <button class="cancel-edit-btn">❌ Отмена</button>
    </div>
  `;
  
  // Заменяем текст на редактор
  textDiv.style.display = 'none';
  messageEl.insertBefore(editArea, textDiv.nextSibling);
  
  const editInput = editArea.querySelector('.edit-input');
  editInput.focus();
  
  // Сохранение
  const saveBtn = editArea.querySelector('.save-edit-btn');
  saveBtn.addEventListener('click', () => {
    const newText = editInput.value.trim();
    console.log('Save clicked, new text:', newText); // Отладка
    
    if (newText && newText !== originalText) {
      console.log('Emitting edit message:', { messageId: msg.id, newText }); // Отладка
      socket.emit('edit message', {
        messageId: msg.id,
        newText: newText
      });
    } else {
      console.log('No changes or empty text');
    }
    cancelEditing(messageEl, editArea, textDiv);
  });
  
  // Отмена
  const cancelBtn = editArea.querySelector('.cancel-edit-btn');
  cancelBtn.addEventListener('click', () => {
    console.log('Edit cancelled'); // Отладка
    cancelEditing(messageEl, editArea, textDiv);
  });
  
  // Enter сохраняет, Escape отменяет
  editInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveBtn.click();
    }
  });
  
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelBtn.click();
    }
  });
}

function cancelEditing(messageEl, editArea, textDiv) {
  if (editArea) editArea.remove();
  if (textDiv) textDiv.style.display = 'block';
}

function confirmDelete(messageId) {
  if (confirm('Удалить сообщение?')) {
    socket.emit('delete message', messageId);
  }
}

// Слушаем события редактирования
socket.on('message edited', (data) => {
  console.log('Message edited event:', data); // Отладка
  
  const messageEl = document.querySelector(`.message[data-id="${data.id}"]`);
  if (messageEl) {
    const textDiv = messageEl.querySelector('.text');
    if (textDiv) {
      textDiv.textContent = data.text;
      
      // Добавляем индикатор редактирования
      let editedSpan = messageEl.querySelector('.edited-indicator');
      if (!editedSpan) {
        editedSpan = document.createElement('span');
        editedSpan.className = 'edited-indicator';
        editedSpan.textContent = ' (ред.)';
        messageEl.querySelector('.timestamp').appendChild(editedSpan);
      }
    }
  }
});

// Слушаем события удаления
socket.on('message deleted', (messageId) => {
  const messageEl = document.querySelector(`.message[data-id="${messageId}"]`);
  if (messageEl) {
    messageEl.remove();
  }
});

// Обновляем функцию addTextMessageToDom
function addTextMessageToDom(msg) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message');
  messageEl.setAttribute('data-id', msg.id);
  messageEl.setAttribute('data-nickname', msg.nickname);
  
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
  const text = msg.content || msg.text || '';
  const editedIndicator = msg.edited ? ' <span class="edited-indicator">(ред.)</span>' : '';
  
  messageEl.innerHTML = `
    <span class="nickname">${escapeHtml(msg.nickname)}</span>
    <span class="timestamp">${time}${editedIndicator}</span>
    <div class="text">${escapeHtml(text)}</div>
  `;
  
  messagesDiv.appendChild(messageEl);
  
  // Добавляем кнопки управления для своих сообщений
  addMessageControls(messageEl, msg);
}

// Обновляем функцию addVoiceMessageToDom
function addVoiceMessageToDom(msg) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message');
  messageEl.setAttribute('data-id', msg.id);
  messageEl.setAttribute('data-nickname', msg.nickname);
  
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
  const filename = msg.content || msg.text || '';
  const audioUrl = `/voice/${encodeURIComponent(filename)}`;
  const editedIndicator = msg.edited ? ' <span class="edited-indicator">(ред.)</span>' : '';
  
  messageEl.innerHTML = `
    <span class="nickname">${escapeHtml(msg.nickname)}</span>
    <span class="timestamp">${time}${editedIndicator}</span>
    <div class="voice-message" data-audio-url="${audioUrl}" data-msg-id="${msg.id}"></div>
  `;
  
  messagesDiv.appendChild(messageEl);
  
  // Добавляем кастомный плеер
  const voiceContainer = messageEl.querySelector('.voice-message');
  const customPlayer = createCustomAudioPlayer(audioUrl, msg.id);
  voiceContainer.appendChild(customPlayer);
  
  // Добавляем кнопки управления для своих сообщений
  addMessageControls(messageEl, msg);
}

// Обновляем кнопку записи
function updateRecordingUI(isRec) {
  if (isRec) {
    voiceBtn.innerHTML = '⏹️ <span class="recording-wave"><span></span><span></span><span></span></span>';
    voiceBtn.style.background = 'linear-gradient(135deg, #ff4444, #ff6b6b)';
    voiceBtn.classList.add('recording');
    if (recordingStatus) {
      recordingStatus.style.display = 'inline-flex';
      recordingStatus.innerHTML = '🔴 Запись <span class="recording-wave"><span></span><span></span><span></span></span>';
    }
    messageInput.disabled = true;
    sendBtn.disabled = true;
  } else {
    voiceBtn.innerHTML = '🎤 Записать';
    voiceBtn.style.background = '';
    voiceBtn.classList.remove('recording');
    if (recordingStatus) recordingStatus.style.display = 'none';
    messageInput.disabled = false;
    sendBtn.disabled = false;
  }
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Обработка пользователей ---
socket.on('online users', (users) => {
  updateUsersList(users);
});

socket.on('user joined', (nickname) => {
  addUserToSidebar(nickname);
});

socket.on('user left', (nickname) => {
  removeUserFromSidebar(nickname);
});

function updateUsersList(users) {
  usersList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user;
    li.setAttribute('data-nickname', user);
    usersList.appendChild(li);
  });
  userCountSpan.textContent = users.length;
}

function addUserToSidebar(nickname) {
  if (document.querySelector(`[data-nickname="${nickname}"]`)) return;
  const li = document.createElement('li');
  li.textContent = nickname;
  li.setAttribute('data-nickname', nickname);
  usersList.appendChild(li);
  userCountSpan.textContent = usersList.children.length;
}

function removeUserFromSidebar(nickname) {
  const li = document.querySelector(`[data-nickname="${nickname}"]`);
  if (li) {
    li.remove();
    userCountSpan.textContent = usersList.children.length;
  }
}

socket.on('error', (msg) => {
  alert('Ошибка: ' + msg);
});

// --- ВЕРХНИЙ ИНДИКАТОР ПЕЧАТИ ---
let typingTimer;
let isTyping = false;
const TYPING_TIMEOUT = 3000; // 3 секунды

// Создаем верхний индикатор
let typingStatus = document.getElementById('typing-status');
if (!typingStatus) {
    typingStatus = document.createElement('div');
    typingStatus.id = 'typing-status';
    typingStatus.className = 'typing-status';
    typingStatus.innerHTML = `
        <span class="typing-text"></span>
        <span class="typing-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
        </span>
    `;
    document.body.appendChild(typingStatus);
    console.log('✅ Верхний индикатор создан');
}

// Добавляем класс к chat-container для отступа

// Обработка ввода текста
messageInput.addEventListener('input', () => {
    if (!currentNickname) return;
    
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing start');
        console.log('📤 typing start emitted');
    }
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        if (isTyping) {
            isTyping = false;
            socket.emit('typing stop');
            console.log('📤 typing stop emitted');
        }
    }, TYPING_TIMEOUT);
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && messageInput.value.trim() !== '') {
        clearTimeout(typingTimer);
        if (isTyping) {
            isTyping = false;
            socket.emit('typing stop');
        }
    }
});

sendBtn.addEventListener('click', () => {
    clearTimeout(typingTimer);
    if (isTyping) {
        isTyping = false;
        socket.emit('typing stop');
    }
});

// Хранилище печатающих пользователей
let typingUsers = new Map();

socket.on('typing start', (nickname) => {
    console.log('📥 RECEIVED typing start:', nickname);
    if (nickname === currentNickname) return;
    
    if (!typingUsers.has(nickname)) {
        typingUsers.set(nickname, setTimeout(() => {
            typingUsers.delete(nickname);
            updateTypingIndicator();
        }, 3500));
    }
    updateTypingIndicator();
});

socket.on('typing stop', (nickname) => {
    console.log('📥 RECEIVED typing stop:', nickname);
    if (nickname === currentNickname) return;
    
    if (typingUsers.has(nickname)) {
        clearTimeout(typingUsers.get(nickname));
        typingUsers.delete(nickname);
    }
    updateTypingIndicator();
});

function updateTypingIndicator() {
    const users = Array.from(typingUsers.keys());
    const typingTextEl = document.querySelector('#typing-status .typing-text');
    
    if (!typingTextEl) return;
    
    if (users.length === 0) {
        typingStatus.classList.remove('visible');
        if (chatContainer) chatContainer.classList.remove('with-typing');
        return;
    }
    
    let text = '';
    if (users.length === 1) {
        text = `${users[0]} печатает`;
    } else if (users.length === 2) {
        text = `${users[0]} и ${users[1]} печатают`;
    } else {
        text = `${users[0]} и еще ${users.length - 1} печатают`;
    }
    
    typingTextEl.textContent = text;
    typingStatus.classList.add('visible');
    if (chatContainer) chatContainer.classList.add('with-typing');
    
    console.log('✅ Верхний индикатор показывает:', text);
}

// Очищаем индикатор при выходе из чата
window.addEventListener('beforeunload', () => {
    if (isTyping) {
        socket.emit('typing stop');
    }
});

// --- Мобильное меню ---
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

if (menuToggle && sidebar && sidebarOverlay) {
  // Открытие меню
  menuToggle.addEventListener('click', () => {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
  });

  // Закрытие по оверлею
  sidebarOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
  });

  // Закрытие по свайпу влево
  let touchStartX = 0;
  sidebar.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  });

  sidebar.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const swipeDistance = touchEndX - touchStartX;
    
    // Если свайпнули влево больше чем на 50px
    if (swipeDistance < -50) {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
    }
  });
}