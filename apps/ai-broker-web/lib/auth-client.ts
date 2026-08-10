import { createAuthClient } from "better-auth/react";
import { siweClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  plugins: [siweClient()],
});

// Named exports for compatibility
export const useSession = authClient.useSession;

export const signIn = {
  social: authClient.signIn.social,
  anonymous: async (options?: { callbackURL?: string }) => {
    // For dev environments, use email/password with a test account
    const devEmail = "dev@localhost.test";
    const devPassword = "dev-password-123";

    try {
      // Try to sign in with the dev account
      const result = await authClient.signIn.email({
        email: devEmail,
        password: devPassword,
        callbackURL: options?.callbackURL,
      });

      return result;
    } catch (error) {
      // If sign-in fails, try to sign up
      try {
        await authClient.signUp.email({
          email: devEmail,
          password: devPassword,
          name: "Dev User",
        });

        // Then sign in
        return await authClient.signIn.email({
          email: devEmail,
          password: devPassword,
          callbackURL: options?.callbackURL,
        });
      } catch (signUpError) {
        console.error("Dev login failed:", signUpError);
        throw signUpError;
      }
    }
  },
};

export const signOut = authClient.signOut;
