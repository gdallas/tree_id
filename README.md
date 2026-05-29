# 🌱 Sprout

A Duolingo-style game for learning the **trees and plants of the Pacific Northwest** (focused on British Columbia). You get a real photo, guess the species from four choices, read how to recognise it, earn points, and grow a virtual forest. Accounts and progress are stored in the cloud, so they sync across your phone and laptop.

- **Data:** live photos & species from the [iNaturalist API](https://api.inaturalist.org/v1/docs/) (citizen science), ID notes from Wikipedia.
- **Accounts & sync:** [Supabase](https://supabase.com) (Postgres + Auth, incl. Google sign-in).
- **Hosting:** any static host (Vercel / Netlify / Cloudflare Pages). No server, no build step.

---

## What's in here

| File | What it is |
|------|------------|
| `index.html` | The whole app (HTML + CSS + JS). |
| `config.js`  | **You edit this** — your Supabase URL + anon key. |
| `schema.sql` | One-time database setup to paste into Supabase. |
| `.gitignore` | Standard ignores. |

---

## Setup (about 15 minutes, all free)

### 1. Create a Supabase project
1. Go to **https://supabase.com** → sign in → **New project**.
2. Pick a name, a strong database password, and a region near you (e.g. *West US* for BC).
3. Wait ~2 minutes for it to provision.

### 2. Create the database table
1. In the project, open **SQL Editor** → **New query**.
2. Paste the entire contents of `schema.sql` and click **Run**.
   This creates a `progress` table and locks it down so each user can only touch their own row.

### 3. Get your keys into `config.js`
1. In Supabase: **Project Settings → API** (or **Data API**).
2. Copy the **Project URL** and the **anon / public** key.
3. Open `config.js` and paste them in:
   ```js
   window.SPROUT_CONFIG = {
     SUPABASE_URL: "https://abcdxyz.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi....(long public key)"
   };
   ```
   > The anon key is meant to be public — Row Level Security (from step 2) is what protects the data. Never paste the **service_role** key here.

### 4. Turn on Google sign-in (optional but you asked for it)
1. In Supabase: **Authentication → Providers → Google → enable**. Leave this tab open; it shows a **Callback URL** like
   `https://abcdxyz.supabase.co/auth/v1/callback`.
2. In **Google Cloud Console** (https://console.cloud.google.com):
   - Create/select a project → **APIs & Services → OAuth consent screen** → set it up (External, add your email as a test user).
   - **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
   - Under **Authorized redirect URIs**, paste the **Callback URL** from Supabase (step 1 above).
   - Create it, then copy the **Client ID** and **Client secret**.
3. Back in Supabase's Google provider settings, paste the **Client ID** and **Client secret** and save.
4. In Supabase **Authentication → URL Configuration**, set **Site URL** to your live site (you'll get this in step 6, e.g. `https://sprout-xyz.vercel.app`) and add it to **Redirect URLs** too.

> Email/password sign-up works out of the box. If you don't want users to confirm their email first, go to **Authentication → Providers → Email** and turn off "Confirm email".

### 5. Put the code on GitHub
**Easiest (no command line):**
1. Create a free account at github.com, click **New repository**, name it `sprout`, keep it Public or Private, **Create**.
2. On the empty repo page click **uploading an existing file**, then drag in `index.html`, `config.js`, `schema.sql`, `.gitignore`, and `README.md`. Commit.

**Or with the command line:**
```bash
cd sprout
git init
git add .
git commit -m "Sprout: PNW plant ID game"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/sprout.git
git push -u origin main
```

### 6. Deploy (free)
**Vercel (recommended):**
1. Go to **https://vercel.com** → sign in with GitHub → **Add New → Project** → import your `sprout` repo.
2. Framework preset: **Other**. No build command, output directory = root. Click **Deploy**.
3. You get a live URL like `https://sprout-xyz.vercel.app`. Every `git push` redeploys automatically.

*(Netlify and Cloudflare Pages work identically — connect the repo, no build settings needed.)*

### 7. Finish the auth loop
Copy your live URL and make sure it's set as the **Site URL / Redirect URL** in Supabase (step 4.4). Now open the URL on your phone and laptop, sign in with the same account, and your forest follows you. 🎉

---

## Good to know
- **Free Supabase projects pause after 7 days of no database activity** (a ~30s wake-up on the next visit). For a personal app that's usually fine; if it bugs you, set a tiny scheduled "ping" (search "Supabase keep-alive GitHub Action").
- **Costs:** Supabase free tier (500 MB DB, 50,000 monthly users) and Vercel/Netlify/Cloudflare free static hosting cover this easily. The only optional cost is a custom domain (~$10–15/yr).
- **Privacy/licensing:** photos are shown with their iNaturalist attribution and are Creative-Commons licensed. Please keep the attribution visible.

## Ideas for later
- Difficulty levels (easy = very different species, hard = same-genus look-alikes).
- A "near me" mode using your GPS instead of the whole region.
- Daily challenge / leaderboard among friends (Supabase makes this easy).
