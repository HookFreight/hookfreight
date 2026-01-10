import { createApp } from "./app";
import { config } from "./config";
import { connectMongo } from "./db/mongo";

async function main(): Promise<void> {
  await connectMongo();

  const app = createApp();

  app.listen(config.HOOKFREIGHT_PORT, config.HOOKFREIGHT_HOST, () => {
    console.log(
      `HookFreight listening on http://${config.HOOKFREIGHT_HOST}:${config.HOOKFREIGHT_PORT} (base: ${config.HOOKFREIGHT_BASE_URL})`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
