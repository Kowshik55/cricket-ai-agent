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
  "gemini-2.5-flash";

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

const conversations =
  new Map();

/*
--------------------------------------------------
CONNECT TO CRICBUZZ MCP
--------------------------------------------------
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
--------------------------------------------------
LOCAL MYSQL TOOLS
--------------------------------------------------
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

  if (name === "save_note") {
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

  if (name === "get_notes") {
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
--------------------------------------------------
MCP TOOL EXECUTION
--------------------------------------------------
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

  const result =
    await mcpClient.callTool({
      name,
      arguments:
        args || {}
    });

  return result;
}

/*
--------------------------------------------------
CONVERT MCP RESULT TO TEXT
--------------------------------------------------
*/

function mcpResultToText(
  result
) {
  if (!result) {
    return "";
  }

  if (
    Array.isArray(
      result.content
    )
  ) {
    return result.content
      .map(item => {
        if (
          item.type === "text"
        ) {
          return item.text;
        }

        return JSON.stringify(
          item
        );
      })
      .join("\n");
  }

  return JSON.stringify(
    result
  );
}

/*
--------------------------------------------------
BUILD GEMINI TOOLS
--------------------------------------------------
*/

function buildGeminiTools() {
  const tools = [];

  /*
  MySQL save_note
  */

  tools.push({
    functionDeclarations: [
      {
        name: "save_note",
        description:
          "Save a note for the current user in MySQL. Use this when the user asks you to remember or save information.",
        parameters: {
          type: "OBJECT",
          properties: {
            note: {
              type: "STRING",
              description:
                "The information that should be saved."
            }
          },
          required: [
            "note"
          ]
        }
      },

      /*
      MySQL get_notes
      */

      {
        name: "get_notes",
        description:
          "Retrieve notes previously saved by the current user from MySQL.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      }
    ]
  });

  /*
  MCP tools
  */

  if (
    availableMcpTools.length > 0
  ) {
    tools.push({
      functionDeclarations:
        availableMcpTools.map(
          tool => ({
            name: tool.name,
            description:
              tool.description ||
              `MCP tool: ${tool.name}`,
            parameters:
              convertJsonSchemaToGemini(
                tool.inputSchema
              )
          })
        )
    });
  }

  return tools;
}

/*
--------------------------------------------------
JSON SCHEMA → GEMINI SCHEMA
--------------------------------------------------
*/

function convertJsonSchemaToGemini(
  schema
) {
  if (!schema) {
    return {
      type: "OBJECT",
      properties: {}
    };
  }

  const result = {
    type: "OBJECT",
    properties: {},
    required:
      schema.required || []
  };

  const properties =
    schema.properties || {};

  for (
    const [
      key,
      value
    ] of Object.entries(
      properties
    )
  ) {
    result.properties[key] =
      convertProperty(value);
  }

  return result;
}

function convertProperty(
  property
) {
  if (!property) {
    return {
      type: "STRING"
    };
  }

  if (
    property.type === "string"
  ) {
    return {
      type: "STRING",
      description:
        property.description
    };
  }

  if (
    property.type === "number"
  ) {
    return {
      type: "NUMBER",
      description:
        property.description
    };
  }

  if (
    property.type === "integer"
  ) {
    return {
      type: "INTEGER",
      description:
        property.description
    };
  }

  if (
    property.type === "boolean"
  ) {
    return {
      type: "BOOLEAN",
      description:
        property.description
    };
  }

  if (
    property.type === "array"
  ) {
    return {
      type: "ARRAY",
      items:
        convertProperty(
          property.items
        ),
      description:
        property.description
    };
  }

  if (
    property.type === "object"
  ) {
    return {
      type: "OBJECT",
      properties:
        Object.fromEntries(
          Object.entries(
            property.properties || {}
          ).map(
            ([key, value]) => [
              key,
              convertProperty(value)
            ]
          )
        ),
      required:
        property.required || [],
      description:
        property.description
    };
  }

  return {
    type: "STRING",
    description:
      property.description
  };
}

/*
--------------------------------------------------
CREATE CONVERSATION
--------------------------------------------------
*/

export async function createConversation() {
  const conversationId =
    crypto.randomUUID();

  conversations.set(
    conversationId,
    []
  );

  console.log(
    "[GEMINI] Created conversation:",
    conversationId
  );

  return conversationId;
}

/*
--------------------------------------------------
RUN AGENT
--------------------------------------------------
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

  if (
    !conversations.has(
      conversationId
    )
  ) {
    conversations.set(
      conversationId,
      []
    );
  }

  const history =
    conversations.get(
      conversationId
    );

  history.push({
    role: "user",
    parts: [
      {
        text: message
      }
    ]
  });

  const tools =
    buildGeminiTools();

  const systemInstruction = `
You are a helpful cricket AI agent.

Your main job is to answer cricket-related
questions accurately and naturally.

You have access to:

1. Cricbuzz MCP tools

Use the Cricbuzz MCP tools when the user
asks about current cricket information,
live matches, live scores, commentary,
or other information that requires
current Cricbuzz data.

2. MySQL tools

Use save_note when the user asks you
to remember or save something.

Use get_notes when the user asks what
you previously saved or remembered.

IMPORTANT RULES:

- Never invent a live cricket score.
- Use the Cricbuzz MCP tools for current
  cricket information.
- Use MySQL tools for user notes.
- Do not pretend that you called a tool
  if you did not.
- If a tool fails, clearly explain that
  the requested information could not
  be retrieved.
- Answer naturally.
- Do not expose internal implementation
  details unless the user asks.
`;

  for (
    let turn = 0;
    turn < 10;
    turn++
  ) {
    console.log(
      `[AGENT] Gemini turn ${turn + 1}`
    );

    const response =
      await ai.models.generateContent({
        model:
          GEMINI_MODEL,

        contents:
          history,

        config: {
          systemInstruction,

          tools,

          temperature: 0.2
        }
      });

    const candidate =
      response.candidates?.[0];

    const parts =
      candidate?.content?.parts || [];

    let hasFunctionCall =
      false;

    let textOutput = "";

    for (
      const part of parts
    ) {
      if (part.text) {
        textOutput +=
          part.text;
      }

      if (
        part.functionCall
      ) {
        hasFunctionCall = true;

        const functionCall =
          part.functionCall;

        const toolName =
          functionCall.name;

        const toolArgs =
          functionCall.args || {};

        console.log(
          "[AGENT] Tool requested:",
          toolName,
          toolArgs
        );

        let toolResult;

        try {
          if (
            toolName ===
              "save_note" ||
            toolName ===
              "get_notes"
          ) {
            toolResult =
              await executeLocalTool(
                toolName,
                toolArgs,
                userId
              );
          } else {
            toolResult =
              await executeMcpTool(
                toolName,
                toolArgs
              );

            toolResult =
              mcpResultToText(
                toolResult
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

        history.push({
          role: "model",
          parts: [
            {
              functionCall
            }
          ]
        });

        history.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name:
                  toolName,
                response: {
                  result:
                    toolResult
                }
              }
            }
          ]
        });
      }
    }

    if (
      !hasFunctionCall
    ) {
      const finalAnswer =
        textOutput.trim();

      history.push({
        role: "model",
        parts: [
          {
            text:
              finalAnswer
          }
        ]
      });

      console.log(
        "[AGENT] Completed"
      );

      return finalAnswer;
    }
  }

  throw new Error(
    "Agent exceeded maximum tool turns."
  );
}

/*
--------------------------------------------------
CLOSE MCP
--------------------------------------------------
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
