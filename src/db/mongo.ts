import mongoose from "mongoose";
import { config } from "../config";

export async function connectMongo(): Promise<void> {
  await mongoose.connect(config.HOOKFREIGHT_MONGO_URI, {
    autoIndex: true,
    dbName: config.HOOKFREIGHT_MONGO_DB_NAME
  });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}


