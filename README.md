# 🌱 Sprout — AWS edition

A Duolingo-style game for learning the trees and plants of the Pacific Northwest (focused on British Columbia), running entirely on AWS.

**Architecture (what each piece does):**

```
  Browser (index.html on CloudFront + S3)
     │  1. login  ──────────────►  Amazon Cognito  ──►  Google (optional)
     │  2. game data (GET/PUT) ──►  API Gateway (HTTP API)
     │                                   │  (JWT authorizer checks the Cognito token)
     │                                   ▼
     │                                 Lambda  ──►  DynamoDB (per-user progress)
     └  3. plant photos ────────►  iNaturalist API (public, no auth)
```

- **Cognito** = login + Google sign-in (replaces Supabase Auth).
- **DynamoDB** = the database storing each user's progress (replaces Supabase Postgres).
- **Lambda + API Gateway** = the small backend your browser calls; the JWT authorizer makes sure callers are really logged in, and Lambda only ever touches the calling user's own row.
- **S3 + CloudFront** = static hosting over HTTPS (replaces Vercel).

## Files
| File | What it is |
|------|------------|
| `index.html` | The whole app (auth + game). |
| `config.js` | **You edit this** — your Cognito + API + site URLs. |
| `lambda/index.mjs` | The Lambda function code (GET/PUT progress). |
| `aws/lambda-dynamodb-policy.json` | IAM policy letting the Lambda touch the table. |

---

# Setup walkthrough

Budget ~1–2 hours the first time. Pick **one region** and use it everywhere (e.g. `us-west-2` Oregon, closest to BC). Order matters — follow top to bottom.

## 0. Account safety first
1. **Billing alarm:** Billing console → **Budgets** → create a $5 monthly budget with an email alert. Learning = you'll misconfigure things; this is your tripwire.
2. **Don't use the root account day-to-day.** IAM → Users → create a user → attach `AdministratorAccess` (fine for a learning account) → sign in as that user from now on.
3. *(Optional)* Install the **AWS CLI** and run `aws configure` with that user's access key — handy for the S3 upload later. Console-only is fine too.

## 1. DynamoDB table (the database)
1. DynamoDB console → **Create table**.
2. **Table name:** `SproutProgress`
3. **Partition key:** `userId` (type **String**). No sort key.
4. Leave defaults (on-demand capacity) → **Create table**.

## 2. Lambda function (the backend logic)
1. Lambda console → **Create function** → **Author from scratch**.
2. **Name:** `sprout-progress` · **Runtime:** Node.js 20.x (or newer) · **Architecture:** arm64 is fine.
3. Create it. In the **Code** tab, replace the contents of `index.mjs` with the code from `lambda/index.mjs` in this repo, then click **Deploy**.
4. **Configuration → Environment variables → Edit → Add:** key `TABLE_NAME`, value `SproutProgress`. Save.
5. **Give it permission to use the table.** Configuration → **Permissions** → click the **Execution role** name (opens IAM) → **Add permissions → Create inline policy** → **JSON** tab → paste `aws/lambda-dynamodb-policy.json`, replacing `REGION` and `ACCOUNT_ID` (your account ID is in the top-right of the console). Name it `SproutDynamoAccess` → Create.

## 3. Hosting: S3 + CloudFront (do this before Cognito, to learn your site URL)
**S3 bucket:**
1. S3 console → **Create bucket** → a globally-unique name like `sprout-yourname-site`. Keep **Block all public access ON** (CloudFront will read it privately). Create.
2. Upload `index.html` and `config.js` for now (config still has placeholders — that's fine, you'll re-upload later).

**CloudFront distribution:**
3. CloudFront console → **Create distribution**.
4. **Origin:** choose your S3 bucket. For **Origin access**, pick **Origin access control (OAC)** → create one → CloudFront will show a bucket policy snippet to **copy**; paste it into S3 → bucket → **Permissions → Bucket policy** so CloudFront can read the bucket.
5. **Default root object:** `index.html`.
6. **Viewer protocol policy:** Redirect HTTP to HTTPS.
7. Create. Wait ~5 min for "Deployed". Copy the **Distribution domain name**, e.g. `https://d111abc.cloudfront.net` — this is your **site URL**. Use it (with a trailing slash) as `REDIRECT_URI` later.

## 4. Cognito (login + Google)
1. Cognito console → **Create user pool**.
2. Sign-in options: **Email**. (This lets people use email/password; Google gets added next.)
3. Walk through the wizard: allow self-registration, email as the verification/recovery method, and **Cognito-hosted "Send email with Cognito"** (fine for low volume).
4. **App client:** create a **public client** (a SPA — *no client secret*). Name it `sprout-web`.
5. **Managed login / Hosted UI:**
   - Add a **domain**: choose a Cognito prefix domain, e.g. `sprout-yourname` → gives `https://sprout-yourname.auth.<region>.amazoncognito.com`.
   - **Allowed callback URLs:** your CloudFront URL **with trailing slash**, e.g. `https://d111abc.cloudfront.net/`. (Add `http://localhost:8000/` too if you want to test locally.)
   - **Allowed sign-out URLs:** the same `https://d111abc.cloudfront.net/`.
   - **OAuth grant types:** **Authorization code grant** (NOT implicit).
   - **OpenID Connect scopes:** `openid`, `email`, `profile`.
6. Note three values: **User Pool ID**, **App client ID**, and the **domain**.

### 4b. Add Google sign-in
1. **Google Cloud Console** (console.cloud.google.com) → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill basics → add your email as a **test user**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorized redirect URIs:** add exactly
   `https://sprout-yourname.auth.<region>.amazoncognito.com/oauth2/idpresponse`
   (your Cognito domain + `/oauth2/idpresponse`).
5. Create → copy the **Client ID** and **Client secret**.
6. Back in **Cognito → your user pool → Sign-in / Social providers → Add identity provider → Google.** Paste the Client ID and secret. Set authorized scopes to `openid email profile`. Map Google **email → email**.
7. In your **app client's** login settings, tick **Google** (and Cognito user pool) as enabled identity providers. Save.

## 5. API Gateway (the door to Lambda)
1. API Gateway console → **Create API → HTTP API → Build**.
2. **Add integration:** Lambda → pick `sprout-progress`. Name the API `sprout-api`.
3. **Routes:** add `GET /progress` and `PUT /progress`, both pointing at the Lambda integration.
4. **Authorization:** create a **JWT authorizer** and attach it to both routes:
   - **Issuer URL:** `https://cognito-idp.<region>.amazonaws.com/<your-user-pool-id>`
   - **Audience:** your **app client ID**.
   - Identity source: `$request.header.Authorization`.
5. **CORS** (so the browser is allowed to call it): API → **CORS** → set
   - **Access-Control-Allow-Origin:** your CloudFront URL **without** trailing slash, e.g. `https://d111abc.cloudfront.net`
   - **Allow-Methods:** `GET, PUT, OPTIONS`
   - **Allow-Headers:** `authorization, content-type`
   (The HTTP API handles the preflight `OPTIONS` automatically — don't add CORS in the Lambda too, or you'll get duplicate-header errors.)
6. Copy the **Invoke URL** (e.g. `https://abcd1234.execute-api.<region>.amazonaws.com`) — that's `API_BASE`.

## 6. Fill in config.js and re-deploy
1. Edit `config.js`:
   ```js
   window.SPROUT_CONFIG = {
     CLIENT_ID:      "your app client id",
     COGNITO_DOMAIN: "sprout-yourname.auth.us-west-2.amazoncognito.com",
     API_BASE:       "https://abcd1234.execute-api.us-west-2.amazonaws.com",
     REDIRECT_URI:   "https://d111abc.cloudfront.net/"
   };
   ```
2. Re-upload `index.html` + `config.js` to the S3 bucket (overwrite).
3. CloudFront → your distribution → **Invalidations → Create** → path `/*` (clears the cache so the new files show).
4. *(Push the same files to your GitHub repo so it stays your source of truth.)*

## 7. Test
1. Open your CloudFront URL on your laptop. Click **Continue with Google** or **email** → you land on the AWS sign-in page → sign in → you're bounced back and the game loads.
2. Answer a few questions, then open the URL on your **phone** and sign in with the same account — your forest should match. 🎉

---

## Troubleshooting
- **`redirect_mismatch` / Google error:** the callback URL must match *exactly* (trailing slash included) in Cognito, and the Google redirect URI must be the `…/oauth2/idpresponse` one. These two are the usual culprits.
- **Setup screen won't go away:** `config.js` still has placeholder `xxxx` values, or CloudFront served a cached old copy — re-upload and invalidate `/*`.
- **CORS errors in the browser console:** the API's Allow-Origin must equal your CloudFront origin with **no** trailing slash; make sure you didn't also add CORS headers in the Lambda.
- **401 from the API:** the JWT authorizer's **audience** must be your app client ID and the **issuer** the `cognito-idp…/<pool-id>` URL; the app sends the **ID token** as the bearer.
- **Stuck:** Lambda → Monitor → **View CloudWatch logs** shows server-side errors.

## Cost & upkeep
- For personal traffic this runs at roughly **$0–pennies/month**. DynamoDB on-demand and Lambda have small always-free allowances; **much of the AWS Free Tier is only 12 months**, so keep that $5 budget alarm on. CloudFront + S3 for a tiny site is cents.
- Unlike Supabase, nothing here "pauses" — it just sits idle at near-zero cost.

## Ideas for later
- A friends leaderboard (another DynamoDB table + a `GET /leaderboard` route).
- A "near me" mode using the browser's GPS instead of the whole region.
- Difficulty levels (easy = very different species, hard = same-genus look-alikes).
