"use client";

// DEEYOUNG PRO — Better Auth client (React hooks: useSession, signIn, signUp…)

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

/** Shape of the session user as delivered to the client (additional fields included). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  status: string;
  plan: string;
  trialEndsAt: string | null;
}
