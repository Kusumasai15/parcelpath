# ParcelPath — Vercel Deployment & Configuration Guide

This guide details the exact steps to deploy ParcelPath to **Vercel** as a high-performance web application with full-stack serverless API routing, persistent database options, and secure Customer Care ticket management.

---

## 1. Project Build & Deployment Architecture

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS (`dist/` directory served globally via Vercel Edge CDN).
- **Backend APIs:** Express full-stack API mounted serverlessly via `/api/index.ts` and configured in `vercel.json`.
- **Theme & Styles:** Preserved Dark mode and Light mode (warm beige surfaces `#fffcf6`/`#f5f0e6`, black text, `#8b5e3c` warm brown accents).
- **File System Notice:** Vercel serverless functions execute in an ephemeral container where only `/tmp` is writable. `src/server/db.ts` automatically initializes from `data/db.json` into `/tmp/parcelpath-data` on serverless cold starts. For multi-region persistent data across container reboots, connect an external database (e.g. Supabase, PostgreSQL, Neon, or Firebase Firestore) via `DATABASE_URL`.
- **Screenshot Storage:** Screenshot uploads are validated (PNG, JPEG, WebP under 5 MB) and stored as private base64 records inside the ticket; for external object storage, supply `BLOB_READ_WRITE_TOKEN` (Vercel Blob).

---

## 2. Step-by-Step Deployment Instructions

### Step 2.1: Initialize Git & Push to GitHub

1. Ensure all your local changes are committed:
   ```bash
   git status
   git add .
   git commit -m "Complete Customer Care interactive form and Vercel deployment setup"
   ```

2. Create a new repository on [GitHub](https://github.com/new) named `parcelpath` (private or public).

3. Link and push your repository:
   ```bash
   git remote add origin https://github.com/<your-username>/parcelpath.git
   git branch -M main
   git push -u origin main
   ```

---

### Step 2.2: Import into Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New…** → **Project**.
3. Select your GitHub repository (`parcelpath`) and click **Import**.
4. In the **Configure Project** screen:
   - **Framework Preset:** Vite
   - **Root Directory:** `./`
   - **Build Command:** `npm run build` (configured automatically via `vercel.json`)
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

---

### Step 2.3: Configure Environment Variables in Vercel

Under **Settings → Environment Variables** in the Vercel dashboard, add the following variables:

| Variable Name | Required? | Description / Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | **Yes (for Neon)** | Neon PostgreSQL connection URI: `postgresql://user:password@ep-xyz.region.aws.neon.tech/neondb?sslmode=require`. Used for all persistent account, parcel, ticket, and session data. |
| `NODE_ENV` | Yes | `production` |
| `APP_URL` | Yes | Your production Vercel domain (e.g. `https://parcelpath-brown.vercel.app`) |
| `GOOGLE_CLIENT_ID` | Optional | Google Cloud OAuth Client ID (for Gmail order confirmation photo matching). |
| `GOOGLE_CLIENT_SECRET` | Optional | Google Cloud OAuth Client Secret. |
| `SUPPORT_EMAIL` | Optional | Official support email shown in Customer Care (e.g. `care@parcelpath.in`). If omitted, app displays honest unavailable state for direct calling. |
| `SUPPORT_PHONE` | Optional | Official support hotline / WhatsApp number (e.g. `+91 98765 43210`). |
| `SUPPORT_WHATSAPP` | Optional | Dedicated official WhatsApp contact number. |
| `SUPPORT_HOURS` | Optional | Working hours (default: `Mon–Sat: 9:00 AM – 7:00 PM IST`). |
| `DELHIVERY_API_KEY` | Optional | Live tracking token for Delhivery webhooks. |
| `BLUEDART_LICENSE_KEY` | Optional | Enterprise tracking credentials for Blue Dart. |
| `CRON_SECRET` | Optional | Secret key to protect `/api/cron/refresh-tracking` from unauthorized external requests. |

---

### Step 2.4: Deploy & Verify

1. Click **Deploy**. Vercel will run `npm run build` and provision serverless API routes.
2. Once the build completes, visit your production URL (e.g., `https://<your-project>.vercel.app`).
3. Verify database health: Visit `https://<your-project>.vercel.app/api/health/db` — it executes a live `SELECT 1` query on Neon PostgreSQL and returns `{ "status": "ok", "database": "neon_postgres", "healthy": true }`.
4. Verify account & recovery:
   - Register a new account. You will receive a strong 16-character recovery code (e.g., `H7KR-9M2P-4WX8-T5YQ`) to save.
   - Save a parcel.
   - Sign out, then sign back in to confirm persistent storage.
   - In Settings, test changing your password (direct two-field form) or generating a replacement recovery code.
   - Test "Forgot password?" using your account email and recovery code.

---

## 3. External Service URLs & Authorizations

### 3.1 Google Cloud Console (Gmail Photo Matching OAuth)

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
1. Enable the **Gmail API** under APIs & Services.
2. Under **Credentials → OAuth 2.0 Client IDs → Web application**:
   - **Authorized JavaScript Origins:**
     - `https://<your-project>.vercel.app`
     - `http://localhost:3000` (for local development)
   - **Authorized Redirect URIs (EXACT CALLBACK URL):**
     - `https://<your-project>.vercel.app/api/auth/google/callback`
     - `http://localhost:3000/api/auth/google/callback`
3. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
4. Copy the Client ID and Client Secret into your Vercel Environment Variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

3. **Courier Webhook Endpoints:**
   - In your carrier/aggregator developer portal (Delhivery, Blue Dart, Shiprocket, or 17TRACK):
     - **Delhivery Tracking Webhook:**
       `https://<your-project>.vercel.app/api/webhooks/delhivery`
     - **Blue Dart Tracking Webhook:**
       `https://<your-project>.vercel.app/api/webhooks/bluedart`

4. **Background Tracking Scheduler (Vercel Cron):**
   - Configured in `vercel.json` (`/api/cron/refresh-tracking`, scheduled daily or hourly).
   - In Vercel Project Settings → **Cron Jobs**, verify that `/api/cron/refresh-tracking` is registered.

---

## 4. Truthful Disclosure of Production Dependencies

- **Local/Demo Storage vs. Production Database:** Out-of-the-box, ParcelPath uses file/memory state seeded with demo data (`user_kusuma_default`). In Vercel serverless environments, state resets if the lambda container recycles. To retain tickets, labels, and parcels permanently across reboots, provide a `DATABASE_URL` pointing to PostgreSQL or Supabase.
- **Inbound Support Calls/Messages:** Submitting a customer care ticket creates a trackable record in the user’s account. It does **not** make phone calls or dispatch automated WhatsApp messages without integrating a third-party messaging provider (such as Twilio or Meta WhatsApp Business API).
