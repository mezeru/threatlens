import { z } from "zod";
import { syntheticEvents } from "./dataset.js";

export const InvestigationReportSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    severity: z.enum(["low", "medium", "high", "critical"]),
    evidence: z
      .array(
        z
          .object({
            eventId: z.string().trim().min(1),
            relevance: z.string().trim().min(1).max(1000)
          })
          .strict()
      )
      .min(1)
      .max(20),
    alternativeExplanations: z.array(z.string().trim().min(1).max(1000)).max(10),
    confidence: z.number().min(0).max(1),
    recommendedNextSteps: z
      .array(z.string().trim().min(1).max(1000))
      .min(1)
      .max(10)
  })
  .strict()
  .superRefine((report, context) => {
    const knownEventIds = new Set(syntheticEvents.map((event) => event.id));
    report.evidence.forEach((evidence, index) => {
      if (!knownEventIds.has(evidence.eventId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidence", index, "eventId"],
          message: "Evidence must reference a known synthetic event."
        });
      }
    });
  });

export type InvestigationReport = z.infer<typeof InvestigationReportSchema>;
