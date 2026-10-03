import mysql from "mysql2/promise";
import dns from "node:dns/promises";
import net from "node:net";


// =====================================================
// MYSQL CONFIGURATION
// =====================================================

const host =
  process.env.MYSQL_TEST_HOST ||
  process.env.MYSQLHOST ||
  "mysql.railway.internal";

const port =
  Number(
    process.env.MYSQLPORT || 3306
  );

const user =
  process.env.MYSQLUSER;

const password =
  process.env.MYSQLPASSWORD;

const database =
  process.env.MYSQLDATABASE;


// =====================================================
// STARTUP CONFIGURATION LOG
// =====================================================

console.log(
  "[MYSQL] Host:",
  host
);

console.log(
  "[MYSQL] Port:",
  port
);

console.log(
  "[MYSQL] User:",
  user
);

console.log(
  "[MYSQL] Database:",
  database
);


// =====================================================
// DNS TEST
// =====================================================

async function testDns() {

  console.log(
    "[MYSQL TEST] Checking DNS..."
  );

  try {

    const result =
      await dns.lookup(
        host,
        {
          all: true
        }
      );

    console.log(
      "[MYSQL TEST] DNS result:",
      JSON.stringify(result)
    );

    return result;

  } catch (error) {

    console.error(
      "[MYSQL TEST] DNS FAILED:",
      error
    );

    throw error;

  }
}


// =====================================================
// TCP TEST
// =====================================================

async function testTcp() {

  console.log(
    "[MYSQL TEST] Testing TCP connection..."
  );

  return new Promise(
    (resolve, reject) => {

      const socket =
        net.createConnection({
          host,
          port,
          timeout: 10000
        });


      socket.on(
        "connect",
        () => {

          console.log(
            "[MYSQL TEST] TCP CONNECTION SUCCESSFUL"
          );

          socket.destroy();

          resolve();

        }
      );


      socket.on(
        "timeout",
        () => {

          console.error(
            "[MYSQL TEST] TCP CONNECTION TIMEOUT"
          );

          socket.destroy();

          reject(
            new Error(
              "TCP connection timed out"
            )
          );

        }
      );


      socket.on(
        "error",
        error => {

          console.error(
            "[MYSQL TEST] TCP CONNECTION FAILED:",
            error
          );

          reject(error);

        }
      );

    }
  );

}


// =====================================================
// MYSQL CONNECTION POOL
// =====================================================

const pool =
  mysql.createPool({

    host,

    port,

    user,

    password,

    database,

    waitForConnections:
      true,

    connectionLimit:
      10,

    queueLimit:
      0

  });


// =====================================================
// TEST MYSQL CONNECTION
// =====================================================

export async function testDatabaseConnection() {

  console.log(
    "[MYSQL] Testing connection..."
  );


  // DNS test
  await testDns();


  // TCP test
  await testTcp();


  // Actual MySQL test
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
