import mysql from "mysql2/promise";
import dns from "node:dns/promises";
import net from "node:net";

const host = process.env.MYSQL_TEST_HOST;
const port = 3306;

console.log("[TEST] MYSQL_TEST_HOST:", host);
console.log("[TEST] MYSQL_TEST_PORT:", port);

async function testDns() {
  console.log("[TEST] Checking DNS...");

  try {
    const result = await dns.lookup(host, {
      all: true
    });

    console.log(
      "[TEST] DNS result:",
      JSON.stringify(result)
    );

    return result;
  } catch (error) {
    console.error(
      "[TEST] DNS FAILED:",
      error
    );

    throw error;
  }
}

async function testTcp() {
  console.log(
    "[TEST] Testing TCP connection..."
  );

  return new Promise((resolve, reject) => {

    const socket = net.createConnection({
      host,
      port,
      timeout: 10000
    });

    socket.on("connect", () => {

      console.log(
        "[TEST] TCP CONNECTION SUCCESSFUL"
      );

      socket.destroy();

      resolve();
    });

    socket.on("timeout", () => {

      console.error(
        "[TEST] TCP CONNECTION TIMEOUT"
      );

      socket.destroy();

      reject(
        new Error(
          "TCP connection timed out"
        )
      );
    });

    socket.on("error", (error) => {

      console.error(
        "[TEST] TCP CONNECTION FAILED:",
        error
      );

      reject(error);
    });
  });
}

async function testMysql() {

  console.log(
    "[TEST] Testing MySQL..."
  );

  const connection =
    await mysql.createConnection({

      host,

      port,

      user:
        process.env.MYSQLUSER,

      password:
        process.env.MYSQLPASSWORD,

      database:
        process.env.MYSQLDATABASE

    });

  try {

    const [
      rows
    ] = await connection.query(
      "SELECT 1 AS connected"
    );

    console.log(
      "[TEST] MYSQL SUCCESS:",
      rows
    );

  } finally {

    await connection.end();

  }
}


async function start() {

  console.log(
    "======================================"
  );

  console.log(
    "RAILWAY MYSQL NETWORK DIAGNOSTIC"
  );

  console.log(
    "======================================"
  );


  try {

    await testDns();

    await testTcp();

    await testMysql();


    console.log(
      "======================================"
    );

    console.log(
      "ALL MYSQL TESTS PASSED"
    );

    console.log(
      "======================================"
    );

    process.exit(0);

  } catch (error) {

    console.error(
      "======================================"
    );

    console.error(
      "MYSQL DIAGNOSTIC FAILED"
    );

    console.error(
      error
    );

    console.error(
      "======================================"
    );

    process.exit(1);
  }
}

start();
