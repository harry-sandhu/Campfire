# Deployment

## Render

Use the `backend` directory as the service root. Build with `npm ci && npm run build`, start with `npm start`, and use `/health/ready` as the health check. Set `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS` (a comma-separated list of any additional frontend origins, such as `http://localhost:3000`), `NODE_ENV=production`, and `PORT` (Render supplies `PORT`).

## Vercel

Use the `frontend` directory as the project root and set `NEXT_PUBLIC_API_URL` to the deployed Render API `/api/v1` URL. No database URI or JWT secret belongs in Vercel environment variables.

## Deploy notes for the hardening release

- Deploy the backend and frontend together. The backend now rejects API calls from users flagged `mustChangePassword` (only `/auth/*` works), and the new frontend provides the change-password screen.
- Optionally set `BOOTSTRAP_TOKEN` on Render so `POST /bootstrap` requires the `x-bootstrap-token` header.
- Existing non-admin users will not be able to create groups until they are given the new `groups.create` permission in People → Permissions.
- Existing ungrouped tickets stay visible to their creator, assignees and SuperAdmin only. Move them into a group from the ticket page to share them.

## Operations notes

- **Backups:** `scripts/backup-mongo.sh` wraps `mongodump` (set `MONGODB_URI`). Schedule it and store archives off the database host. Atlas free tiers do not include automated backups.
- **Recurring tickets** are created by a timer inside the API process (checked at start-up and every 5 minutes). If the host sleeps, due tickets are created when it wakes, once per template. Run a single API instance.
- **Realtime updates** use long-lived HTTP streams; they work behind Render and Vercel proxies and reconnect automatically.
- **Webhooks** only deliver to public https addresses. Slack incoming webhooks work as-is.
- **Logs** carry an `x-request-id` per request (an incoming id is honoured) and never include Authorization headers or cookies.
- **Storage:** the SuperAdmin → Data page shows database size and lets you delete old tickets, activity, notifications and audit records to stay inside a free tier.

## Custom domains (autodao.tech)

Frontend on Vercel at `https://autodao.tech`, API on Render at `https://api.autodao.tech`. Because both share the parent domain, the sign-in cookie is same-site and works in Safari and with strict browser privacy settings.

Do this in order:

1. **Render:** add `api.autodao.tech` under Custom Domains and wait for the certificate. Check `https://api.autodao.tech/health/ready`.
2. **Render env (first pass):** `FRONTEND_URL=https://autodao.tech`, and `CORS_ORIGINS` set to your current Vercel URL (and `https://www.autodao.tech` if used) so the old and new sites both work during the switch. Leave `COOKIE_DOMAIN` empty.
3. **Vercel:** add `autodao.tech` (and `www`) under Domains and set `NEXT_PUBLIC_API_URL=https://api.autodao.tech/api/v1` and `NEXT_PUBLIC_SITE_URL=https://autodao.tech` for Production. Redeploy: these values are fixed at build time.
4. **Render env (second pass), once the site calls the new API:** `COOKIE_DOMAIN=.autodao.tech`, then redeploy. Setting it earlier makes browsers reject the cookie.
5. Everyone signs in once more. Then remove the old Vercel/Render URLs from `CORS_ORIGINS`.

Vercel preview deployments use other origins; add them to `CORS_ORIGINS` only if you need to test against them.
