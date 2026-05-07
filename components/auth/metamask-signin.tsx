"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { authClient, useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Loader2, Wallet } from "lucide-react"
import { BrowserProvider } from "ethers"
import { SiweMessage } from "siwe"

export function MetaMaskSignIn() {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMetaMask, setHasMetaMask] = useState(false)

  useEffect(() => {
    if (session?.user) {
      fetch('/api/user/check-survey')
        .then(r => r.json())
        .then(data => router.push(data.hasCompletedSurvey ? "/" : "/survey"))
        .catch(() => router.push("/survey"))
    }
    if (typeof window !== "undefined") {
      setHasMetaMask(!!window.ethereum)
    }
  }, [session, router])

  const handleMetaMaskLogin = async () => {
    try {
      setLoading(true)
      setError(null)

      // Check if MetaMask is installed
      if (!window.ethereum) {
        setError("MetaMask not installed. Please install MetaMask to continue.")
        window.open("https://metamask.io/download/", "_blank")
        return
      }

      // Request wallet connection
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)

      // Step 1: Get nonce from backend
      const nonceResponse = await authClient.siwe.nonce({
        walletAddress: address,
        chainId: chainId,
      })

      if (nonceResponse.error || !nonceResponse.data?.nonce) {
        console.error("Failed to get nonce:", nonceResponse.error)
        throw new Error("Failed to generate nonce")
      }

      const nonce = nonceResponse.data.nonce

      // Step 2: Create SIWE message using the siwe library
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in with Ethereum to the app.",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      })

      const preparedMessage = message.prepareMessage()

      // Step 3: Sign message with MetaMask
      const signature = await signer.signMessage(preparedMessage)

      // Step 4: Verify signature on backend
      const { data, error: verifyError } = await authClient.siwe.verify({
        message: preparedMessage,
        signature,
        walletAddress: address,
        chainId: chainId,
      })

      if (verifyError) {
        throw new Error(verifyError.message || "Verification failed")
      }

      if (data) {
        router.refresh()
        try {
          const surveyResponse = await fetch('/api/user/check-survey')
          const surveyData = await surveyResponse.json()
          router.push(surveyData.hasCompletedSurvey ? "/" : "/survey")
        } catch {
          router.push("/survey")
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      setError(errorMessage)
      console.error("Login error:", err)
    } finally {
      setLoading(false)
    }
  }

  if (session?.user) {
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        onClick={handleMetaMaskLogin}
        size="lg"
        className="w-full"
        disabled={loading || !hasMetaMask}
        variant="outline"
      >
        {loading ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <Wallet className="mr-2 h-5 w-5" />
        )}
        {hasMetaMask ? "Sign in with MetaMask" : "Install MetaMask"}
      </Button>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {!hasMetaMask && (
        <p className="text-muted-foreground text-xs text-center">
          MetaMask extension not detected. Click above to install.
        </p>
      )}
    </div>
  )
}
