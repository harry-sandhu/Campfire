import type { ErrorRequestHandler } from "express";
import { Error as MongooseError } from "mongoose";
import { ZodError } from "zod";
import { HttpError } from "../utils/errors.js";

const send = (response: Parameters<ErrorRequestHandler>[2], status: number, code: string, message: string, details?: unknown) =>
  response.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) return void send(response, error.status, error.code, error.message);
  if (error instanceof ZodError) return void send(response, 422, "VALIDATION_ERROR", "Request validation failed", error.flatten());
  if (error instanceof MongooseError.CastError) return void send(response, 400, "INVALID_ID", "Invalid identifier");
  if (error?.code === 11000) return void send(response, 409, "DUPLICATE", "That value already exists");
  if (error?.type === "entity.parse.failed") return void send(response, 400, "INVALID_JSON", "Request body is not valid JSON");
  if (error?.type === "entity.too.large") return void send(response, 413, "PAYLOAD_TOO_LARGE", "Request body is too large");

  console.error(error);
  send(response, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred");
};
