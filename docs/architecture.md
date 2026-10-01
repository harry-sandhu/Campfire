# Campfire architecture

Campfire is a single-organization modular monolith. The Next.js frontend is deployed to Vercel, the Express API to Render, and MongoDB is hosted by MongoDB Atlas.

The backend is the source of truth for authentication, authorization, validation, and business rules. Phase 1 establishes the backend service boundary, environment validation, MongoDB connection, structured request logging, security headers, CORS, health checks, and a minimal frontend shell.

Boundaries are `auth`, `users`, `groups`, `tickets` (with comments and links), `activity`, `dashboard` and `notifications`. Routes validate input with Zod and call shared helpers: `utils/access.ts` decides which tickets and groups a user may see, and `services/ticket-service.ts` holds ticket placement rules, activity and notifications. Errors are thrown as `HttpError` and rendered by one error handler.

The frontend uses the Next.js App Router: `app/(app)/*` pages sit behind an auth guard and shell, `lib/api.ts` retries once after refreshing an expired access token, and `components/` holds shared UI such as the accessible `Modal`.
