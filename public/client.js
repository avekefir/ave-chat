// Определяем адрес сервера автоматически
const serverUrl = window.location.origin;
const socket = io(serverUrl);

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

let currentNickname = '';

joinBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (nickname === '') {
    alert('Введите ник');
    return;
  }
  currentNickname = nickname;
  
  socket.emit('join', nickname);

  fetch(`${serverUrl}/api/messages`)
    .then(response => response.json())
    .then(messages => {
      messagesDiv.innerHTML = '';
      messages.forEach(addMessageToDom);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    })
    .catch(err => console.error('Ошибка загрузки истории:', err));

  loginContainer.style.display = 'none';
  chatContainer.style.display = 'flex';
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.focus();
});

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

socket.on('new message', (msg) => {
  addMessageToDom(msg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function addMessageToDom(msg) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message');
  
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
  
  messageEl.innerHTML = `
    <span class="nickname">${escapeHtml(msg.nickname)}</span>
    <span class="timestamp">${time}</span>
    <div class="text">${escapeHtml(msg.text)}</div>
  `;
  messagesDiv.appendChild(messageEl);
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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