import type { RepairRecord } from '../types/repair'

export interface ExportService {
  exportRecordPdf(record: RepairRecord): Promise<void>
  exportRecordsExcel(records: RepairRecord[]): Promise<'saved' | 'downloaded' | 'cancelled'>
}

export const pendingExportService: ExportService = {
  async exportRecordPdf() {
    throw new Error('PDF 匯出尚未實作。')
  },
  async exportRecordsExcel() {
    throw new Error('Excel 匯出尚未實作。')
  },
}

export const browserExportService: ExportService = {
  async exportRecordPdf(record) {
    const frame = document.createElement('iframe')

    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed; width:0; height:0; border:0; visibility:hidden;'
    document.body.append(frame)

    const printDocument = frame.contentDocument
    const printWindow = frame.contentWindow

    if (!printDocument || !printWindow) {
      frame.remove()
      throw new Error('無法建立列印文件。')
    }

    const cleanup = () => window.setTimeout(() => frame.remove(), 0)
    printWindow.addEventListener('afterprint', cleanup, { once: true })
    printDocument.write(buildRepairPrintHtml(record))
    printDocument.close()
    window.setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 0)
  },
  async exportRecordsExcel(records) {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const recordsSheet = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...buildRepairExportRows(records)])
    const chargesSheet = XLSX.utils.aoa_to_sheet([CHARGE_HEADERS, ...buildChargeExportRows(records)])

    recordsSheet['!cols'] = [
      { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 22 }, { wch: 32 }, { wch: 28 }, { wch: 12 }, { wch: 14 },
    ]
    chargesSheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(workbook, recordsSheet, '維修紀錄')
    XLSX.utils.book_append_sheet(workbook, chargesSheet, '收費明細')
    const filename = `repair-records-${new Date().toISOString().slice(0, 10)}.xlsx`
    const saveResult = await saveWorkbookWithPicker(XLSX, workbook, filename)

    if (saveResult) {
      return saveResult
    }

    XLSX.writeFile(workbook, filename, { compression: true })
    return 'downloaded'
  },
}

interface BrowserFileHandle {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>
    close(): Promise<void>
  }>
}

type SaveFilePicker = (options: {
  suggestedName: string
  types: Array<{ description: string; accept: Record<string, string[]> }>
}) => Promise<BrowserFileHandle>

async function saveWorkbookWithPicker(
  XLSX: typeof import('xlsx'),
  workbook: import('xlsx').WorkBook,
  filename: string,
): Promise<'saved' | 'cancelled' | null> {
  const saveFilePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker

  if (!saveFilePicker) {
    return null
  }

  try {
    const fileHandle = await saveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: 'Excel 活頁簿',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
        },
      ],
    })
    const writable = await fileHandle.createWritable()
    const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer

    await writable.write(new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    await writable.close()
    return 'saved'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'cancelled'
    }

    return null
  }
}

const EXPORT_HEADERS = [
    '收到日期',
    '回送地點',
    '客戶姓名',
    '製造號碼',
    '出貨日期',
    '購買屬性',
    '維修日期',
    '故障分類',
    '故障零件',
    '維修內容',
    '備註',
    '送回日期',
    '總金額',
]

const CHARGE_HEADERS = ['製造號碼', '收到日期', '收費項目', '金額']

export function buildRepairExportRows(records: RepairRecord[]): Array<Array<string | number>> {
  return records.map((record) => [
    record.receivedDate,
    record.returnLocation,
    record.customerName,
    record.serialNumber,
    record.shippedDate,
    record.purchaseType,
    record.repairDate,
    record.faultCategory,
    record.faultParts.join('、'),
    record.repairContent,
    record.note,
    record.returnedDate,
    record.charges.reduce((total, charge) => total + charge.amount, 0),
  ])
}

function buildChargeExportRows(records: RepairRecord[]): Array<Array<string | number>> {
  return records.flatMap((record) =>
    record.charges.map((charge) => [record.serialNumber, record.receivedDate, charge.label, charge.amount]),
  )
}

function buildRepairPrintHtml(record: RepairRecord): string {
  const total = record.charges.reduce((sum, charge) => sum + charge.amount, 0)
  const charges = record.charges
    .map((charge) => `<tr><td>${escapeHtml(charge.label)}</td><td>${charge.amount.toLocaleString()} 元</td></tr>`)
    .join('')
  const attachments = record.attachments
    .map((attachment) => `<li>${escapeHtml(attachment.label)} - ${escapeHtml(attachment.fileName)}</li>`)
    .join('')

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>維修紀錄 ${escapeHtml(record.serialNumber)}</title>
  <style>
    body { font-family: system-ui, "Noto Sans TC", sans-serif; margin: 32px; color: #172033; }
    h1 { margin: 0 0 20px; }
    section { margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d8dee9; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { width: 140px; background: #f5f7fb; }
  </style>
</head>
<body>
  <h1>維修紀錄</h1>
  <section>
    <table>
      <tr><th>收到日期</th><td>${escapeHtml(record.receivedDate)}</td></tr>
      <tr><th>回送地點</th><td>${escapeHtml(record.returnLocation)}</td></tr>
      <tr><th>客戶姓名</th><td>${escapeHtml(record.customerName)}</td></tr>
      <tr><th>製造號碼</th><td>${escapeHtml(record.serialNumber)}</td></tr>
      <tr><th>出貨日期</th><td>${escapeHtml(record.shippedDate)}</td></tr>
      <tr><th>維修日期</th><td>${escapeHtml(record.repairDate)}</td></tr>
      <tr><th>故障分類</th><td>${escapeHtml(record.faultCategory)}</td></tr>
      <tr><th>故障零件</th><td>${escapeHtml(record.faultParts.join('、'))}</td></tr>
      <tr><th>維修內容</th><td>${escapeHtml(record.repairContent)}</td></tr>
      <tr><th>備註</th><td>${escapeHtml(record.note)}</td></tr>
      <tr><th>送回日期</th><td>${escapeHtml(record.returnedDate)}</td></tr>
    </table>
  </section>
  <section>
    <h2>收費內容</h2>
    <table>${charges}<tr><th>總金額</th><td>${total.toLocaleString()} 元</td></tr></table>
  </section>
  <section>
    <h2>附件清單</h2>
    <ul>${attachments || '<li>無附件</li>'}</ul>
  </section>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
