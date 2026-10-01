import type { NextFunction, Request, RequestHandler, Response } from "express";

export const handle =
  (fn: (request: Request, response: Response) => Promise<unknown>): RequestHandler =>
  (request: Request, response: Response, next: NextFunction) => {
    fn(request, response).catch(next);
  };
