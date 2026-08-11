export interface CoalescingSyncRunner {
  request(): Promise<void>
}

interface CoalescingSyncRunnerOptions {
  runRound: () => Promise<void>
  hasTrailingWork: () => boolean
  onRunningChange?: (running: boolean) => void
}

export function createCoalescingSyncRunner(options: CoalescingSyncRunnerOptions): CoalescingSyncRunner {
  let activePromise: Promise<void> | null = null
  let requested = false

  async function request(): Promise<void> {
    requested = true

    if (activePromise) {
      return activePromise
    }

    const currentPromise = (async () => {
      options.onRunningChange?.(true)

      do {
        requested = false
        await options.runRound()
      } while (requested || options.hasTrailingWork())
    })()

    activePromise = currentPromise

    try {
      await currentPromise
    } finally {
      if (activePromise === currentPromise) {
        activePromise = null
      }
      options.onRunningChange?.(false)

      if (requested) {
        void request()
      }
    }
  }

  return { request }
}
