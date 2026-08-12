import { describe, expect, it } from 'vitest'
import type { RepairRecord } from '../../types/repair'
import { filterRepairRecords, hasRecordSearchFilters, type RecordSearchFilters } from './recordSearch'

function record(id: string, faultParts: string[], returnedDate = ''): RepairRecord {
  return {
    id,
    receivedDate: '2026-08-12',
    returnLocation: '總公司',
    customerName: '測試客戶',
    serialNumber: `NIS-${id}`,
    shippedDate: '',
    purchaseType: 'customer',
    repairDate: '',
    faultCategory: '自然損壞',
    faultParts,
    repairContent: '',
    note: '',
    returnedDate,
    charges: [],
    attachments: [],
    textSyncStatus: 'synced',
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  }
}

const baseFilters: RecordSearchFilters = {
  searchText: '',
  startDate: '',
  endDate: '',
  faultPart: '',
  status: 'active',
  statusExplicit: false,
}

describe('維修紀錄更換零件查詢', () => {
  it('只顯示包含所選故障零件的歷史紀錄', () => {
    const records = [
      record('PUMP', ['水泵'], '2026-08-12'),
      record('BOARD', ['控制板'], '2026-08-12'),
      record('BOTH', ['水泵', '控制板']),
    ]

    expect(filterRepairRecords(records, { ...baseFilters, faultPart: '水泵' }).map((item) => item.id))
      .toEqual(['PUMP', 'BOTH'])
  })

  it('選擇零件時視為查詢條件並預設跨維修狀態搜尋', () => {
    const filters = { ...baseFilters, faultPart: '水泵' }

    expect(hasRecordSearchFilters(filters)).toBe(true)
    expect(filterRepairRecords([
      record('ACTIVE', ['水泵']),
      record('COMPLETED', ['水泵'], '2026-08-12'),
    ], filters).map((item) => item.id)).toEqual(['ACTIVE', 'COMPLETED'])
  })

  it('使用者明確選擇統計狀態後仍套用狀態篩選', () => {
    const records = [
      record('ACTIVE', ['水泵']),
      record('COMPLETED', ['水泵'], '2026-08-12'),
    ]

    expect(filterRepairRecords(records, {
      ...baseFilters,
      faultPart: '水泵',
      status: 'completed',
      statusExplicit: true,
    }).map((item) => item.id)).toEqual(['COMPLETED'])
  })
})
