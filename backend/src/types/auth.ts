import type { Permission } from "../constants/permissions.js";

export type AuthUser = { id: string; role: "SUPERADMIN" | "USER"; permissions: Permission[]; name: string; email: string; mustChangePassword?: boolean };

declare global {
  namespace Express { interface Request { user?: AuthUser; requestId?: string } }
}
