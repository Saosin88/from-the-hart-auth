import { buildApp } from "./app";
import { config } from "./config";

const app = buildApp();

const start = async () => {
  try {
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
    app.log.info(`NODE_ENV: ${config.env}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
