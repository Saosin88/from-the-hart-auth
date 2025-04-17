import fastify, { FastifyInstance } from "fastify";
import { registerSwagger } from "./config/swagger";
import { fastifyLogger } from "./config/logger";
import authRoutes from "./routes/auth";
import { initializeFirebaseAdmin } from "./services/firebase";

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: fastifyLogger,
  });

  initializeFirebaseAdmin();

  registerSwagger(app);

  app.register(authRoutes, { prefix: "/auth" });

  return app;
}
