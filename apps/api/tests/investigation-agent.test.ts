import { describe, expect, it, vi } from "vitest";
import {
  MAX_MODEL_ITERATIONS,
  MAX_TOOL_CALLS,
  InvestigationError,
  investigate,
  type InvestigationModel,
  type ModelResponse
} from "../src/investigation/agent.js";

const validReport = {
  summary: "Repeated failures preceded a successful login and payroll report access.",
  severity: "high",
  evidence: [
    { eventId: "EVT-1001", relevance: "First failed login." },
    { eventId: "EVT-1004", relevance: "Login succeeded from the same source IP." },
    { eventId: "EVT-1005", relevance: "Sensitive report was accessed shortly afterward." }
  ],
  alternativeExplanations: ["The user may have mistyped their password."],
  confidence: 0.86,
  recommendedNextSteps: ["Verify the login and report access with the account owner."]
};

function modelReturning(...responses: ModelResponse[]): InvestigationModel {
  const complete = vi.fn(async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error("Unexpected model iteration.");
    }
    return response;
  });
  return { complete };
}

describe("investigation agent", () => {
  it("uses tool results in a later iteration and validates its final report", async () => {
    const model = modelReturning(
      {
        content: null,
        toolCalls: [
          {
            id: "call-auth",
            name: "searchAuthEvents",
            arguments: JSON.stringify({ userId: "usr-alex" })
          }
        ]
      },
      {
        content: null,
        toolCalls: [
          {
            id: "call-resource",
            name: "getResourceAccessEvents",
            arguments: JSON.stringify({ userId: "usr-alex" })
          }
        ]
      },
      { content: JSON.stringify(validReport), toolCalls: [] }
    );

    await expect(
      investigate("Investigate usr-alex.", model)
    ).resolves.toEqual(validReport);
    expect(model.complete).toHaveBeenCalledTimes(3);
    expect(model.complete.mock.calls[1]?.[0]).toContainEqual(
      expect.objectContaining({
        role: "tool",
        tool_call_id: "call-auth",
        content: expect.stringContaining("EVT-1004")
      })
    );
    expect(model.complete.mock.calls[2]?.[0]).toContainEqual(
      expect.objectContaining({
        role: "tool",
        tool_call_id: "call-resource",
        content: expect.stringContaining("EVT-1005")
      })
    );
  });

  it("rejects fabricated event IDs in a model report", async () => {
    const model = modelReturning({
      content: JSON.stringify({
        ...validReport,
        evidence: [{ eventId: "REAL-EVENT-1", relevance: "Fabricated." }]
      }),
      toolCalls: []
    });

    await expect(investigate("Investigate usr-alex.", model)).rejects.toMatchObject({
      code: "MALFORMED_MODEL_OUTPUT"
    });
  });

  it("rejects an immediate report before any evidence is retrieved", async () => {
    const model = modelReturning({
      content: JSON.stringify(validReport),
      toolCalls: []
    });

    await expect(investigate("Investigate usr-alex.", model)).rejects.toMatchObject({
      code: "MALFORMED_MODEL_OUTPUT",
      message: "The model must successfully gather evidence before returning a report."
    });
    expect(model.complete).toHaveBeenCalledTimes(1);
  });

  it("rejects known event IDs that were not retrieved in this investigation", async () => {
    const model = modelReturning(
      {
        content: null,
        toolCalls: [
          {
            id: "call-jordan",
            name: "getUserTimeline",
            arguments: JSON.stringify({ userId: "usr-jordan" })
          }
        ]
      },
      { content: JSON.stringify(validReport), toolCalls: [] }
    );

    await expect(investigate("Investigate usr-jordan.", model)).rejects.toMatchObject({
      code: "MALFORMED_MODEL_OUTPUT"
    });
  });

  it("returns malformed tool arguments to the model as a safe tool error", async () => {
    const model = modelReturning(
      {
        content: null,
        toolCalls: [
          {
            id: "call-invalid",
            name: "getUserTimeline",
            arguments: JSON.stringify({ userId: "" })
          }
        ]
      },
      {
        content: null,
        toolCalls: [
          {
            id: "call-valid",
            name: "getUserTimeline",
            arguments: JSON.stringify({ userId: "usr-alex" })
          }
        ]
      },
      { content: JSON.stringify(validReport), toolCalls: [] }
    );

    await expect(investigate("Investigate usr-alex.", model)).resolves.toEqual(
      validReport
    );
    expect(model.complete.mock.calls[1]?.[0]).toContainEqual(
      expect.objectContaining({
        role: "tool",
        tool_call_id: "call-invalid",
        content: JSON.stringify({
          error: "Invalid user timeline arguments."
        })
      })
    );
    expect(model.complete.mock.calls[2]?.[0]).toContainEqual(
      expect.objectContaining({
        role: "tool",
        tool_call_id: "call-valid",
        content: expect.stringContaining("EVT-1005")
      })
    );
  });

  it("stops after the maximum number of model iterations", async () => {
    const model = modelReturning(
      ...Array.from({ length: MAX_MODEL_ITERATIONS }, (_, index) => ({
        content: null,
        toolCalls: [
          {
            id: `call-${index}`,
            name: "getUserTimeline",
            arguments: JSON.stringify({ userId: "usr-alex" })
          }
        ]
      }))
    );

    await expect(investigate("Investigate usr-alex.", model)).rejects.toMatchObject({
      code: "INVESTIGATION_LIMIT_REACHED"
    });
    expect(model.complete).toHaveBeenCalledTimes(MAX_MODEL_ITERATIONS);
  });

  it("stops when the maximum tool-call count is reached", async () => {
    const model = modelReturning({
      content: null,
      toolCalls: Array.from({ length: MAX_TOOL_CALLS + 1 }, (_, index) => ({
        id: `call-${index}`,
        name: "getUserTimeline",
        arguments: JSON.stringify({ userId: "usr-alex" })
      }))
    });

    await expect(investigate("Investigate usr-alex.", model)).rejects.toMatchObject({
      code: "INVESTIGATION_LIMIT_REACHED"
    });
  });

  it("handles provider failures and malformed final output", async () => {
    const failingModel = {
      complete: vi.fn(async () => {
        throw new Error("provider failed");
      })
    } satisfies InvestigationModel;
    const malformedModel = modelReturning({ content: "not-json", toolCalls: [] });

    await expect(investigate("Investigate usr-alex.", failingModel)).rejects.toBeInstanceOf(
      InvestigationError
    );
    await expect(investigate("Investigate usr-alex.", malformedModel)).rejects.toMatchObject({
      code: "MALFORMED_MODEL_OUTPUT"
    });
  });
});
