import { betterAuth } from "better-auth";
import { siwe } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";
import { randomBytes } from "crypto";
import { verifyMessage } from "ethers";
import { SiweMessage } from "siwe";

import { stripe } from "@better-auth/stripe"
import Stripe from "stripe"
import { plans, type Plan } from "../payments/plans";
import { headers } from "next/headers";
import { sendEmail, renderEmailLayout, renderEmailButton } from "../email/send-email";
import { env } from "../../env";
import { serverEnv } from "../env/runtime";

// Lazy Stripe client initialization to avoid build-time errors
let _stripeClient: Stripe | null = null
function getStripeClient() {
  if (!_stripeClient) {
    _stripeClient = new Stripe(serverEnv("STRIPE_SECRET_KEY") || env.STRIPE_SECRET_KEY || 'placeholder', {
      typescript: true
    })
  }
  return _stripeClient
}


// https://buy.stripe.com/5kQfZgcMng3a6Xebelcs800
//

/**
 * Auth configuration resolved from the Worker env (see lib/env/runtime.ts).
 * Reading `process.env` directly at module scope leaves every one of these
 * blank on Workers, which is not a visible failure at boot — it only surfaces
 * later as a 500 from whichever endpoint needed the value.
 */
const appUrl = serverEnv("NEXT_PUBLIC_APP_URL") || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const appDomain =
  (serverEnv("NEXT_PUBLIC_APP_DOMAIN") || env.NEXT_PUBLIC_APP_DOMAIN || appUrl)
    .split("//")
    .pop()
    ?.split("/")[0] || "localhost:3000";
const authSecret = serverEnv("BETTER_AUTH_SECRET") || serverEnv("AUTH_SECRET") || env.BETTER_AUTH_SECRET;
const googleClientId = serverEnv("GOOGLE_CLIENT_ID") || env.GOOGLE_CLIENT_ID;
const googleClientSecret = serverEnv("GOOGLE_CLIENT_SECRET") || env.GOOGLE_CLIENT_SECRET;

if (!authSecret) {
  console.error(
    "BETTER_AUTH_SECRET is not set. Sessions are being signed with a placeholder " +
      "secret and will not survive a redeploy. Set it with `wrangler secret put BETTER_AUTH_SECRET`.",
  );
}

/**
 * Only register Google when both credentials are present. better-auth keeps a
 * provider configured with blank credentials in its provider list and then
 * throws a plain `BetterAuthError` from `createAuthorizationURL`, which
 * better-call reports as an uninformative 500 on POST /api/auth/sign-in/social.
 * Leaving the provider out instead produces better-auth's own
 * "Provider not found" response and logs the reason.
 */
const socialProviders = googleClientId && googleClientSecret
  ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
  : {};

if (!googleClientId || !googleClientSecret) {
  console.error(
    "Google sign-in is disabled: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are " +
      "not both set. Set them with `wrangler secret put <NAME>`.",
  );
}

export const auth = betterAuth({
  baseURL: appUrl,
  // basePath: "/api/auth", // better-auth defaults to this, but keeping it explicit if user wants
  secret: authSecret || "your-secret-key",
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      walletAddress: schema.walletAddresses,
      // @better-auth/stripe subscription model.
      subscription: schema.subscriptions,
    },
  }),
  socialProviders,
  plugins: [
    siwe({
      // Enable anonymous mode so email is not required
      // Users can sign in with just their Ethereum wallet
      anonymous: true,
      domain: appDomain,
      // Extract domain without protocol for email generation
      emailDomainName: appDomain,
      getNonce: async () => {
        // Generate a cryptographically secure random nonce
        return randomBytes(32).toString("hex");
      },
      verifyMessage: async ({ message, signature }) => {
        try {
          // Parse the SIWE message
          const siweMessage = new SiweMessage(message);

          // Verify the signature and get the recovered address
          const recoveredAddress = verifyMessage(message, signature);

          // Check if the recovered address matches the address in the SIWE message
          const isValid = recoveredAddress.toLowerCase() === siweMessage.address.toLowerCase();

          if (!isValid) {
            console.error("Address mismatch:", {
              recovered: recoveredAddress,
              expected: siweMessage.address
            });
          }

          return isValid;
        } catch (error) {
          console.error("Message verification failed:", error);
          return false;
        }
      },
    }),

    stripe({
      get stripeClient() {
        return getStripeClient()
      },
      stripeWebhookSecret: serverEnv("STRIPE_WEBHOOK_SECRET") || env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: plans,
        getCheckoutSessionParams: async ({ user, plan }) => {
          const checkoutSession: {
            params: {
              subscription_data?: {
                trial_period_days: number
              }
            }
          } = {
            params: {}
          }

          if (user.trialAllowed) {
            checkoutSession.params.subscription_data = {
              trial_period_days: (plan as Plan).trialDays
            }
          }

          return checkoutSession
        },
        onSubscriptionComplete: async ({ event }) => {
          const eventDataObject = event.data.object as Stripe.Checkout.Session
          // const userId = eventDataObject.metadata?.userId // Example usage
        }
      }
    })

  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Delivered through Cloudflare Email Workers (SEND_EMAIL binding).
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        text: `Reset your password: ${url}`,
        html: renderEmailLayout(
          "Reset Your Password",
          `
          <p style="font-size: 16px; color: #555;">
            We received a request to reset the password for your account.
          </p>
          ${renderEmailButton("Reset Password", url)}
          <p style="font-size: 14px; color: #888;">
            If you didn't request this, you can safely ignore this email.
          </p>
          `
        ),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // Delivered through Cloudflare Email Workers (SEND_EMAIL binding).
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email address",
        text: `Verify your email: ${url}`,
        html: renderEmailLayout(
          "Verify Your Email",
          `
          <p style="font-size: 16px; color: #555;">
            Welcome! Confirm your email address to finish setting up your account.
          </p>
          ${renderEmailButton("Verify Email", url)}
          <p style="font-size: 14px; color: #888;">
            If you didn't create an account, you can safely ignore this email.
          </p>
          `
        ),
      });
    },
  },
  trustedOrigins: [appUrl],
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 days
    updateAge: 60 * 60 * 24 * 3, // 1 day
  },
});

export type Session = typeof auth.$Infer.Session.session
export type User = typeof auth.$Infer.Session.user



export async function getActiveSubscription() {
  const nextHeaders = await headers()
  const subscriptions = await auth.api.listActiveSubscriptions({
    headers: nextHeaders
  })
  return subscriptions.find((s) => s.status === "active")
}
