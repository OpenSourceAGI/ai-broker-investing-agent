import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { summarizeWallets } from "crypto-wallet/wallet"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { walletAddresses } from "@/lib/db/schema"

/**
 * GET /api/wallet/info
 * The signed-in user's primary wallet and every wallet linked through
 * Sign-In with Ethereum, or `null` when none is linked. Read by `<WalletInfo />`
 * from `crypto-wallet/components`.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await db.query.walletAddresses.findMany({
      where: eq(walletAddresses.userId, session.user.id),
    })
    // No linked wallet is a normal state for a signed-in user, not a missing
    // resource: answer 200 with `null` so the browser doesn't log a failed
    // request on every page load. `<WalletInfo />` renders its fallback for it.
    return NextResponse.json(summarizeWallets(rows) ?? null)
  } catch (error) {
    console.error("Error fetching wallet info:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
