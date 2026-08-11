import { describe, expect, it, vi } from 'vitest'
import { createCoalescingSyncRunner } from './syncRunner'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })

  return { promise, resolve }
}

describe('背景同步啟動器', () => {
  it('同步結束前收到新工作時會再執行一輪', async () => {
    const firstRound = deferred()
    let roundCount = 0
    const runner = createCoalescingSyncRunner({
      async runRound() {
        roundCount += 1

        if (roundCount === 1) {
          await firstRound.promise
        }
      },
      hasTrailingWork: () => false,
    })
    const processing = runner.request()

    await vi.waitFor(() => expect(roundCount).toBe(1))
    void runner.request()
    firstRound.resolve()
    await processing

    expect(roundCount).toBe(2)
  })

  it('持久化佇列在一輪結束後仍有新工作時會繼續處理', async () => {
    let hasPendingWork = false
    let roundCount = 0
    const runner = createCoalescingSyncRunner({
      async runRound() {
        roundCount += 1
        hasPendingWork = roundCount === 1
      },
      hasTrailingWork: () => hasPendingWork,
    })

    await runner.request()

    expect(roundCount).toBe(2)
  })
})
