export const ATTACHMENT_DELETE_LOCK_MS = 1000

export async function runWithMinimumLock(
  action: () => Promise<void>,
  minimumDurationMs = ATTACHMENT_DELETE_LOCK_MS,
  now = () => Date.now(),
  wait = (durationMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, durationMs)),
): Promise<void> {
  const startedAt = now()

  try {
    await action()
  } finally {
    const remainingDuration = minimumDurationMs - (now() - startedAt)

    if (remainingDuration > 0) {
      await wait(remainingDuration)
    }
  }
}
