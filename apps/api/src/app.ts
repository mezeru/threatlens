import express, {
  type ErrorRequestHandler,
  type RequestHandler
} from "express";
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
  console.error("Unhandled request error:", error);
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred."
    }
  });
};

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use("/api/health", healthRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
