// Sprout progress API — AWS Lambda (Node.js 20+, ESM).
// Wired to an API Gateway HTTP API with a Cognito JWT authorizer.
// Routes:  GET /progress   PUT /progress   GET /tips

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || "SproutProgress";

export const handler = async (event) => {
  const method = event.requestContext?.http?.method;
  const path   = event.requestContext?.http?.path;
  const sub    = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!sub) return resp(401, { error: "unauthorized" });

  try {
    if (path === "/tips" && method === "GET") return await handleTips(event);

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

async function handleTips(event) {
  const q = event.queryStringParameters || {};
  const { genus, family, sci, common } = q;
  if (!sci && !genus) return resp(400, { error: "sci or genus required" });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return resp(503, { error: "tips not configured" });

  const plantDesc = [common, sci && `(${sci})`, genus && `genus ${genus}`, family && `family ${family}`]
    .filter(Boolean).join(" ");

  // Optional raw Wikipedia extract to be condensed into a short summary.
  const wiki = (q.wiki || "").slice(0, 2000).trim();
  const summaryField = wiki
    ? `\n  "summary": "2-3 short sentences summarising the Wikipedia text below into digestible field-guide notes; plain prose, no markdown (max 320 chars)",`
    : "";
  const wikiBlock = wiki ? `\n\nWikipedia text to summarise for the "summary" field:\n"""${wiki}"""` : "";

  const prompt = `You are a botanical field guide expert for the Pacific Northwest. Give field identification tips for: ${plantDesc}.

Reply ONLY with valid JSON — no markdown, no backticks, no explanation:
{${summaryField}
  "leaves": "leaf shape, arrangement, texture and colour (max 150 chars)",
  "cones": "flowers, cones, fruit or seed description (max 150 chars)",
  "bark": "bark or stem — start with 'No true bark;' for herbaceous plants (max 150 chars)",
  "form": "overall growth habit, typical size and silhouette (max 150 chars)",
  "fact": "one surprising or memorable fact (max 180 chars)"
}${wikiBlock}`;

  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) {
    console.error("DeepSeek error", r.status, await r.text());
    return resp(502, { error: "tips unavailable" });
  }

  const d = await r.json();
  const raw = d.choices?.[0]?.message?.content || "{}";
  const cleaned = raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
  try {
    return resp(200, JSON.parse(cleaned));
  } catch {
    console.error("Claude returned invalid JSON:", raw);
    return resp(502, { error: "tips parse error" });
  }
}

const int = (v) => Math.max(0, parseInt(v, 10) || 0);
const resp = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
