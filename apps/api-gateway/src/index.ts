import { buildServer } from "./server.js";

const port = Number.parseInt(process.env.API_GATEWAY_PORT ?? "4000", 10);
const host = process.env.API_GATEWAY_HOST ?? "0.0.0.0";
const server = buildServer();

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}

