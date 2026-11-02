# 📦 ParcelPath

### Your deliveries, all in one place.

[🚀 Open ParcelPath — Live Demo](https://parcelpath-brown.vercel.app/)

**Hosted on Vercel · React · TypeScript · Express**

**One dashboard to organise parcels, plan around deliveries, and keep shipment issues in view.**

ParcelPath is a delivery-management web application designed around a familiar problem: orders arrive from different stores, tracking information is scattered, and delivery updates are easy to miss. It brings saved shipments, a delivery calendar, order details, preferences, and customer-care requests into one interface.

> **Project status:** Deployed prototype on Vercel. The implementation notes below describe the current prototype; deployment does not by itself complete its backend integrations. Live courier tracking, Gmail scanning, durable cloud storage, and production authentication hardening still require implementation. The included shipment examples are demonstration data.

## ✨ Experience

- **All your parcels together:** Add multiple tracking numbers, search saved shipments, apply filters, edit labels, and remove tracker entries independently of retailer orders.
- **Plan your day:** Switch between list, calendar, Arriving Today, and delivery-history views.
- **Understand each shipment:** Open details with a timeline, status, available estimate, progress indicator, and carrier links.
- **Make orders recognisable:** Add labels such as “Birthday gift,” “College supplies,” or “Urgent.”
- **Keep issues organised:** Submit customer-care requests with an issue category, affected shipment or manual tracking ID, description, and optional screenshot.
- **Choose how to be contacted:** Enter email, phone, or WhatsApp details and select a preferred contact method.
- **Keep the interface personal:** Switch between a dark theme and a beige light theme with black text and warm brown accents.
- **Enjoy thoughtful interactions:** Animated cards, modal transitions, sidebar navigation, and notification guidance.
- **Access it from your home screen:** A web app manifest, icons, installation guidance, and service worker are included.

## What works—and what still needs integration

| Area | Current implementation |
| --- | --- |
| Dashboard and delivery views | React interface with search, filters, calendar, history, and shipment details |
| Shipment management | Express endpoints backed by a JSON-file database |
| Courier identification | Tracking-number pattern heuristics and carrier links; detection is not proof that a parcel exists |
| Customer Care | Editable contact form, issue selection, ticket creation, and attachment metadata/data storage |
| Account management | Custom registration, login, server-side session revocation on sign-out, profile updates, and deletion endpoints; automatic demo access removed |
| Notifications | Stored in-app alerts, test alerts, and browser permission/display controls; no complete background push pipeline |
| Live tracking | No outbound courier API integration; adding credentials alone does not enable live tracking |
| Delivery estimates | Seeded/generated prototype values, not verified carrier estimates |
| Gmail product photos | Connection UI and placeholder state changes; no completed OAuth exchange, Gmail scan, or photo extraction |
| Rescheduling | Returns carrier portal links; does not book or confirm a new delivery slot |
| Cloud database and attachments | Not connected; database/storage environment variables are placeholders |
| Deployment | Deployed on Vercel; registration, login, session revocation, and rejection of unauthenticated requests verified against the live API |

**Tracking accuracy:** The current create-shipment endpoint generates initial events, a location, and an estimated date without contacting a courier. Manual refresh and the scheduled job update timestamps without fetching carrier events. These must be replaced with verified provider responses before presenting the product as live tracking.

## Recent improvements

- **Reliable sign-out:** Clears account-specific data and the saved browser token, revokes the active session on the server, and prevents pending profile or delivery requests from restoring signed-out state.
- **No automatic demo login:** Unauthenticated requests and the old demo token are rejected. The demo-account button has been removed.
- **Password visibility:** An eye control lets users show or hide the password while entering it.
- **Vercel API fix:** Corrected the server module import in the API entry point so authentication requests can reach Express.
- **Stable production link:** Use [parcelpath-brown.vercel.app](https://parcelpath-brown.vercel.app/) for the latest production release; older deployment-specific links may still show earlier versions.

### Verification

Type checking and the production build passed, along with all 12 existing courier/support utility tests. Live API checks verified registration, login, authenticated profile access, sign-out, rejection of the revoked session, and rejection of unauthenticated or legacy-demo requests. The temporary verification account was deleted after testing. These checks do not constitute a full browser test or production security audit.

## 🛠 Technology

| Layer | Implementation |
| --- | --- |
| Interface | React 19 and TypeScript |
| Build tooling | Vite |
| Styling | Tailwind CSS 4 and custom CSS |
| Icons and animation | Lucide React and Motion |
| Backend | Express with TypeScript, run using `tsx` |
| Current storage | JSON file and in-memory state |
| Tests | Node test runner through `tsx` |
| Deployment target | Vercel: static frontend plus Express API entry point |
| PWA assets | Manifest, icons, service worker, and installation hook |

Firebase is not currently integrated. The Gemini SDK is listed as a dependency, but the inspected tracking and support flows do not require Gemini API calls.

## 🚀 Open the website

Visit [ParcelPath](https://parcelpath-brown.vercel.app/) in your browser. No local installation or localhost server is required to access the hosted website.

Explore the dashboard, delivery views, themes, and customer-care interface. Create an account to manage your saved deliveries. Automatic demo access and the demo-account button have been removed. Shipment tracking still uses generated prototype data; use synthetic information while production integrations are being completed.

## Configuration

| Variables | Actual usage in this source version |
| --- | --- |
| `PORT`, `NODE_ENV` | Local server port and development/production mode |
| `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SUPPORT_WHATSAPP`, `SUPPORT_HOURS` | Contact information returned by the support-configuration endpoint |
| `CRON_SECRET` | Optional bearer-secret check on the refresh job; configure it for hosted use |
| `DELHIVERY_API_KEY`, `SHIPROCKET_API_KEY`, `TRACK17_API_KEY` | Presence checks affect provider-status messaging; no live requests are implemented |
| `GOOGLE_CLIENT_ID` | Presence check enables a placeholder email connection state; not real OAuth |
| `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `STORAGE_BUCKET_NAME` | Documented in the template but not connected to storage code |
| `APP_URL`, `GOOGLE_CLIENT_SECRET`, `BLUEDART_LICENSE_KEY`, `GEMINI_API_KEY` | Present in the template; not used by the inspected application flows |

Keep private credentials out of browser code and Git history. Setting an environment variable does not implement its corresponding integration.

## ▲ Vercel hosting and maintenance

ParcelPath is hosted on Vercel at the live-demo link above. The repository contains `vercel.json` and `api/index.ts`, configured to serve the Vite build from `dist/` and forward `/api/*` requests to Express.

### Before using real customer data

1. **Harden prototype authentication.** Automatic demo access has been removed and sign-out now revokes the active session. Replace the current fixed-salt SHA-256 password hashing with a suitable authentication service or password-hashing implementation, add session expiry, and ensure profile responses never return password hashes.
2. **Implement durable storage.** `src/server/db.ts` writes to `data/db.json` locally and `/tmp/parcelpath-data` when `VERCEL` is set. This is not a shared, durable database. Adding `DATABASE_URL` alone does not change it.
3. **Implement private attachment storage.** Screenshots currently live as base64 data in ticket records. A Blob token alone does not upload them to Blob storage. Validate actual file bytes and enforce attachment access controls.
4. **Finish data integrations.** Implement courier requests and truthful refresh results. Complete Gmail authorization and scanning before reporting email as connected.
5. **Remove personal seed records.** Review `data/db.json` and defaults in `src/server/db.ts` before publishing the repository or application. Use synthetic demonstration records.
6. **Validate the production build and API routing.** Confirm all required files are included in the serverless function and test page refreshes and API calls after deployment.

### Settings for future deployments

After addressing the relevant prerequisites—or for a controlled demonstration using synthetic data:

1. Push the project to your GitHub repository.
2. Import the repository into Vercel.
3. Use these project settings:

   | Setting | Value |
   | --- | --- |
   | Framework | Vite |
   | Root directory | Directory containing `package.json` |
   | Install command | `npm install` |
   | Build command | `npm run build` |
   | Output directory | `dist` |

4. Configure the environment variables actually needed by the implementation. Use real support contacts or leave them blank.
5. Deploy and inspect the build and function logs.
6. Check the dashboard, `/api/config/support`, registration/sign-in behavior, shipment operations, and support submission using synthetic records.

The configured cron schedule is `0 0 * * *` (daily at midnight UTC). Its endpoint currently updates timestamps only; it does not poll couriers. Configure `CRON_SECRET` and replace the placeholder behavior before relying on scheduled tracking.

The existing `DEPLOYMENT.md` describes some integrations that are not implemented in code, including database/Blob connections and OAuth/webhook routes. Do not assume those routes or services become available simply by entering credentials.

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) · [Express on Vercel](https://vercel.com/docs/frameworks/backend/express) · [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build)

## Project guide

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Main dashboard, navigation, state, and delivery views |
| `src/components/` | Delivery, authentication, email, feedback, and customer-care interfaces |
| `src/hooks/usePWAInstall.ts` | PWA installation guidance |
| `src/index.css` | Themes, layout, and interaction styling |
| `src/server/db.ts` | Prototype users, sessions, shipments, alerts, and ticket storage |
| `src/utils/courier.ts` | Courier heuristics, links, ETA formatting, grouping, and progress utilities |
| `src/utils/support.ts` | Support categories and validation helpers |
| `server.ts` | Express routes and local server startup |
| `api/index.ts` | Vercel function entry point |
| `public/` | Icons, manifest, service worker, and original dashboard reference |
| `vercel.json` | Build settings, rewrites, and cron configuration |

## Roadmap

- [ ] Connect an authorized courier tracking provider.
- [ ] Replace generated shipment data with verified tracking events.
- [ ] Add durable database and private file storage.
- [ ] Harden authentication, authorization, sessions, and input validation.
- [ ] Complete optional Gmail OAuth and product-photo matching.
- [ ] Implement event-driven notifications and background push subscriptions.
- [ ] Validate offline behavior and installation across supported browsers.
- [x] Verify registration, login, and logout against the deployed API using a temporary test account.
- [ ] Complete browser end-to-end verification of shipment, support, and account flows.

## Contributing

Keep changes focused and preserve the existing themes and interaction style. Explain the problem, the resulting behavior, and how the change was checked. Run the relevant type checks, tests, and build before proposing a change.

Never commit customer data, session tokens, or private credentials. Keep simulated tracking clearly distinguishable from verified courier information.

## License

No license file was included in the supplied project. The repository owner should choose and add a license before granting reuse or redistribution permissions.

---

**ParcelPath — fewer places to check, more clarity about your deliveries.**
