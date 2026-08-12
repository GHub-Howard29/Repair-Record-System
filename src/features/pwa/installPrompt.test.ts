import { describe, expect, it } from 'vitest'
import {
  isInstallPromptDismissed,
  isIosDevice,
  isPwaStandalone,
  PWA_INSTALL_DISMISS_DURATION_MS,
} from './installPrompt'

describe('PWA 安裝提示', () => {
  it('辨識 display-mode 與 iOS standalone 模式', () => {
    expect(isPwaStandalone(true, false)).toBe(true)
    expect(isPwaStandalone(false, true)).toBe(true)
    expect(isPwaStandalone(false, false)).toBe(false)
  })

  it('辨識 iPhone、iPad 與使用桌面識別字串的 iPad', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone)', 'iPhone', 5)).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5)).toBe(false)
  })

  it('關閉後 30 天內不再顯示，期限過後可再次顯示', () => {
    const now = Date.UTC(2026, 7, 12)

    expect(isInstallPromptDismissed(String(now - PWA_INSTALL_DISMISS_DURATION_MS + 1), now)).toBe(true)
    expect(isInstallPromptDismissed(String(now - PWA_INSTALL_DISMISS_DURATION_MS), now)).toBe(false)
    expect(isInstallPromptDismissed('invalid', now)).toBe(false)
  })
})
