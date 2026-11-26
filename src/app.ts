import fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { registerSwagger } from "./config/swagger";
import { fastifyLogger } from "./config/logger";
import authRoutes from "./routes/auth";
import { initializeFirebaseAdmin } from "./services/firebase";
import { initializeSmtp } from "./services/emailService";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: fastifyLogger,
  });

  app.withTypeProvider<TypeBoxTypeProvider>();

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
      // One consistent validation envelope. The only querystring-validated
      // route is GET /auth/lookup, so a querystring failure maps to its
      // canonical message; body failures keep Fastify's descriptive message.
      const message =
        error.validationContext === "querystring"
          ? "Invalid email format"
          : error.message || "Validation error";
      reply.status(400).send({ error: { message } });
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
