import type { RepairRecord } from '../types/repair'

export interface ExportService {
  exportRecordPdf(record: RepairRecord): Promise<void>
  exportRecordsExcel(records: RepairRecord[]): Promise<void>
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
    const printWindow = window.open('', '_blank', 'noopener,noreferrer')

    if (!printWindow) {
      throw new Error('瀏覽器阻擋了列印視窗。')
    }

    printWindow.document.write(buildRepairPrintHtml(record))
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  },
  async exportRecordsExcel(records) {
    const csv = buildRepairCsv(records)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `repair-records-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  },
}

function buildRepairCsv(records: RepairRecord[]): string {
  const header = [
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
  const rows = records.map((record) => [
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
    record.charges.reduce((total, charge) => total + charge.amount, 0).toString(),
  ])

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')
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

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
