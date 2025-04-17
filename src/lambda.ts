import { FastifyInstance } from "fastify";
import awsLambdaFastify from "@fastify/aws-lambda";
import { buildApp } from "./app";
import {
  APIGatewayProxyEvent,
  Context,
  APIGatewayProxyResult,
} from "aws-lambda";

let app: FastifyInstance;
let proxy: any;

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  if (!app) {
    console.log("Lambda cold start: Initializing Fastify app");
    app = buildApp();

    proxy = awsLambdaFastify(app, { decorateRequest: false });

    await app.ready();
    console.log("Fastify app successfully initialized");
  }

  console.log("Event:", JSON.stringify(event));
  return proxy(event, context);
};
