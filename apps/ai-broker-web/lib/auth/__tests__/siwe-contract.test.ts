import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { siwe } from "better-auth/plugins";

/**
 * components/auth/{siwe,metamask}-signin.tsx call `authClient.siwe.nonce()`
 * with no body and `authClient.siwe.verify({ message, signature })`. They used
 * to send `walletAddress` and `chainId` as well, which better-auth >= 1.7
 * rejects with a 400 because both endpoints validate a strict body — so every
 * wallet sign-in failed at "Failed to generate nonce". This pins that contract
 * so an upgrade that changes it shows up here rather than in production.
 */
function makeAuth() {
  return betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test-secret-at-least-thirty-two-characters",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], walletAddress: [] }),
    plugins: [
      siwe({
        domain: "localhost:3000",
        anonymous: true,
        getNonce: async () => "a1b2c3d4e5f6a7b8",
        verifyMessage: async () => false,
      }),
    ],
    logger: { disabled: true },
  });
}

describe("SIWE endpoint contract", () => {
  it("issues a nonce for a request with no body", async () => {
    const res = await makeAuth().api.getSiweNonce({});

    expect(res.nonce).toBe("a1b2c3d4e5f6a7b8");
  });

  it("rejects the walletAddress/chainId body the sign-in buttons used to send", async () => {
    await expect(
      makeAuth().api.getSiweNonce({
        // @ts-expect-error — the extra keys are exactly what the server refuses.
        body: { walletAddress: "0x0000000000000000000000000000000000000001", chainId: 1 },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
