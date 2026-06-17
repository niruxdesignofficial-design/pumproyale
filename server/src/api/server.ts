import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerAuthRoutes } from "./auth";
import { registerGameRoutes } from "./game";

/**
 * Builds the REST API: auth (sign-in), leaderboard, and reward claims. Runs on
 * its own port alongside the Colyseus game server.
 */
export async function createApiServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/api/health", async () => ({ ok: true }));
  registerAuthRoutes(app);
  registerGameRoutes(app);

  return app;
}

export async function startApiServer(port: number): Promise<FastifyInstance> {
  const app = await createApiServer();
  await app.listen({ port, host: "0.0.0.0" });
  return app;
}
