import type { Response } from "express";
export const ok = (response: Response, data: unknown, status = 200) => response.status(status).json({ success: true, data });
export const fail = (response: Response, status: number, code: string, message: string) => response.status(status).json({ success: false, error: { code, message } });
export const asId = (value: unknown) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
