import { auth } from "./index";
import { headers } from "next/headers";

export interface AuthSession {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
}

/**
 * Get the current session from request headers.
 * Returns null when the request is not authenticated.
 */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    return (session as AuthSession | null) ?? null;
  } catch (error) {
    console.error("Session retrieval error:", error);
    return null;
  }
}

/**
 * Get the session or throw. Use this in protected API routes.
 */
export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

/**
 * Get the user id from the session, or null when unauthenticated.
 */
export async function getUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * Get the user id from the session, or throw.
 */
export async function requireUserId(): Promise<string> {
  const session = await requireSession();
  return session.user.id;
}
