// Lambda handler for API Gateway HTTP API (v2 payload).
import { handle } from "hono/aws-lambda";
import { FAMILY_TZ } from "@popcorn/shared";
import app from "./app.js";

// Lambda runs in UTC and reserves the TZ env var, so set it here: todayKey()
// and other server-side "today" defaults should follow the family's local day.
process.env.TZ = process.env.FAMILY_TZ || FAMILY_TZ;

export const handler = handle(app);
