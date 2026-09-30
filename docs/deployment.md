# Deployment

## Render

Use the `backend` directory as the service root. Build with `npm ci && npm run build`, start with `npm start`, and use `/health/ready` as the health check. Set `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS` (a comma-separated list of any additional frontend origins, such as `http://localhost:3000`), `NODE_ENV=production`, and `PORT` (Render supplies `PORT`).

## Vercel

Use the `frontend` directory as the project root and set `NEXT_PUBLIC_API_URL` to the deployed Render API `/api/v1` URL. No database URI or JWT secret belongs in Vercel environment variables.
