import crypto from "node:crypto";

import { GoogleGenAI } from "@google/genai";

import {
  Client,
  StreamableHTTPClientTransport
} from "@modelcontextprotocol/client";

import {
  saveNote,
  getNotes
} from "./db.js";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL;

if (!GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY environment variable is missing."
  );
}

if (!MCP_SERVER_URL) {
  throw new Error(
    "MCP_SERVER_URL environment variable is missing."
  );
}

const ai =
  new GoogleGenAI({
    apiKey: GEMINI_API_KEY
  });

const mcpClient =
  new Client({
    name: "cricket-ai-agent",
    version: "1.0.0"
  });

let mcpTransport = null;

let availableMcpTools = [];

/*
==================================================
MCP CONNECTION
==================================================
*/

export async function connectMcp() {
  console.log(
    "[MCP] Connecting to:",
    MCP_SERVER_URL
  );

  mcpTransport =
    new StreamableHTTPClientTransport(
      new URL(MCP_SERVER_URL)
    );

  await mcpClient.connect(
    mcpTransport
  );

  console.log(
    "[MCP] Cricbuzz MCP connected"
  );

  const result =
    await mcpClient.listTools();

  availableMcpTools =
    result.tools || [];

  console.log(
    "[MCP] Available tools:",
    availableMcpTools.map(
      tool => tool.name
    )
  );
}

/*
==================================================
MYSQL TOOLS
==================================================
*/

async function executeLocalTool(
  name,
  args,
  userId
) {
  console.log(
    "[LOCAL TOOL]",
    name,
    args
  );

  if (
    name === "save_note"
  ) {
    const note =
      args?.note;

    if (
      !note ||
      typeof note !== "string"
    ) {
      throw new Error(
        "save_note requires a note."
      );
    }

    await saveNote(
      userId,
      note
    );

    return {
      success: true,
      message:
        `Saved successfully: ${note}`
    };
  }

  if (
    name === "get_notes"
  ) {
    const notes =
      await getNotes(
        userId
      );

    return {
      success: true,
      notes
    };
  }

  throw new Error(
    `Unknown local tool: ${name}`
  );
}

/*
==================================================
MCP TOOL
==================================================
*/

async function executeMcpTool(
  name,
  args
) {
  console.log(
    "[MCP TOOL]",
    name,
    args
  );

  return await mcpClient.callTool({
    name,
    arguments:
      args || {}
  });
}

/*
==================================================
CONVERT JSON SCHEMA
==================================================
*/

function convertJsonSchemaToGemini(
  schema
) {
  if (!schema) {
    return {
      type: "object",
      properties: {}
    };
  }

  const properties =
    schema.properties || {};

  const convertedProperties = {};

  for (
    const [
      key,
      value
    ] of Object.entries(
      properties
    )
  ) {
    convertedProperties[key] =
      convertProperty(value);
  }

  const result = {
    type: "object",
    properties:
      convertedProperties
  };

  if (
    Array.isArray(
      schema.required
    ) &&
    schema.required.length > 0
  ) {
    result.required =
      schema.required;
  }

  return result;
}

function convertProperty(
  property
) {
  if (!property) {
    return {
      type: "string"
    };
  }

  if (
    property.type ===
    "string"
  ) {
    return {
      type: "string",
      description:
        property.description
    };
  }

  if (
    property.type ===
    "number"
  ) {
    return {
      type: "number",
      description:
        property.description
    };
  }

  if (
    property.type ===
    "integer"
  ) {
    return {
      type: "integer",
      description:
        property.description
    };
  }

  if (
    property.type ===
    "boolean"
  ) {
    return {
      type: "boolean",
      description:
        property.description
    };
  }

  if (
    property.type ===
    "array"
  ) {
    return {
      type: "array",
      items:
        convertProperty(
          property.items
        ),
      description:
        property.description
    };
  }

  if (
    property.type ===
    "object"
  ) {
    const properties =
      property.properties ||
      {};

    const converted =
      {};

    for (
      const [
        key,
        value
      ] of Object.entries(
        properties
      )
    ) {
      converted[key] =
        convertProperty(
          value
        );
    }

    return {
      type: "object",
      properties:
        converted,
      required:
        property.required ||
        [],
      description:
        property.description
    };
  }

  return {
    type: "string",
    description:
      property.description
  };
}

/*
==================================================
GEMINI TOOL DEFINITIONS
==================================================
*/

function buildGeminiTools() {
  const tools = [];

  /*
  MYSQL
  */

  tools.push({
    type: "function",
    name: "save_note",
    description:
      "Save a note for the current user in MySQL. Use this when the user asks you to remember or save information.",
    parameters: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description:
            "The information that should be saved."
        }
      },
      required: [
        "note"
      ]
    }
  });

  tools.push({
    type: "function",
    name: "get_notes",
    description:
      "Retrieve notes previously saved by the current user from MySQL.",
    parameters: {
      type: "object",
      properties: {}
    }
  });

  /*
  CRICBUZZ MCP
  */

  for (
    const mcpTool
    of availableMcpTools
  ) {
    tools.push({
      type: "function",
      name: mcpTool.name,
      description:
        mcpTool.description ||
        `MCP tool: ${mcpTool.name}`,
      parameters:
        convertJsonSchemaToGemini(
          mcpTool.inputSchema
        )
    });
  }

  return tools;
}

/*
==================================================
CREATE CONVERSATION
==================================================
*/

export async function createConversation() {
  /*
   * The application uses its own ID.
   * Gemini Interactions are created
   * when the first message is sent.
   */

  const conversationId =
    crypto.randomUUID();

  console.log(
    "[GEMINI] Application conversation:",
    conversationId
  );

  return conversationId;
}

/*
==================================================
RUN AGENT
==================================================
*/

export async function runCricketAgent({
  message,
  conversationId,
  userId
}) {
  console.log(
    "[AGENT] Message:",
    message
  );

  /*
   * Store the Gemini interaction ID
   * on the application object.
   *
   * Since the Node process normally
   * handles the session, this map keeps
   * the Gemini interaction associated
   * with the application's session.
   */

  if (
    !globalThis.geminiInteractions
  ) {
    globalThis.geminiInteractions =
      new Map();
  }

  const previousInteractionId =
    globalThis.geminiInteractions.get(
      conversationId
    );

  const tools =
    buildGeminiTools();

  const systemInstruction = `
You are a helpful cricket AI agent.

Your main job is to answer cricket-related
questions accurately and naturally.

You have access to:

1. Cricbuzz MCP tools

Use Cricbuzz MCP tools when the user asks
about current cricket information, live
matches, live scores, commentary, or other
information that requires current data.

2. MySQL tools

Use save_note when the user asks you to
remember or save something.

Use get_notes when the user asks what you
previously saved or remembered.

IMPORTANT RULES:

- Never invent a live cricket score.
- Always use Cricbuzz MCP for current
  cricket information.
- Use MySQL for saved user notes.
- Do not pretend you used a tool when
  you did not.
- If a tool fails, clearly explain that
  the requested information could not
  be retrieved.
- Answer naturally and clearly.
`;

  /*
   * FIRST INTERACTION
   */

  let interaction;

  if (
    !previousInteractionId
  ) {
    interaction =
      await ai.interactions.create({
        model:
          GEMINI_MODEL,

        input:
          message,

        tools,

        system_instruction:
          systemInstruction,

        generation_config: {
          thinking_level:
            "low"
        },

        store: true
      });
  } else {
    /*
     * CONTINUE EXISTING GEMINI
     * CONVERSATION
     */

    interaction =
      await ai.interactions.create({
        model:
          GEMINI_MODEL,

        input:
          message,

        previous_interaction_id:
          previousInteractionId,

        tools,

        system_instruction:
          systemInstruction,

        generation_config: {
          thinking_level:
            "low"
        },

        store: true
      });
  }

  /*
   * IMPORTANT:
   *
   * We do NOT manually copy Gemini
   * functionCall parts into history.
   *
   * Gemini Interactions API keeps the
   * reasoning/signature state.
   */

  while (true) {
    let functionCall =
      null;

    for (
      const step
      of interaction.steps || []
    ) {
      if (
        step.type ===
        "function_call"
      ) {
        functionCall = step;

        break;
      }
    }

    /*
     * No tool call means we have
     * the final answer.
     */

    if (!functionCall) {
      const answer =
        interaction.output_text ||
        "";

      globalThis
        .geminiInteractions
        .set(
          conversationId,
          interaction.id
        );

      console.log(
        "[AGENT] Completed"
      );

      return answer;
    }

    console.log(
      "[AGENT] Tool requested:",
      functionCall.name,
      functionCall.arguments
    );

    let toolResult;

    try {
      if (
        functionCall.name ===
          "save_note" ||
        functionCall.name ===
          "get_notes"
      ) {
        toolResult =
          await executeLocalTool(
            functionCall.name,
            functionCall.arguments ||
              {},
            userId
          );
      } else {
        toolResult =
          await executeMcpTool(
            functionCall.name,
            functionCall.arguments ||
              {}
          );
      }
    } catch (error) {
      console.error(
        "[TOOL ERROR]",
        error
      );

      toolResult = {
        error:
          error instanceof Error
            ? error.message
            : String(error)
      };
    }

    /*
     * Send the function result back
     * through the Interactions API.
     */

    interaction =
      await ai.interactions.create({
        model:
          GEMINI_MODEL,

        previous_interaction_id:
          interaction.id,

        input: [
          {
            type:
              "function_result",

            call_id:
              functionCall.call_id,

            result:
              toolResult
          }
        ],

        tools,

        system_instruction:
          systemInstruction,

        generation_config: {
          thinking_level:
            "low"
        },

        store: true
      });
  }
}

/*
==================================================
CLOSE MCP
==================================================
*/

export async function closeMcp() {
  try {
    await mcpClient.close();

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
