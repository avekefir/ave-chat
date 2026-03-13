const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // разрешаем все подключения (для простоты)
    methods: ["GET", "POST"]
  }
});

// Раздаём статические файлы из папки public
app.use(express.static(path.join(__dirname, 'public')));

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

// Хранилище никнеймов
const users = new Map();

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

  socket.on('new message', (data) => {
    const nickname = users.get(socket.id);
    if (!nickname) {
      socket.emit('error', 'Вы не представились');
      return;
    }

    const text = data.text?.trim();
    if (!text) return;

    try {
      const messageId = db.saveMessage(nickname, text);
      const message = {
        id: messageId,
        nickname,
        text,
        timestamp: new Date().toISOString()
      };
      io.emit('new message', message);
    } catch (err) {
      console.error(err);
      socket.emit('error', 'Не удалось отправить сообщение');
    }
  });

  socket.on('disconnect', () => {
    const nickname = users.get(socket.id);
    if (nickname) {
      users.delete(socket.id);
      console.log(`${nickname} отключился`);
      io.emit('user left', nickname);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});