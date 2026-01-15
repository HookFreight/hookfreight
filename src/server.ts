import { createApp } from "./app";
import { config } from "./config";
import { connectMongo } from "./db/mongo";
import { deliveriesService } from "./services/deliveries.service";

async function main(): Promise<void> {

  await connectMongo();

  deliveriesService.initialize();

  const app = createApp();

  const server = app.listen(config.HOOKFREIGHT_PORT, config.HOOKFREIGHT_HOST, () => {
    console.log(
      `HookFreight listening on http://${config.HOOKFREIGHT_HOST}:${config.HOOKFREIGHT_PORT} (base: ${config.HOOKFREIGHT_BASE_URL})`
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    server.close(() => {
      console.log("HTTP server closed");
    });

    await deliveriesService.shutdown();

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
