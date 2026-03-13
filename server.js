// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Раздаём статические файлы из папки public
app.use(express.static(path.join(__dirname, 'public')));

// API для получения последних сообщений (можно использовать при загрузке страницы)
app.get('/api/messages', (req, res) => {
  try {
    const messages = db.getRecentMessages(50);
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Хранилище никнеймов подключённых пользователей (socket.id -> nickname)
const users = new Map();

// Обработка подключений Socket.IO
io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);

  // При входе пользователь отправляет свой ник
  socket.on('join', (nickname) => {
    // Простейшая проверка: ник не должен быть пустым
    if (!nickname || nickname.trim() === '') {
      socket.emit('error', 'Ник не может быть пустым');
      return;
    }
    // Сохраняем ник для этого сокета
    users.set(socket.id, nickname.trim());
    console.log(`${nickname} присоединился`);

    // Оповещаем всех, кроме нового пользователя, что кто-то зашёл
    socket.broadcast.emit('user joined', nickname);

    // Отправляем новому пользователю список всех текущих участников
    const onlineUsers = Array.from(users.values());
    socket.emit('online users', onlineUsers);
  });

  // Обработка нового сообщения
  socket.on('new message', (data) => {
    const nickname = users.get(socket.id);
    if (!nickname) {
      socket.emit('error', 'Вы не представились');
      return;
    }

    const text = data.text?.trim();
    if (!text) return; // игнорируем пустые сообщения

    try {
      // Сохраняем в базу данных
      const messageId = db.saveMessage(nickname, text);
      
      // Создаём объект сообщения для отправки клиентам
      const message = {
        id: messageId,
        nickname,
        text,
        timestamp: new Date().toISOString() // можно позже заменить на время из БД
      };

      // Рассылаем сообщение всем (включая отправителя)
      io.emit('new message', message);
    } catch (err) {
      console.error(err);
      socket.emit('error', 'Не удалось отправить сообщение');
    }
  });

  // Обработка отключения
  socket.on('disconnect', () => {
    const nickname = users.get(socket.id);
    if (nickname) {
      users.delete(socket.id);
      console.log(`${nickname} отключился`);
      // Оповещаем остальных, что пользователь вышел
      io.emit('user left', nickname);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});