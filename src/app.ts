import fastify, { FastifyInstance } from "fastify";
import { registerSwagger } from "./config/swagger";
import { fastifyLogger } from "./config/logger";
import authRoutes from "./routes/auth";
import { initializeFirebaseAdmin } from "./services/firebase";
import { initializeSmtp } from "./services/emailService";

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: fastifyLogger,
  });

  initializeFirebaseAdmin();
  setTimeout(() => {
    initializeSmtp();
  }, 1000);

  registerSwagger(app);

  app.register(authRoutes, { prefix: "/auth" });

  return app;
}
