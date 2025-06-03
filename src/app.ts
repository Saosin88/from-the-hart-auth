import fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { registerSwagger } from "./config/swagger";
import { fastifyLogger } from "./config/logger";
import authRoutes from "./routes/auth";
import { initializeFirebaseAdmin } from "./services/firebase";
import { initializeSmtp } from "./services/emailService";

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: fastifyLogger,
  });

  app.register(cookie);

  initializeFirebaseAdmin();

  if (process.env.NODE_ENV !== "test") {
    setTimeout(() => {
      initializeSmtp();
    }, 1000);
  }

  registerSwagger(app);

  app.register(authRoutes, { prefix: "/auth" });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      reply.status(400).send({
        error: {
          message: error.message || "Validation error",
        },
      });
    } else {
      reply.status(error.statusCode || 500).send({
        error: {
          message: error.message || "Internal server error",
        },
      });
    }
  });

  return app;
}
