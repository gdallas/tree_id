// Sprout progress API — AWS Lambda (Node.js 20+, ESM).
// Wired to an API Gateway HTTP API with a Cognito JWT authorizer.
// Routes:  GET /progress   PUT /progress
// The user's identity (sub) comes from the verified JWT, never the client.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || "SproutProgress";

export const handler = async (event) => {
  const method = event.requestContext?.http?.method;
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!sub) return resp(401, { error: "unauthorized" });

  try {
    if (method === "GET") {
      const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { userId: sub } }));
      return resp(200, r.Item || {});
    }
    if (method === "PUT") {
      const b = JSON.parse(event.body || "{}");
      const item = {
        userId: sub,
        score: int(b.score),
        correct: int(b.correct),
        attempts: int(b.attempts),
        streak: int(b.streak),
        bestStreak: int(b.bestStreak),
        lastCategory: ["trees", "plants", "both"].includes(b.lastCategory) ? b.lastCategory : "both",
        updatedAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return resp(200, item);
    }
    return resp(405, { error: "method not allowed" });
  } catch (e) {
    console.error(e);
    return resp(500, { error: "server error" });
  }
};

const int = (v) => Math.max(0, parseInt(v, 10) || 0);
const resp = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
