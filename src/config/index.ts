import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  HOOKFREIGHT_PORT: z.coerce.number().default(3030),
  HOOKFREIGHT_HOST: z.string().default("0.0.0.0"),
  HOOKFREIGHT_BASE_URL: z.string().default("http://localhost:3030"),
  HOOKFREIGHT_MONGO_URI: z.string().default("mongodb://localhost:27017/hookfreight"),
  HOOKFREIGHT_MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576),  
  HOOKFREIGHT_MONGO_DB_NAME: z.string().default("hookfreight"),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
