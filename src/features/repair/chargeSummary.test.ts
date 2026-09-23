import { describe, expect, it } from 'vitest'
import { buildChargeSummaryItems } from './chargeSummary'

describe('收費摘要', () => {
  it('隱藏金額為零的檢修測試費', () => {
    expect(buildChargeSummaryItems([
      { id: 'inspection', label: '檢修測試費', amount: 0, kind: 'inspection' },
      { id: 'part-water-pump', label: '水泵', amount: 500, kind: 'part' },
    ])).toEqual([{ id: 'part-water-pump', label: '水泵', amount: 500 }])
  })

  it('將金額為零的運費標示為客人自行取回', () => {
    expect(buildChargeSummaryItems([
      { id: 'shipping', label: '運費', amount: 0, kind: 'shipping' },
    ])).toEqual([{ id: 'shipping', label: '客人自行取回' }])
  })
})
