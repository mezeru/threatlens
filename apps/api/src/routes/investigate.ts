import { Router } from "express";
import { z } from "zod";
import {
  InvestigationError,
  investigate
} from "../investigation/agent.js";
import { SYNTHETIC_DATASET_LABEL } from "../investigation/dataset.js";
import type { InvestigationReport } from "../investigation/report.js";

const requestSchema = z
  .object({
    question: z.string().trim().min(1).max(2000)
  })
  .strict();

export type Investigator = (question: string) => Promise<InvestigationReport>;

export function createInvestigationRouter(
  runInvestigation: Investigator = investigate
) {
  const router = Router();

  router.post("/", async (request, response) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a question between 1 and 2000 characters."
        }
      });
      return;
    }

    try {
      const report = await runInvestigation(parsed.data.question);
      response.status(200).json({
        dataSource: SYNTHETIC_DATASET_LABEL,
        report
      });
    } catch (error) {
      if (error instanceof InvestigationError) {
        const status =
          error.code === "INVALID_INPUT"
            ? 400
            : error.code === "PROVIDER_NOT_CONFIGURED"
              ? 503
              : 502;
        response.status(status).json({
          error: {
            code: error.code,
            message: error.message
          }
        });
        return;
      }

      response.status(502).json({
        error: {
          code: "INVESTIGATION_FAILED",
          message: "The investigation could not be completed."
        }
      });
    }
  });

  return router;
}
