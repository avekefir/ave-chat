// db.js
const Database = require('better-sqlite3');
const path = require('path');

// Подключаемся к базе данных (файл создастся автоматически)
const db = new Database(path.join(__dirname, 'chat.db'));

// Создаём таблицу сообщений, если её нет
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Функция для сохранения нового сообщения
function saveMessage(nickname, text) {
  const stmt = db.prepare('INSERT INTO messages (nickname, text) VALUES (?, ?)');
  const info = stmt.run(nickname, text);
  return info.lastInsertRowid; // возвращаем ID вставленной записи
}

// Функция для получения последних N сообщений (по умолчанию 50)
function getRecentMessages(limit = 50) {
  const stmt = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?');
  const rows = stmt.all(limit);
  return rows.reverse(); // возвращаем в хронологическом порядке
}

module.exports = { saveMessage, getRecentMessages };