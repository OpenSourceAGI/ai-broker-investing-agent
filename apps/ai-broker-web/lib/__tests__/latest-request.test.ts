import { describe, it, expect } from 'vitest'
import { createLatestRequest } from '../latest-request'

describe('createLatestRequest', () => {
  it('the most recent request is current', () => {
    const guard = createLatestRequest()
    const id = guard.start()
    expect(guard.isCurrent(id)).toBe(true)
  })

  it('a request superseded by a newer one is no longer current', () => {
    const guard = createLatestRequest()
    const first = guard.start()
    const second = guard.start()
    expect(guard.isCurrent(first)).toBe(false)
    expect(guard.isCurrent(second)).toBe(true)
  })

  it('invalidate() makes an in-flight request stale', () => {
    const guard = createLatestRequest()
    const id = guard.start()
    guard.invalidate()
    expect(guard.isCurrent(id)).toBe(false)
  })
})
