import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  initializeDatabase,
  testDatabaseConnection,
  createChatSession,
  getChatSession
} from "./db.js";

import {
  connectMcp,
  createConversation,
  runCricketAgent,
  closeMcp
} from "./agent.js";


// =====================================================
// CONFIG
// =====================================================

const PORT =
  Number(process.env.PORT || 3000);


// =====================================================
// EXPRESS
// =====================================================

const app =
  express();


app.use(
  cors()
);


app.use(
  express.json()
);


// =====================================================
// STATIC FRONTEND
// =====================================================

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);


app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);


// =====================================================
// HEALTH
// =====================================================

app.get(
  "/api/health",
  async (_req, res) => {

    res.json({

      status: "ok",

      service:
        "cricket-ai-agent",

      mcp:
        "configured",

      database:
        "configured"

    });

  }
);


// =====================================================
// CREATE CHAT SESSION
// =====================================================

app.post(
  "/api/session",
  async (_req, res) => {

    try {

      // -------------------------------------------------
      // DEMO USER
      // -------------------------------------------------
      //
      // Later we will replace this with real
      // authentication.
      //

      const userId =
        "demo-user";


      const sessionId =
        crypto.randomUUID();


      const conversationId =
        await createConversation();


      await createChatSession(

        sessionId,

        userId,

        conversationId

      );


      console.log(
        "[SESSION]",
        sessionId
      );


      res.json({

        sessionId

      });


    } catch (error) {

      console.error(
        "[SESSION ERROR]",
        error
      );


      res.status(500).json({

        error:
          error instanceof Error
            ? error.message
            : String(error)

      });

    }

  }
);


// =====================================================
// CHAT
// =====================================================

app.post(
  "/api/chat",
  async (req, res) => {

    try {

      const {
        sessionId,
        message
      } = req.body;


      // -------------------------------------------------
      // VALIDATION
      // -------------------------------------------------

      if (!sessionId) {

        return res.status(400).json({

          error:
            "sessionId is required"

        });

      }


      if (
        !message ||
        typeof message !== "string"
      ) {

        return res.status(400).json({

          error:
            "message is required"

        });

      }


      // -------------------------------------------------
      // GET SESSION
      // -------------------------------------------------

      const session =
        await getChatSession(
          sessionId
        );


      if (!session) {

        return res.status(404).json({

          error:
            "Chat session not found"

        });

      }


      // -------------------------------------------------
      // RUN AGENT
      // -------------------------------------------------

      const answer =
        await runCricketAgent({

          message,

          conversationId:
            session.openai_conversation_id,

          userId:
            session.user_id

        });


      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

      res.json({

        sessionId,

        answer

      });


    } catch (error) {

      console.error(
        "[CHAT ERROR]",
        error
      );


      res.status(500).json({

        error:
          error instanceof Error
            ? error.message
            : String(error)

      });

    }

  }
);


// =====================================================
// START
// =====================================================

async function start() {

  try {

    console.log(
      "======================================"
    );

    console.log(
      "Starting Cricket AI Agent"
    );

    console.log(
      "======================================"
    );


    // -------------------------------------------------
    // MYSQL
    // -------------------------------------------------

    await testDatabaseConnection();


    await initializeDatabase();


    // -------------------------------------------------
    // MCP
    // -------------------------------------------------

    await connectMcp();


    // -------------------------------------------------
    // EXPRESS
    // -------------------------------------------------

    app.listen(

      PORT,

      "0.0.0.0",

      () => {

        console.log(
          "======================================"
        );

        console.log(
          `Server listening on port ${PORT}`
        );

        console.log(
          "======================================"
        );

      }

    );


  } catch (error) {

    console.error(
      "======================================"
    );

    console.error(
      "STARTUP FAILED"
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


// =====================================================
// SHUTDOWN
// =====================================================

async function shutdown() {

  console.log(
    "Shutting down..."
  );


  await closeMcp();


  process.exit(0);

}


process.on(
  "SIGTERM",
  shutdown
);


process.on(
  "SIGINT",
  shutdown
);


start();
