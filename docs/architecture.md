# Campfire architecture

Campfire is a single-organization modular monolith. The Next.js frontend is deployed to Vercel, the Express API to Render, and MongoDB is hosted by MongoDB Atlas.

The backend is the source of truth for authentication, authorization, validation, and business rules. Phase 1 establishes the backend service boundary, environment validation, MongoDB connection, structured request logging, security headers, CORS, health checks, and a minimal frontend shell.

Planned boundaries are `auth`, `users`, `tickets`, `comments`, `links`, `activity`, and `notifications`. Each feature will use route → controller → service → model/repository layering as it is introduced.
