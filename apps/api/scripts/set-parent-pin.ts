#!/usr/bin/env node
/**
 * Set the parent PIN (bcrypt hash in DynamoDB META row).
 * Usage (from repo root): cd apps/api && DDB_LOCAL=1 node --import tsx scripts/set-parent-pin.ts [pin]
 * Default pin is 0000. For AWS: omit DDB_LOCAL, use same TABLE_NAME + region as Lambda.
 */
import bcrypt from "bcryptjs";
import { updatePinHash } from "../src/db.js";

const pin = (process.argv[2] || "0000").replace(/\D/g, "");
if (!/^\d{4,6}$/.test(pin)) {
  console.error("PIN must be 4–6 digits (default: 0000)");
  process.exit(1);
}

const pinHash = await bcrypt.hash(pin, 10);
await updatePinHash(pinHash);
console.log(`Parent PIN updated to ${pin}.`);
