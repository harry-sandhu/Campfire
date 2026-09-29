# Campfire

Campfire is a single-organization internal ticket management system.

## Phase 1 foundation

- TypeScript Express API on port 4000
- Next.js frontend on port 3000
- Environment validation with Zod
- MongoDB/Mongoose connection
- Helmet, restricted credentialed CORS, JSON limits, and request logging
- `/health` and `/health/ready` endpoints
- Render/Vercel-compatible host and port configuration

## Local setup

1. Copy `.env.example` to `backend/.env` and replace the secrets with random values of at least 32 characters.
2. Install dependencies with `npm install` in the root, `backend`, and `frontend` directories.
3. Start MongoDB, then run `npm run dev:backend` and `npm run dev:frontend` from the root.

The authentication, permissions, ticket, comments, links, activity, and notification modules will be added incrementally in later phases.
