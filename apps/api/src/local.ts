// Local dev server for the API. Uses a real (or local) DynamoDB depending on
// env. For a no-AWS dev experience, run dynamodb-local on :8000 and set
// DDB_LOCAL=1.
import { serve } from "@hono/node-server";
import app from "./app.js";

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Popcorn API listening on http://localhost:${info.port}`);
});
