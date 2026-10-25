import express, {
  type ErrorRequestHandler,
  type RequestHandler
} from "express";
import { createInvestigationRouter, type Investigator } from "./routes/investigate.js";
import { healthRouter } from "./routes/health.js";

const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found."
    }
  });
};

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (isBodyParserError(error, "entity.parse.failed")) {
    response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON."
      }
    });
    return;
  }

  if (isBodyParserError(error, "entity.too.large")) {
    response.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body must not exceed 16 KB."
      }
    });
    return;
  }

  console.error("Unhandled request error:", error);
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred."
    }
  });
};

function isBodyParserError(
  error: unknown,
  expectedType: string
): error is { type: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === expectedType
  );
}

export function createApp(investigator?: Investigator) {
  const app = express();

  app.use(express.json({ limit: "16kb" }));
  app.use("/api/health", healthRouter);
  app.use("/api/investigate", createInvestigationRouter(investigator));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
