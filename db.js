// db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'chat.db');
console.log('Database path:', dbPath);

// НЕ УДАЛЯЕМ базу, просто подключаемся
const db = new Database(dbPath);

// Проверяем структуру таблицы
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='messages'
`).get();

if (!tableExists) {
  console.log('Creating new database...');
  // Создаём таблицу
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
  console.log('✅ Table created');
} else {
  console.log('✅ Database exists, checking structure...');
  
  // Проверяем наличие всех нужных колонок
  const columns = db.prepare("PRAGMA table_info(messages)").all();
  const columnNames = columns.map(col => col.name);
  
  if (!columnNames.includes('edited')) {
    console.log('Adding edited column...');
    db.exec(`ALTER TABLE messages ADD COLUMN edited INTEGER DEFAULT 0`);
  }
  if (!columnNames.includes('edited_at')) {
    console.log('Adding edited_at column...');
    db.exec(`ALTER TABLE messages ADD COLUMN edited_at DATETIME`);
  }
  
  console.log('✅ Database structure is correct');
}

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
    const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
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