// db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'chat.db');
console.log('Database path:', dbPath);

// Удаляем старую базу если она есть (для чистого старта)
if (fs.existsSync(dbPath)) {
  console.log('Removing old database...');
  fs.unlinkSync(dbPath);
}

// Создаем новую базу с правильной структурой
const db = new Database(dbPath);

// Создаём таблицу с правильными колонками
db.exec(`
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    edited INTEGER DEFAULT 0,
    edited_at DATETIME,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('✅ Database created with correct structure');
console.log('Columns: id, nickname, content, type, edited, edited_at, timestamp');

// Функция для сохранения нового сообщения
function saveMessage(nickname, content, type = 'text') {
  try {
    const stmt = db.prepare('INSERT INTO messages (nickname, content, type) VALUES (?, ?, ?)');
    const info = stmt.run(nickname, content, type);
    return info.lastInsertRowid;
  } catch (err) {
    console.error('Error in saveMessage:', err);
    throw err;
  }
}

// Функция для получения последних N сообщений
function getRecentMessages(limit = 50) {
  try {
    const stmt = db.prepare(`
      SELECT id, nickname, content, type, edited, edited_at, timestamp
      FROM messages 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    const rows = stmt.all(limit);
    return rows.reverse();
  } catch (err) {
    console.error('Error in getRecentMessages:', err);
    return [];
  }
}

// Получить сообщение по ID
function getMessageById(id) {
  try {
    const stmt = db.prepare('SELECT id, nickname, content, type, edited, edited_at, timestamp FROM messages WHERE id = ?');
    return stmt.get(id);
  } catch (err) {
    console.error('Error in getMessageById:', err);
    return null;
  }
}

// Обновить текстовое сообщение
function updateMessage(id, newText) {
  try {
    console.log('Updating message:', id, 'with text:', newText);
    
    const stmt = db.prepare(`
      UPDATE messages 
      SET content = ?, edited = 1, edited_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND type = 'text'
    `);
    
    const result = stmt.run(newText, id);
    console.log('Update result:', result);
    
    if (result.changes === 0) {
      console.log('No rows updated - message not found or wrong type');
    }
    
    return result;
  } catch (err) {
    console.error('Error in updateMessage:', err);
    throw err;
  }
}

// Удалить сообщение
function deleteMessage(id) {
  try {
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
    return stmt.run(id);
  } catch (err) {
    console.error('Error in deleteMessage:', err);
    throw err;
  }
}

module.exports = { 
  saveMessage, 
  getRecentMessages,
  getMessageById,
  updateMessage,
  deleteMessage 
};