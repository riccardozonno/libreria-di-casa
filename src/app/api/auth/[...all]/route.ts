import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

// Tutte le rotte di Better Auth (/api/auth/*): login, logout, reset, 2FA.
export const { GET, POST } = toNextJsHandler(auth);
