// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Создаем папку для голосовых сообщений, если её нет
const voiceDir = path.join(__dirname, 'voice_messages');
if (!fs.existsSync(voiceDir)) {
  fs.mkdirSync(voiceDir);
}

// Раздаём статические файлы из папок public и voice_messages
app.use(express.static(path.join(__dirname, 'public')));
app.use('/voice', express.static(voiceDir));

// API для получения последних сообщений
app.get('/api/messages', (req, res) => {
  try {
    const messages = db.getRecentMessages(50);
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Хранилище никнеймов подключённых пользователей
const users = new Map();
// Хранилище для индикатора печати
let typingUsers = new Map(); // socket.id -> { nickname, timeout }

io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);

  socket.on('join', (nickname) => {
    if (!nickname || nickname.trim() === '') {
      socket.emit('error', 'Ник не может быть пустым');
      return;
    }
    users.set(socket.id, nickname.trim());
    console.log(`${nickname} присоединился`);

    socket.broadcast.emit('user joined', nickname);
    const onlineUsers = Array.from(users.values());
    socket.emit('online users', onlineUsers);
  });

  // --- Обработка индикатора печати ---
  socket.on('typing start', () => {
    const nickname = users.get(socket.id);
    if (!nickname) return;
    
    // Если уже есть таймер для этого пользователя - очищаем
    if (typingUsers.has(socket.id)) {
      clearTimeout(typingUsers.get(socket.id).timeout);
    }
    
    // Устанавливаем новый таймер
    const timeout = setTimeout(() => {
      // Если пользователь не печатал 3 секунды - убираем индикатор
      typingUsers.delete(socket.id);
      socket.broadcast.emit('typing stop', nickname);
    }, 3000);
    
    typingUsers.set(socket.id, { nickname, timeout });
    
    // Сообщаем всем КРОМЕ отправителя, что этот пользователь печатает
    socket.broadcast.emit('typing start', nickname);
  });

  socket.on('typing stop', () => {
    const nickname = users.get(socket.id);
    if (!nickname) return;
    
    if (typingUsers.has(socket.id)) {
      clearTimeout(typingUsers.get(socket.id).timeout);
      typingUsers.delete(socket.id);
    }
    
    socket.broadcast.emit('typing stop', nickname);
  });

  // Обработка текстового сообщения
  socket.on('new message', (data) => {
    const nickname = users.get(socket.id);
    if (!nickname) {
      socket.emit('error', 'Вы не представились');
      return;
    }

    const text = data.text?.trim();
    if (!text) return;

    // Останавливаем индикатор печати при отправке сообщения
    if (typingUsers.has(socket.id)) {
      clearTimeout(typingUsers.get(socket.id).timeout);
      typingUsers.delete(socket.id);
      socket.broadcast.emit('typing stop', nickname);
    }

    try {
      const messageId = db.saveMessage(nickname, text, 'text');
      const message = {
        id: messageId,
        nickname,
        text,
        type: 'text',
        timestamp: new Date().toISOString()
      };
      io.emit('new message', message);
    } catch (err) {
      console.error(err);
      socket.emit('error', 'Не удалось отправить сообщение');
    }
  });

  // Обработка голосового сообщения
  socket.on('voice message', (data) => {
    const nickname = users.get(socket.id);
    if (!nickname) {
      socket.emit('error', 'Вы не представились');
      return;
    }

    try {
      // Генерируем уникальное имя файла
      const fileName = `${Date.now()}_${socket.id}.webm`;
      const filePath = path.join(voiceDir, fileName);
      
      // Убираем метаданные из base64
      const base64Data = data.audioData.replace(/^data:audio\/webm;base64,/, '');
      
      // Сохраняем файл
      fs.writeFileSync(filePath, base64Data, 'base64');
      
      // Сохраняем в базу данных
      const messageId = db.saveMessage(nickname, fileName, 'voice');
      
      const message = {
        id: messageId,
        nickname,
        text: fileName,
        type: 'voice',
        timestamp: new Date().toISOString()
      };
      
      // Рассылаем всем
      io.emit('new message', message);
    } catch (err) {
      console.error('Ошибка сохранения голосового сообщения:', err);
      socket.emit('error', 'Не удалось сохранить голосовое сообщение');
    }
  });

  socket.on('disconnect', () => {
    const nickname = users.get(socket.id);
    if (nickname) {
      // Очищаем индикатор печати при отключении
      if (typingUsers.has(socket.id)) {
        clearTimeout(typingUsers.get(socket.id).timeout);
        typingUsers.delete(socket.id);
        socket.broadcast.emit('typing stop', nickname);
      }
      
      users.delete(socket.id);
      console.log(`${nickname} отключился`);
      io.emit('user left', nickname);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});