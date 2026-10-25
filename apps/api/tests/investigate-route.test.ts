import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { InvestigationReport } from "../src/investigation/report.js";

const report: InvestigationReport = {
  summary: "Synthetic events show a successful login and sensitive access.",
  severity: "high",
  evidence: [{ eventId: "EVT-1005", relevance: "Sensitive payroll report access." }],
  alternativeExplanations: ["The access may have been legitimate."],
  confidence: 0.8,
  recommendedNextSteps: ["Confirm the activity with the user."]
};

describe("POST /api/investigate", () => {
  it("rejects invalid request bodies", async () => {
    const investigator = vi.fn();
    const response = await request(createApp(investigator))
      .post("/api/investigate")
      .send({ question: " " });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(investigator).not.toHaveBeenCalled();
  });

  it("returns a consistent client error for malformed JSON", async () => {
    const response = await request(createApp())
      .post("/api/investigate")
      .set("Content-Type", "application/json")
      .send('{"question":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON."
      }
    });
  });

  it("returns the validated report and identifies its dataset as synthetic", async () => {
    const investigator = vi.fn(async () => report);
    const response = await request(createApp(investigator))
      .post("/api/investigate")
      .send({ question: "Investigate usr-alex." });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dataSource: "SYNTHETIC SECURITY EVENTS",
      report
    });
    expect(investigator).toHaveBeenCalledWith("Investigate usr-alex.");
  });
});
