import mysql from "mysql2/promise";

const host = process.env.MYSQLHOST;
const port = Number(process.env.MYSQLPORT || 3306);
const user = process.env.MYSQLUSER;
const password = process.env.MYSQLPASSWORD;
const database = process.env.MYSQLDATABASE;

console.log("[MYSQL] Host:", host);
console.log("[MYSQL] Port:", port);
console.log("[MYSQL] User:", user);
console.log("[MYSQL] Database:", database);

const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function testDatabaseConnection() {
  console.log("[MYSQL] Testing MySQL connection...");

  const connection = await pool.getConnection();

  try {
    await connection.query("SELECT 1");

    console.log("[MYSQL] Connection successful");
  } finally {
    connection.release();
  }
}

export async function initializeDatabase() {
  console.log("[MYSQL] Initializing database...");

  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        openai_conversation_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        note TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("[MYSQL] Database initialization complete");
  } finally {
    connection.release();
  }
}

export async function createChatSession(
  sessionId,
  userId,
  conversationId
) {
  await pool.execute(
    `
      INSERT INTO chat_sessions
      (
        id,
        user_id,
        openai_conversation_id
      )
      VALUES (?, ?, ?)
    `,
    [
      sessionId,
      userId,
      conversationId
    ]
  );
}

export async function getChatSession(sessionId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        user_id,
        openai_conversation_id
      FROM chat_sessions
      WHERE id = ?
      LIMIT 1
    `,
    [sessionId]
  );

  return rows[0] || null;
}

export async function saveNote(userId, note) {
  await pool.execute(
    `
      INSERT INTO notes
      (
        user_id,
        note
      )
      VALUES (?, ?)
    `,
    [
      userId,
      note
    ]
  );
}

export async function getNotes(userId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        note,
        created_at
      FROM notes
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [userId]
  );

  return rows;
}
