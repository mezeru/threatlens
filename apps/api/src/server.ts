import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

dotenv.config({
  path: resolve(fileURLToPath(new URL("../../../.env", import.meta.url)))
});

const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

createApp().listen(port, () => {
  console.log(`ThreatLens API listening on port ${port}`);
});
