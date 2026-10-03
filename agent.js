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

/*
==================================================
ENVIRONMENT VARIABLES
==================================================
*/

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL;


/*
==================================================
VALIDATE ENVIRONMENT
==================================================
*/

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


/*
==================================================
GEMINI CLIENT
==================================================
*/

const ai =
  new GoogleGenAI({
    apiKey: GEMINI_API_KEY
  });


/*
==================================================
MCP CLIENT
==================================================
*/

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
MYSQL LOCAL TOOLS
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

  /*
  -----------------------------------------------
  SAVE NOTE
  -----------------------------------------------
  */

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


  /*
  -----------------------------------------------
  GET NOTES
  -----------------------------------------------
  */

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


  /*
  -----------------------------------------------
  UNKNOWN TOOL
  -----------------------------------------------
  */

  throw new Error(
    `Unknown local tool: ${name}`
  );
}


/*
==================================================
EXECUTE MCP TOOL
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
CONVERT MCP JSON SCHEMA TO GEMINI SCHEMA
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
      convertProperty(
        value
      );
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


/*
==================================================
CONVERT INDIVIDUAL PROPERTY
==================================================
*/

function convertProperty(
  property
) {
  if (!property) {
    return {
      type: "string"
    };
  }


  /*
  STRING
  */

  if (
    property.type ===
    "string"
  ) {
    const result = {
      type: "string"
    };

    if (
      property.description
    ) {
      result.description =
        property.description;
    }

    return result;
  }


  /*
  NUMBER
  */

  if (
    property.type ===
    "number"
  ) {
    const result = {
      type: "number"
    };

    if (
      property.description
    ) {
      result.description =
        property.description;
    }

    return result;
  }


  /*
  INTEGER
  */

  if (
    property.type ===
    "integer"
  ) {
    const result = {
      type: "integer"
    };

    if (
      property.description
    ) {
      result.description =
        property.description;
    }

    return result;
  }


  /*
  BOOLEAN
  */

  if (
    property.type ===
    "boolean"
  ) {
    const result = {
      type: "boolean"
    };

    if (
      property.description
    ) {
      result.description =
        property.description;
    }

    return result;
  }


  /*
  ARRAY
  */

  if (
    property.type ===
    "array"
  ) {
    const result = {
      type: "array",

      items:
        convertProperty(
          property.items
        )
    };

    if (
      property.description
    ) {
      result.description =
        property.description;
    }

    return result;
  }


  /*
  OBJECT
  */

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

    const result = {
      type: "object",

      properties:
        converted
    };

    if (
      Array.isArray(
        property.required
      ) &&
      property.required.length > 0
    ) {
      result.required =
        property.required;
    }

    if (
      property.description
    ) {
      result.description =
        property.description;
    }

    return result;
  }


  /*
  DEFAULT
  */

  return {
    type: "string"
  };
}


/*
==================================================
BUILD GEMINI TOOLS
==================================================
*/

function buildGeminiTools() {
  const tools = [];


  /*
  ================================================
  MYSQL: SAVE NOTE
  ================================================
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


  /*
  ================================================
  MYSQL: GET NOTES
  ================================================
  */

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
  ================================================
  CRICBUZZ MCP TOOLS
  ================================================
  */

  for (
    const mcpTool
    of availableMcpTools
  ) {
    tools.push({
      type: "function",

      name:
        mcpTool.name,

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
CREATE APPLICATION CONVERSATION
==================================================
*/

export async function createConversation() {
  /*
   * This is our application's
   * conversation ID.
   *
   * Gemini creates the actual
   * interaction when the first
   * message is sent.
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
RUN CRICKET AI AGENT
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
  ================================================
  GEMINI INTERACTION MEMORY
  ================================================
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


  /*
  ================================================
  BUILD TOOLS
  ================================================
  */

  const tools =
    buildGeminiTools();


  /*
  ================================================
  SYSTEM INSTRUCTION
  ================================================
  */

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
  ================================================
  CREATE FIRST GEMINI INTERACTION
  ================================================
  */

  let interaction;


  if (
    !previousInteractionId
  ) {
    console.log(
      "[AGENT] Creating new Gemini interaction"
    );

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
     * CONTINUE EXISTING
     * GEMINI INTERACTION
     */

    console.log(
      "[AGENT] Continuing Gemini interaction:",
      previousInteractionId
    );

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
  ================================================
  TOOL-CALL LOOP
  ================================================
  */

  while (true) {
    let functionCall =
      null;


    /*
     * Find Gemini function call.
     */

    for (
      const step
      of interaction.steps || []
    ) {
      if (
        step.type ===
        "function_call"
      ) {
        functionCall =
          step;

        break;
      }
    }


    /*
     ==============================================
     NO TOOL CALL
     ==============================================
     */

    if (!functionCall) {
      const answer =
        interaction.output_text ||
        "";


      /*
       * Save the Gemini interaction ID
       * for the next user message.
       */

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


    /*
     ==============================================
     GEMINI REQUESTED A TOOL
     ==============================================
     */

    console.log(
      "[AGENT] Tool requested:",
      functionCall.name
    );

    console.log(
      "[AGENT] Tool arguments:",
      functionCall.arguments
    );

    console.log(
      "[AGENT] Function call ID:",
      functionCall.id
    );


    /*
     ==============================================
     EXECUTE TOOL
     ==============================================
     */

    let toolResult;


    try {
      /*
       * MYSQL TOOL
       */

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
      }

      /*
       * MCP TOOL
       */

      else {
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
     ==============================================
     LOG TOOL RESULT
     ==============================================
     */

    console.log(
      "[AGENT] Tool result:",
      toolResult
    );


    /*
     ==============================================
     SEND FUNCTION RESULT BACK TO GEMINI
     ==============================================
     
     IMPORTANT:
     
     Gemini Interactions API expects:

       type: "function_result"
       name: functionCall.name
       call_id: functionCall.id

     The previous version incorrectly used:

       functionCall.call_id

     and did not provide:

       name

     ==============================================
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

            /*
             * REQUIRED
             */

            name:
              functionCall.name,

            /*
             * REQUIRED
             *
             * Gemini's function_call step
             * uses "id".
             */

            call_id:
              functionCall.id,

            /*
             * Return the tool result
             * as text content.
             */

            result: [
              {
                type:
                  "text",

                text:
                  typeof toolResult ===
                  "string"
                    ? toolResult
                    : JSON.stringify(
                        toolResult
                      )
              }
            ]
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
CLOSE MCP CONNECTION
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
