import mysql from "mysql2/promise";


// =====================================================
// MYSQL CONNECTION
// =====================================================
//
// Railway automatically provides MYSQL_URL when a
// Railway MySQL service is connected to this service.
//
// We also support the individual MYSQL* variables.
// =====================================================

const pool = process.env.MYSQL_URL
  ? mysql.createPool(process.env.MYSQL_URL)
  : mysql.createPool({
      host: process.env.MYSQLHOST,
      port: Number(process.env.MYSQLPORT || 3306),
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,

      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });


// =====================================================
// INITIALIZE DATABASE
// =====================================================

export async function initializeDatabase() {

  const connection =
    await pool.getConnection();

  try {

    console.log("[MYSQL] Initializing database...");

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


    console.log(
      "[MYSQL] Database initialization complete"
    );

  } finally {

    connection.release();

  }
}


// =====================================================
// TEST DATABASE
// =====================================================

export async function testDatabaseConnection() {

  const connection =
    await pool.getConnection();

  try {

    await connection.query(
      "SELECT 1"
    );

    console.log(
      "[MYSQL] Connection successful"
    );

  } finally {

    connection.release();

  }
}


// =====================================================
// CHAT SESSION
// =====================================================

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


export async function getChatSession(
  sessionId
) {

  const [
    rows
  ] = await pool.execute(
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


// =====================================================
// NOTES
// =====================================================

export async function saveNote(
  userId,
  note
) {

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


export async function getNotes(
  userId
) {

  const [
    rows
  ] = await pool.execute(
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
