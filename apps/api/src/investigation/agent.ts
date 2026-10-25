import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from "openai/resources/chat/completions";
import { z } from "zod";
import { syntheticEvents } from "./dataset.js";
import {
  authSearchInputSchema,
  getResourceAccessEvents,
  getUserTimeline,
  searchAuthEvents,
  userQueryInputSchema
} from "./tools.js";
import {
  InvestigationReportSchema,
  type InvestigationReport
} from "./report.js";

export const MAX_TOOL_CALLS = 6;
export const MAX_MODEL_ITERATIONS = 4;

const questionSchema = z.string().trim().min(1).max(2000);

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ModelResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface InvestigationModel {
  complete(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[]
  ): Promise<ModelResponse>;
}

export class InvestigationError extends Error {
  constructor(
    public readonly code:
      | "PROVIDER_NOT_CONFIGURED"
      | "MODEL_REQUEST_FAILED"
      | "MALFORMED_MODEL_OUTPUT"
      | "INVALID_INPUT"
      | "INVESTIGATION_LIMIT_REACHED",
    message: string
  ) {
    super(message);
    this.name = "InvestigationError";
  }
}

const toolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchAuthEvents",
      description:
        "Search synthetic authentication events by user ID or source IP.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "Synthetic user identifier." },
          sourceIp: { type: "string", description: "Source IPv4 or IPv6 address." }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getUserTimeline",
      description:
        "Retrieve all synthetic events for a user in chronological order.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "Synthetic user identifier." }
        },
        required: ["userId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getResourceAccessEvents",
      description:
        "Find sensitive-resource access events for a synthetic user.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "Synthetic user identifier." }
        },
        required: ["userId"],
        additionalProperties: false
      }
    }
  }
];

function parseToolArguments(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function executeTool(name: string, rawArguments: string): string {
  const input = parseToolArguments(rawArguments);
  if (input === null) {
    return JSON.stringify({ error: "Tool arguments must be valid JSON." });
  }

  switch (name) {
    case "searchAuthEvents": {
      const parsed = authSearchInputSchema.safeParse(input);
      return parsed.success
        ? JSON.stringify(searchAuthEvents(parsed.data))
        : JSON.stringify({ error: "Invalid authentication search arguments." });
    }
    case "getUserTimeline": {
      const parsed = userQueryInputSchema.safeParse(input);
      return parsed.success
        ? JSON.stringify(getUserTimeline(parsed.data))
        : JSON.stringify({ error: "Invalid user timeline arguments." });
    }
    case "getResourceAccessEvents": {
      const parsed = userQueryInputSchema.safeParse(input);
      return parsed.success
        ? JSON.stringify(getResourceAccessEvents(parsed.data))
        : JSON.stringify({ error: "Invalid resource search arguments." });
    }
    default:
      return JSON.stringify({ error: "Unknown investigation tool." });
  }
}

function parseFinalReport(content: string | null): InvestigationReport {
  if (!content) {
    throw new InvestigationError(
      "MALFORMED_MODEL_OUTPUT",
      "The model did not return an investigation report."
    );
  }

  let output: unknown;
  try {
    output = JSON.parse(content) as unknown;
  } catch {
    throw new InvestigationError(
      "MALFORMED_MODEL_OUTPUT",
      "The model returned invalid JSON."
    );
  }

  const parsed = InvestigationReportSchema.safeParse(output);
  if (!parsed.success) {
    throw new InvestigationError(
      "MALFORMED_MODEL_OUTPUT",
      "The model report did not match the required investigation format."
    );
  }
  return parsed.data;
}

function createOpenAIModel(): InvestigationModel {
  if (!process.env.OPENAI_API_KEY) {
    throw new InvestigationError(
      "PROVIDER_NOT_CONFIGURED",
      "Set OPENAI_API_KEY in the environment before investigating."
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  return {
    async complete(messages, tools) {
      const completion = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto",
        response_format: { type: "json_object" }
      });
      const message = completion.choices[0]?.message;
      return {
        content: message?.content ?? null,
        toolCalls: (message?.tool_calls ?? []).flatMap((call) =>
          call.type === "function"
            ? [
                {
                  id: call.id,
                  name: call.function.name,
                  arguments: call.function.arguments
                }
              ]
            : []
        )
      };
    }
  };
}

export async function investigate(
  question: string,
  model: InvestigationModel = createOpenAIModel()
): Promise<InvestigationReport> {
  const parsedQuestion = questionSchema.safeParse(question);
  if (!parsedQuestion.success) {
    throw new InvestigationError(
      "INVALID_INPUT",
      "The investigation question must be between 1 and 2000 characters."
    );
  }

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        `You are ThreatLens, an investigation assistant. Analyze only the ` +
        `${syntheticEvents.length} synthetic security events available through ` +
        `the provided read-only tools. Data is synthetic, not live telemetry. ` +
        `Use tools to gather evidence before reporting. Return only a JSON ` +
        `object with summary, severity (low|medium|high|critical), evidence ` +
        `([{eventId,relevance}]), alternativeExplanations (strings), confidence ` +
        `(0..1), and recommendedNextSteps (strings). Do not claim containment ` +
        `or execute actions.`
    },
    { role: "user", content: parsedQuestion.data }
  ];
  let toolCallCount = 0;

  for (let iteration = 0; iteration < MAX_MODEL_ITERATIONS; iteration += 1) {
    let response: ModelResponse;
    try {
      response = await model.complete(messages, toolDefinitions);
    } catch {
      throw new InvestigationError(
        "MODEL_REQUEST_FAILED",
        "The language model request failed."
      );
    }

    if (response.toolCalls.length === 0) {
      return parseFinalReport(response.content);
    }

    const assistantMessage: ChatCompletionMessageParam = {
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments }
      }))
    };
    messages.push(assistantMessage);

    for (const call of response.toolCalls) {
      if (toolCallCount >= MAX_TOOL_CALLS) {
        throw new InvestigationError(
          "INVESTIGATION_LIMIT_REACHED",
          "The investigation exceeded its tool-call limit."
        );
      }
      toolCallCount += 1;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: executeTool(call.name, call.arguments)
      });
    }
  }

  throw new InvestigationError(
    "INVESTIGATION_LIMIT_REACHED",
    "The investigation exceeded its model-iteration limit."
  );
}
