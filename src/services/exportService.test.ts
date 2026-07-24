import { describe, expect, it } from 'vitest'
import { buildChargeExportRows, buildRepairExportRows, buildRepairPrintHtml } from './exportService'
import type { RepairRecord } from '../types/repair'

const record: RepairRecord = {
  id: 'record-1',
  receivedDate: '2026-07-17',
  returnLocation: '台北',
  customerName: '王小明',
  serialNumber: 'NIS-12AB34CD56EF',
  shippedDate: '',
  purchaseType: 'customer',
  repairDate: '',
  faultCategory: '自然損壞',
  faultParts: ['水泵'],
  repairContent: '更換水泵',
  note: '',
  returnedDate: '2026-07-20',
  charges: [
    { id: 'inspection', label: '檢修測試費', amount: 100, kind: 'inspection' },
    { id: 'shipping', label: '運費', amount: 80, kind: 'shipping' },
  ],
  attachments: [],
  textSyncStatus: 'synced',
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
}

describe('Excel 匯出資料', () => {
  it('保留資料欄位並正確計算總金額', () => {
    const [row] = buildRepairExportRows([record])

    expect(row).toEqual([
      '2026-07-17', '台北', '王小明', 'NIS-12AB34CD56EF', '', '客人', '', '自然損壞', '尚待確認', '水泵',
      '更換水泵', '', '2026-07-20', 180,
    ])
  })
})

describe('收費項目匯出', () => {
  it('略過金額為零的檢修費', () => {
    const rows = buildChargeExportRows([{ ...record, charges: [{ id: 'inspection', label: '檢修測試費', amount: 0, kind: 'inspection' }] }])

    expect(rows).toEqual([])
  })
})

describe('列印維修紀錄', () => {
  it('沒有附件時不產生附件清單頁面', async () => {
    const html = await buildRepairPrintHtml(record)

    expect(html).not.toContain('附件清單')
    expect(html).not.toContain('<section class="attachments-section">')
  })

  it('有附件時產生附件清單頁面', async () => {
    const html = await buildRepairPrintHtml({
      ...record,
      attachments: [{
        id: 'attachment-1',
        fileName: 'before.jpg',
        label: '維修前',
        mimeType: 'image/jpeg',
        size: 100,
        compressed: false,
        previewUrl: 'data:image/jpeg;base64,abc',
        syncStatus: 'synced',
        createdAt: '2026-07-17T00:00:00.000Z',
      }],
    })

    expect(html).toContain('附件清單')
    expect(html).toContain('attachments-section')
  })
})
