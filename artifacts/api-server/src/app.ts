import express, { type Express } from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Keep oversized uploads and malformed JSON errors readable to API clients.
app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const bodyError = error as { type?: string };
    if (bodyError.type === "entity.too.large") {
      res.status(413).json({
        error: "Request exceeds the 5 MB limit. Choose an image up to 3 MB.",
      });
      return;
    }

    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Request body must be valid JSON." });
      return;
    }

    next(error);
  },
);

export default app;
