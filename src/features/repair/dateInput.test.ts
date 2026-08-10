import { describe, expect, it } from 'vitest'
import { formatDateInput, getDateInputDraft, toStoredDateValue } from './dateInput'

describe('日期文字輸入', () => {
  it('從尾端輸入時自動補上日期分隔符號', () => {
    expect(getDateInputDraft('20260', '2026', 5)).toBe('2026/0')
    expect(getDateInputDraft('2026/062', '2026/06', 8)).toBe('2026/06/2')
  })

  it('在中間刪除年份數字時保留其餘字元位置', () => {
    expect(getDateInputDraft('202/06/27', '2026/06/27', 3)).toBe('202/06/27')
  })

  it('可在原位置補回單一數字', () => {
    expect(getDateInputDraft('2025/06/27', '202/06/27', 4)).toBe('2025/06/27')
  })

  it('純數字貼上時轉為顯示格式，儲存時轉回 ISO 分隔符號', () => {
    expect(formatDateInput('20250627')).toBe('2025/06/27')
    expect(toStoredDateValue('2025/06/27')).toBe('2025-06-27')
  })
})
