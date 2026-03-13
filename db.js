// db.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'chat.db'));

// Создаём таблицу сообщений с полем type
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Функция для сохранения нового сообщения
function saveMessage(nickname, content, type = 'text') {
  const stmt = db.prepare('INSERT INTO messages (nickname, content, type) VALUES (?, ?, ?)');
  const info = stmt.run(nickname, content, type);
  return info.lastInsertRowid;
}

// Функция для получения последних N сообщений
function getRecentMessages(limit = 50) {
  const stmt = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?');
  const rows = stmt.all(limit);
  return rows.reverse();
}

module.exports = { saveMessage, getRecentMessages };