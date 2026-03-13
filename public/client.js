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
    .then(response => response.json())
    .then(messages => {
      messagesDiv.innerHTML = '';
      messages.forEach(msg => {
        if (msg.type === 'voice') {
          addVoiceMessageToDom(msg);
        } else {
          addTextMessageToDom(msg);
        }
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    })
    .catch(err => console.error('Ошибка загрузки истории:', err));

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

function addTextMessageToDom(msg) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message');
  
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
  const text = msg.content || msg.text || '';
  
  messageEl.innerHTML = `
    <span class="nickname">${escapeHtml(msg.nickname)}</span>
    <span class="timestamp">${time}</span>
    <div class="text">${escapeHtml(text)}</div>
  `;
  messagesDiv.appendChild(messageEl);
}

function addVoiceMessageToDom(msg) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message');
  
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
  const filename = msg.content || msg.text || '';
  const audioUrl = `/voice/${escapeHtml(filename)}`;
  
  messageEl.innerHTML = `
    <span class="nickname">${escapeHtml(msg.nickname)}</span>
    <span class="timestamp">${time}</span>
    <div class="voice-message">
      <audio controls src="${audioUrl}" preload="metadata"></audio>
    </div>
  `;
  messagesDiv.appendChild(messageEl);
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