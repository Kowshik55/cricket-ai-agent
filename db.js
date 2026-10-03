import mysql from "mysql2/promise";


// =====================================================
// RAILWAY MYSQL CONFIGURATION
// =====================================================
//
// Railway provides these variables when the MySQL
// service is connected to this application:
//
// MYSQLHOST
// MYSQLPORT
// MYSQLUSER
// MYSQLPASSWORD
// MYSQLDATABASE
//
// We intentionally use the individual variables here
// instead of relying on MYSQL_URL.
// =====================================================


const mysqlConfig = {

  host:
    process.env.MYSQLHOST,

  port:
    Number(
      process.env.MYSQLPORT || 3306
    ),

  user:
    process.env.MYSQLUSER,

  password:
    process.env.MYSQLPASSWORD,

  database:
    process.env.MYSQLDATABASE,

  waitForConnections:
    true,

  connectionLimit:
    10,

  queueLimit:
    0

};


// =====================================================
// LOG CONFIGURATION
// =====================================================

console.log(
  "[MYSQL] Host:",
  mysqlConfig.host
);

console.log(
  "[MYSQL] Port:",
  mysqlConfig.port
);

console.log(
  "[MYSQL] User:",
  mysqlConfig.user
);

console.log(
  "[MYSQL] Database:",
  mysqlConfig.database
);


// =====================================================
// CREATE CONNECTION POOL
// =====================================================

const pool =
  mysql.createPool(
    mysqlConfig
  );


// =====================================================
// TEST CONNECTION
// =====================================================

export async function testDatabaseConnection() {

  console.log(
    "[MYSQL] Testing connection..."
  );


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
// INITIALIZE DATABASE
// =====================================================

export async function initializeDatabase() {

  console.log(
    "[MYSQL] Creating application tables..."
  );


  const connection =
    await pool.getConnection();


  try {

    // -------------------------------------------------
    // CHAT SESSIONS
    // -------------------------------------------------

    await connection.query(`

      CREATE TABLE IF NOT EXISTS chat_sessions (

        id VARCHAR(100) PRIMARY KEY,

        user_id VARCHAR(100) NOT NULL,

        openai_conversation_id
          VARCHAR(255) NOT NULL,

        created_at
          TIMESTAMP DEFAULT CURRENT_TIMESTAMP

      )

    `);


    // -------------------------------------------------
    // NOTES
    // -------------------------------------------------

    await connection.query(`

      CREATE TABLE IF NOT EXISTS notes (

        id BIGINT AUTO_INCREMENT PRIMARY KEY,

        user_id VARCHAR(100) NOT NULL,

        note TEXT NOT NULL,

        created_at
          TIMESTAMP DEFAULT CURRENT_TIMESTAMP

      )

    `);


    console.log(
      "[MYSQL] Tables initialized"
    );


  } finally {

    connection.release();

  }

}


// =====================================================
// CREATE CHAT SESSION
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


// =====================================================
// GET CHAT SESSION
// =====================================================

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

    [

      sessionId

    ]

  );


  return (

    rows[0] || null

  );

}


// =====================================================
// SAVE NOTE
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


// =====================================================
// GET NOTES
// =====================================================

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

    [

      userId

    ]

  );


  return rows;

}
