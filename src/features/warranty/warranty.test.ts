import { describe, expect, it } from 'vitest'
import { getWarrantyStatus } from './warranty'

describe('保固期判斷', () => {
  it('收到日期與出貨日期相差 395 天以內為保固期內', () => {
    expect(getWarrantyStatus('2026-01-31', '2025-01-01')).toBe('保固期內')
  })

  it('收到日期與出貨日期相差超過 395 天為超過保固期', () => {
    expect(getWarrantyStatus('2026-02-01', '2025-01-01')).toBe('超過保固期')
  })

  it('任一日期未填時尚待確認', () => {
    expect(getWarrantyStatus('2026-01-01', '')).toBe('尚待確認')
  })

  it('日期尚未完整輸入時尚待確認', () => {
    expect(getWarrantyStatus('2026', '2025-01-01')).toBe('尚待確認')
  })
})
