"use client";
import { createAuthClient } from "better-auth/react";

/** The Better Auth client: same-origin calls to /api/auth (Google sign-in). No secrets here. */
export const authClient = createAuthClient();
