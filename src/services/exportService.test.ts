import { describe, expect, it } from 'vitest'
import {
  buildChargeExportRows,
  buildRepairExportRows,
  buildRepairPrintHtml,
  getPdfPageSlices,
  getPdfExportTitle,
  normalizeExcelText,
  REPAIR_EXPORT_COLUMNS,
} from './exportService'
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
  it('保留資料欄位並正確計算維修總金額', () => {
    const [row] = buildRepairExportRows([record])

    expect(row).toEqual([
      '2026-07-17', '台北', '王小明', 'NIS-12AB34CD56EF', '', '門市客人', '', '自然損壞', '尚待確認', '水泵',
      '更換水泵', '', '2026-07-20', 180,
    ])
  })

  it('維修內容與備註使用指定的固定欄寬', () => {
    expect(REPAIR_EXPORT_COLUMNS[10].wch).toBe(47)
    expect(REPAIR_EXPORT_COLUMNS[11].wch).toBe(27)
  })

  it('忽略表單內維修內容與備註原有的換行，交由 Excel 自動換行', () => {
    const normalizedText = normalizeExcelText('第一行備註\r\n第二行備註\r第三行備註')

    expect(normalizedText).toBe('第一行備註 第二行備註 第三行備註')
  })
})

describe('收費項目匯出', () => {
  it('略過所有金額為零的收費紀錄', () => {
    const rows = buildChargeExportRows([{
      ...record,
      charges: [
        { id: 'inspection', label: '檢修測試費', amount: 0, kind: 'inspection' },
        { id: 'shipping', label: '運費', amount: 0, kind: 'shipping' },
        { id: 'part-water-pump', label: '水泵', amount: 300, kind: 'part' },
      ],
    }])

    expect(rows).toEqual([['NIS-12AB34CD56EF', '2026-07-17', '水泵', 300]])
  })
})

describe('列印維修紀錄', () => {
  it('手機 PDF 會在附件清單前強制換頁', () => {
    expect(getPdfPageSlices(2_400, 1_000, [720])).toEqual([
      { offset: 0, height: 720 },
      { offset: 720, height: 1_000 },
      { offset: 1_720, height: 680 },
    ])
  })

  it('手機 PDF 不會在附件照片中間分頁', () => {
    expect(getPdfPageSlices(2_200, 1_000, [700], [{ start: 1_400, end: 1_750 }])).toEqual([
      { offset: 0, height: 700 },
      { offset: 700, height: 700 },
      { offset: 1_400, height: 800 },
    ])
  })

  it('PDF 檔名會包含送回日期與客戶名稱', () => {
    expect(getPdfExportTitle(record)).toBe('維修報告_20260720_王小明')
  })

  it('沒有附件時不產生附件清單頁面', async () => {
    const html = await buildRepairPrintHtml(record)

    expect(html).not.toContain('附件清單')
    expect(html).not.toContain('<section class="attachments-section">')
  })

  it('PDF 標題上方會顯示置中的公司名稱', async () => {
    const html = await buildRepairPrintHtml(record)

    expect(html).toContain('庭茂農業生技股份有限公司')
    expect(html).toContain('font-family: "DFKai-SB", "BiauKai", "標楷體", serif')
    expect(html).toContain('text-align: center')
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
