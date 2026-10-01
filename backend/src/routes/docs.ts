import { Router } from "express";
import { buildSpec } from "../openapi.js";

const router = Router();
const spec = buildSpec();

router.get("/openapi.json", (_request, response) => response.json(spec));

/** Interactive reference. Swagger UI loads from a CDN, so this one page relaxes the content security policy. */
router.get("/", (_request, response) => {
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self'");
  response.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>Campfire API</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="ui"></div><script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({ url: "/api/docs/openapi.json", dom_id: "#ui" });</script></body></html>`);
});

export { router as docsRouter };
