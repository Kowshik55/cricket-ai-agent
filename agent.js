import {
  Agent,
  MCPServerStreamableHttp,
  OpenAIConversationsSession,
  run,
  startOpenAIConversationsSession,
  tool
} from "@openai/agents";

import { z } from "zod";

import {
  saveNote,
  getNotes
} from "./db.js";


// =====================================================
// CONFIG
// =====================================================

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL;


// =====================================================
// MCP SERVER
// =====================================================

const cricketMcp =
  new MCPServerStreamableHttp({

    url: MCP_SERVER_URL,

    name: "cricbuzz-mcp",

    cacheToolsList: true

  });


// =====================================================
// MYSQL TOOL
// =====================================================

const saveNoteTool =
  tool({

    name: "save_note",

    description:
      "Save a note for the current user in MySQL. Use this when the user asks you to remember or save information.",

    parameters:
      z.object({

        note:
          z.string()
            .min(1)
            .describe(
              "The information that should be saved."
            )

      }),

    async execute(
      { note },
      runContext
    ) {

      const userId =
        runContext.context.userId;

      console.log(
        "[TOOL] save_note",
        userId
      );

      await saveNote(
        userId,
        note
      );

      return (
        `Saved successfully: ${note}`
      );
    }
  });


// =====================================================
// MYSQL TOOL
// =====================================================

const getNotesTool =
  tool({

    name: "get_notes",

    description:
      "Retrieve the notes saved by the current user from MySQL.",

    parameters:
      z.object({}),

    async execute(
      _args,
      runContext
    ) {

      const userId =
        runContext.context.userId;

      console.log(
        "[TOOL] get_notes",
        userId
      );

      const notes =
        await getNotes(
          userId
        );


      if (
        notes.length === 0
      ) {

        return (
          "The user has no saved notes."
        );
      }


      return JSON.stringify(
        notes,
        null,
        2
      );
    }
  });


// =====================================================
// AI AGENT
// =====================================================

export const cricketAgent =
  new Agent({

    name:
      "Cricket AI Agent",

    model:
      process.env.OPENAI_MODEL ||
      "gpt-5.4",

    instructions: `

You are a helpful cricket AI agent.

Your main job is to answer cricket-related
questions using reliable tool data.

You have access to:

1. Cricbuzz MCP tools

Use Cricbuzz MCP tools when the user asks
about live cricket, current scores, matches,
commentary, or other current cricket information.

2. MySQL tools

Use save_note when the user asks you to
remember or save something.

Use get_notes when the user asks what they
previously saved.

IMPORTANT:

- Never invent a live cricket score.
- If current cricket information is requested,
  use the Cricbuzz MCP tools.
- If a tool returns an error, explain that
  the requested data could not be retrieved.
- Do not pretend that you called a tool if you did not.
- Answer clearly and naturally.
- Do not expose internal implementation details
  unless the user asks.
- If the user asks a general cricket question
  that does not require current information,
  answer normally.

`,

    tools: [
      saveNoteTool,
      getNotesTool
    ],

    mcpServers: [
      cricketMcp
    ],

    mcpConfig: {

      convertSchemasToStrict:
        true,

      includeServerInToolNames:
        true

    }

  });


// =====================================================
// CONNECT MCP
// =====================================================

export async function connectMcp() {

  if (!MCP_SERVER_URL) {

    throw new Error(
      "MCP_SERVER_URL environment variable is missing."
    );

  }


  console.log(
    "[MCP] Connecting to:",
    MCP_SERVER_URL
  );


  await cricketMcp.connect();


  console.log(
    "[MCP] Cricbuzz MCP connected"
  );


  const tools =
    await cricketMcp.listTools();


  console.log(
    "[MCP] Available tools:",
    tools.map(
      tool => tool.name
    )
  );
}


// =====================================================
// CREATE OPENAI CONVERSATION
// =====================================================

export async function createConversation() {

  console.log(
    "[OPENAI] Creating conversation..."
  );


  const conversationId =
    await startOpenAIConversationsSession();


  console.log(
    "[OPENAI] Conversation:",
    conversationId
  );


  return conversationId;
}


// =====================================================
// RUN AGENT
// =====================================================

export async function runCricketAgent({

  message,

  conversationId,

  userId

}) {

  console.log(
    "[AGENT] Message:",
    message
  );


  const session =
    new OpenAIConversationsSession({

      conversationId

    });


  const result =
    await run(

      cricketAgent,

      message,

      {

        session,

        context: {

          userId

        },

        maxTurns: 10

      }

    );


  console.log(
    "[AGENT] Completed"
  );


  return result.finalOutput;
}


// =====================================================
// CLOSE MCP
// =====================================================

export async function closeMcp() {

  try {

    await cricketMcp.close();

    console.log(
      "[MCP] Connection closed"
    );

  } catch (error) {

    console.error(
      "[MCP] Close error:",
      error
    );

  }
}
