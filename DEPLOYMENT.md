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
| `NODE_ENV` | Yes | `production` |
| `APP_URL` | Yes | Your production Vercel domain (e.g. `https://parcelpath.vercel.app`) |
| `SUPPORT_EMAIL` | Optional | Official support email shown in Customer Care (e.g. `care@parcelpath.in`). If omitted, app displays honest unavailable state for direct calling. |
| `SUPPORT_PHONE` | Optional | Official support hotline / WhatsApp number (e.g. `+91 98765 43210`). |
| `SUPPORT_WHATSAPP` | Optional | Dedicated official WhatsApp contact number. |
| `SUPPORT_HOURS` | Optional | Working hours (default: `Mon–Sat: 9:00 AM – 7:00 PM IST`). |
| `GOOGLE_CLIENT_ID` | Optional | Google Cloud OAuth Client ID (for Gmail order confirmation photo matching). |
| `GOOGLE_CLIENT_SECRET` | Optional | Google Cloud OAuth Client Secret. |
| `DELHIVERY_API_KEY` | Optional | Live tracking token for Delhivery webhooks. |
| `BLUEDART_LICENSE_KEY` | Optional | Enterprise tracking credentials for Blue Dart. |
| `BLOB_READ_WRITE_TOKEN` | Optional | Vercel Blob token for external persistent attachment storage. |
| `DATABASE_URL` | Optional | PostgreSQL connection string for permanent multi-user database storage. |

---

### Step 2.4: Deploy & Verify

1. Click **Deploy**. Vercel will run `npm run build` and provision serverless API routes.
2. Once the build completes, visit your production URL (e.g., `https://parcelpath.vercel.app`).
3. Verify:
   - Navigation between **Dashboard**, **Deliveries** (List, Calendar, History), **Customer Care**, and **Issues & Feedback**.
   - Customer Care form: Fill in contact details, select an affected parcel or manual tracking ID, attach a test screenshot, and submit.
   - Verify ticket reference code (e.g. `TKT-xxxx-2026`) appears in confirmation.
   - Switch to **Issues & Feedback** to see the new ticket listed with contact details, category label, and attachment badge.

---

## 3. External Service URLs & Authorizations

When configuring external integrations for your Vercel domain:

1. **Google Cloud Console (OAuth Credentials):**
   - **Authorized JavaScript Origins:**
     `https://<your-project>.vercel.app`
   - **Authorized Redirect URIs:**
     `https://<your-project>.vercel.app/api/auth/google/callback`

2. **Courier Webhook Endpoints:**
   - **Delhivery Tracking Webhook:**
     `https://<your-project>.vercel.app/api/webhooks/delhivery`
   - **Blue Dart Tracking Webhook:**
     `https://<your-project>.vercel.app/api/webhooks/bluedart`

3. **Content Security & CORS:**
   - The server accepts standard same-origin requests from your Vercel domain and allows image previews from data URIs and verified carrier domains.

---

## 4. Truthful Disclosure of Production Dependencies

- **Local/Demo Storage vs. Production Database:** Out-of-the-box, ParcelPath uses file/memory state seeded with demo data (`user_kusuma_default`). In Vercel serverless environments, state resets if the lambda container recycles. To retain tickets, labels, and parcels permanently across reboots, provide a `DATABASE_URL` pointing to PostgreSQL or Supabase.
- **Inbound Support Calls/Messages:** Submitting a customer care ticket creates a trackable record in the user’s account. It does **not** make phone calls or dispatch automated WhatsApp messages without integrating a third-party messaging provider (such as Twilio or Meta WhatsApp Business API).
