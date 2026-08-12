export const PWA_INSTALL_DISMISS_STORAGE_KEY = 'repair-record-system.pwa-install-dismissed-at'
export const PWA_INSTALL_INSTALLED_STORAGE_KEY = 'repair-record-system.pwa-installed'
export const PWA_INSTALL_DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function isPwaStandalone(
  displayModeStandalone: boolean,
  navigatorStandalone: boolean | undefined,
): boolean {
  return displayModeStandalone || navigatorStandalone === true
}

export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export function isInstallPromptDismissed(dismissedAt: string | null, now = Date.now()): boolean {
  if (!dismissedAt) {
    return false
  }

  const timestamp = Number(dismissedAt)

  return Number.isFinite(timestamp) && timestamp > 0 && now - timestamp < PWA_INSTALL_DISMISS_DURATION_MS
}
