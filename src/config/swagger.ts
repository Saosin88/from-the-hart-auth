import { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import path from "path";
import fs from "fs";

export function registerSwagger(app: FastifyInstance): void {
  app.register(fastifySwagger, {
    swagger: {
      info: {
        title: "From The Hart Auth API",
        version: "1.0.0",
      },
      schemes: ["http", "https"],
      consumes: ["application/json"],
      produces: ["application/json"],
    },
  });

  const logoPath = path.join(
    __dirname,
    "..",
    "public",
    "images",
    "from-the-hart.svg"
  );
  const logoContent = fs.readFileSync(logoPath);

  app.register(fastifySwaggerUi, {
    routePrefix: "/auth/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
    logo: {
      type: "image/svg+xml",
      content: Buffer.from(logoContent),
      href: "https://www.fromthehart.tech",
      target: "_blank",
    },
  });
}
