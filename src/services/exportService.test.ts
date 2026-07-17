import { describe, expect, it } from 'vitest'
import { buildRepairExportRows } from './exportService'
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
      '2026-07-17', '台北', '王小明', 'NIS-12AB34CD56EF', '', 'customer', '', '自然損壞', '水泵',
      '更換水泵', '', '2026-07-20', 180,
    ])
  })
})
