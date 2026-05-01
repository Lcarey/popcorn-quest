// =============================================================================
// DynamoDB single-table data access for Popcorn's Chore Quest.
// =============================================================================
//
// Key design:
//   PK = FAMILY#<familyId>
//   SK = META                              -> family + pet + auth
//   SK = TEMPLATE#<templateId>             -> recurring task template
//   SK = COMPLETION#<yyyy-mm-dd>#<tplId>   -> single completion tick
//   SK = ADHOC#<yyyy-mm-dd>#<adhocId>      -> ad-hoc task (TTL = next-day midnight)
//
// Items also carry their domain fields directly. We rely on a single
// "begins_with" query per family on a date prefix to fetch a day's data.

import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  AdhocTask,
  Completion,
  FamilyMeta,
  Reward,
  RewardClaim,
  TaskTemplate,
} from "@popcorn/shared";

const region = process.env.AWS_REGION || "us-east-1";
const TABLE = process.env.TABLE_NAME || "PopcornQuest";

// When DDB_LOCAL=1, talk to dynamodb-local on localhost:8000 (or wherever
// DDB_LOCAL_ENDPOINT points). Useful for offline development.
const local = process.env.DDB_LOCAL === "1";
const raw = new DynamoDBClient({
  region,
  ...(local
    ? {
        endpoint: process.env.DDB_LOCAL_ENDPOINT || "http://localhost:8000",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : {}),
});
export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true },
});

// ---------- key helpers --------------------------------------------------

const pk = (familyId: string) => `FAMILY#${familyId}`;
const skMeta = () => "META";
const skTemplate = (id: string) => `TEMPLATE#${id}`;
const skCompletion = (date: string, templateId: string) =>
  `COMPLETION#${date}#${templateId}`;
const skAdhoc = (date: string, id: string) => `ADHOC#${date}#${id}`;
const skReward = (id: string) => `REWARD#${id}`;
const skClaim = (claimedAt: string, id: string) => `CLAIM#${claimedAt}#${id}`;

// ---------- family meta --------------------------------------------------

interface FamilyMetaRecord extends FamilyMeta {
  PK: string;
  SK: string;
  pinHash: string;
  type: "META";
}

export async function getFamily(familyId: string): Promise<FamilyMetaRecord | undefined> {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: pk(familyId), SK: skMeta() },
    }),
  );
  return out.Item as FamilyMetaRecord | undefined;
}

export async function putFamily(meta: FamilyMeta, pinHash: string): Promise<void> {
  const rec: FamilyMetaRecord = {
    ...meta,
    PK: pk(meta.familyId),
    SK: skMeta(),
    pinHash,
    type: "META",
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: rec }));
}

export async function updateFamily(
  familyId: string,
  updates: Partial<FamilyMeta>,
): Promise<FamilyMetaRecord> {
  // Build SET expression for the provided keys (top-level only).
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    sets.push(`#${k} = :${k}`);
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }
  if (sets.length === 0) {
    const existing = await getFamily(familyId);
    if (!existing) throw new Error("Family not found");
    return existing;
  }
  const out = await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: pk(familyId), SK: skMeta() },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return out.Attributes as FamilyMetaRecord;
}

// ---------- templates ----------------------------------------------------

interface TemplateRecord extends TaskTemplate {
  PK: string;
  SK: string;
  type: "TEMPLATE";
}

export async function listTemplates(familyId: string): Promise<TaskTemplate[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk(familyId),
        ":prefix": "TEMPLATE#",
      },
    }),
  );
  return (out.Items as TemplateRecord[] | undefined)?.map(stripKeys) ?? [];
}

export async function putTemplate(familyId: string, t: TaskTemplate): Promise<void> {
  const rec: TemplateRecord = {
    ...t,
    PK: pk(familyId),
    SK: skTemplate(t.id),
    type: "TEMPLATE",
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: rec }));
}

export async function deleteTemplate(familyId: string, templateId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: pk(familyId), SK: skTemplate(templateId) },
    }),
  );
}

// ---------- completions --------------------------------------------------

interface CompletionRecord extends Completion {
  PK: string;
  SK: string;
  type: "COMPLETION";
}

// Fetch all completions for a family in a date range (inclusive). Used for
// "today" view (start=end=today) and "this week" (start=Mon, end=Sun).
export async function listCompletions(
  familyId: string,
  start: string,
  end: string,
): Promise<Completion[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :s AND :e",
      ExpressionAttributeValues: {
        ":pk": pk(familyId),
        ":s": `COMPLETION#${start}`,
        ":e": `COMPLETION#${end}#\uffff`,
      },
    }),
  );
  return (out.Items as CompletionRecord[] | undefined)?.map(stripKeys) ?? [];
}

export async function putCompletion(familyId: string, c: Completion): Promise<void> {
  const rec: CompletionRecord = {
    ...c,
    PK: pk(familyId),
    SK: skCompletion(c.date, c.templateId),
    type: "COMPLETION",
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: rec }));
}

export async function deleteCompletion(
  familyId: string,
  templateId: string,
  date: string,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: pk(familyId), SK: skCompletion(date, templateId) },
    }),
  );
}

export async function getCompletion(
  familyId: string,
  templateId: string,
  date: string,
): Promise<Completion | undefined> {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: pk(familyId), SK: skCompletion(date, templateId) },
    }),
  );
  if (!out.Item) return undefined;
  return stripKeys(out.Item as CompletionRecord);
}

// ---------- ad-hoc tasks -------------------------------------------------

interface AdhocRecord extends AdhocTask {
  PK: string;
  SK: string;
  type: "ADHOC";
  ttl: number; // unix seconds
}

export async function listAdhoc(familyId: string, date: string): Promise<AdhocTask[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk(familyId),
        ":prefix": `ADHOC#${date}#`,
      },
    }),
  );
  return (out.Items as AdhocRecord[] | undefined)?.map(stripKeys) ?? [];
}

export async function getAdhoc(familyId: string, date: string, id: string): Promise<AdhocTask | undefined> {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: pk(familyId), SK: skAdhoc(date, id) },
    }),
  );
  if (!out.Item) return undefined;
  return stripKeys(out.Item as AdhocRecord);
}

export async function putAdhoc(familyId: string, a: AdhocTask): Promise<void> {
  // TTL: midnight at end of `date + 2 days` so we keep history briefly.
  const expiry = new Date(`${a.date}T00:00:00Z`);
  expiry.setUTCDate(expiry.getUTCDate() + 2);
  const ttl = Math.floor(expiry.getTime() / 1000);
  const rec: AdhocRecord = {
    ...a,
    PK: pk(familyId),
    SK: skAdhoc(a.date, a.id),
    type: "ADHOC",
    ttl,
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: rec }));
}

// ---------- rewards ------------------------------------------------------

interface RewardRecord extends Reward {
  PK: string;
  SK: string;
  type: "REWARD";
}

export async function listRewards(familyId: string): Promise<Reward[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk(familyId),
        ":prefix": "REWARD#",
      },
    }),
  );
  return (out.Items as RewardRecord[] | undefined)?.map(stripKeys) ?? [];
}

export async function putReward(familyId: string, r: Reward): Promise<void> {
  const rec: RewardRecord = {
    ...r,
    PK: pk(familyId),
    SK: skReward(r.id),
    type: "REWARD",
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: rec }));
}

export async function getReward(familyId: string, id: string): Promise<Reward | undefined> {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: pk(familyId), SK: skReward(id) },
    }),
  );
  if (!out.Item) return undefined;
  return stripKeys(out.Item as RewardRecord);
}

export async function deleteReward(familyId: string, id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: pk(familyId), SK: skReward(id) },
    }),
  );
}

// ---------- reward claims ------------------------------------------------

interface ClaimRecord extends RewardClaim {
  PK: string;
  SK: string;
  type: "CLAIM";
}

export async function listClaims(familyId: string, status?: string): Promise<RewardClaim[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk(familyId),
        ":prefix": "CLAIM#",
      },
    }),
  );
  const all = (out.Items as ClaimRecord[] | undefined)?.map(stripKeys) ?? [];
  return status ? all.filter((c) => c.status === status) : all;
}

export async function putClaim(familyId: string, c: RewardClaim): Promise<void> {
  const rec: ClaimRecord = {
    ...c,
    PK: pk(familyId),
    SK: skClaim(c.claimedAt, c.id),
    type: "CLAIM",
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: rec }));
}

// ---------- helpers ------------------------------------------------------

function stripKeys<T extends { PK?: string; SK?: string; type?: string }>(rec: T): Omit<T, "PK" | "SK" | "type"> {
  const { PK, SK, type, ...rest } = rec;
  return rest;
}

// Re-export for tests / local dev.
export { TABLE as TABLE_NAME };
export { TransactWriteCommand };
