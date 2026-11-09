/**
 * @fileoverview Route tests for /api/wallet/info, the endpoint behind the
 * sidebar's Crypto Wallet page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET } from '../info/route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>
const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'

function setupDb(wallets: unknown[]) {
  const fake = createFakeDb({ query: { walletAddresses: { findMany: wallets } } })
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const request = () => jsonRequest('http://localhost/api/wallet/info', 'GET')

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
})

describe('GET /api/wallet/info', () => {
  it('answers 401 when signed out', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb([])
    const res = await GET(request())
    expect(res.status).toBe(401)
  })

  it('answers 200 with null when the user has no linked wallet', async () => {
    setupDb([])
    const res = await GET(request())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toBeNull()
  })

  it('returns the primary wallet and the full list', async () => {
    setupDb([
      { address: A, chainId: 1, isPrimary: false },
      { address: B, chainId: 8453, isPrimary: true },
    ])
    const res = await GET(request())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      address: B,
      chainId: 8453,
      wallets: [
        { address: A, chainId: 1, isPrimary: false },
        { address: B, chainId: 8453, isPrimary: true },
      ],
    })
  })
})
