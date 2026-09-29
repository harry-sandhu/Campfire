import { Router } from "express";

const router = Router();
router.get("/", (_request, response) => response.json({ openapi: "3.0.3", info: { title: "Pjira API", version: "0.1.0" }, servers: [{ url: "/api/v1" }], paths: { "/auth/login": { post: { summary: "Authenticate a user" } }, "/tickets": { get: { summary: "List tickets" }, post: { summary: "Create a ticket" } }, "/tickets/{id}": { get: { summary: "Get a ticket" }, patch: { summary: "Update a ticket" } } } }));
export { router as docsRouter };
