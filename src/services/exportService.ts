import type { RepairRecord } from '../types/repair'
import { getPurchaseTypeLabel } from '../features/repair/purchaseType'
import { getWarrantyStatus } from '../features/warranty/warranty'

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
    if (!isMobileDevice()) {
      await printPdfOnDesktop(record)
      return
    }

    const source = createPdfExportElement(await buildRepairPrintHtml(record))
    const filename = `${getPdfExportTitle(record)}.pdf`

    try {
      await waitForPdfSourceReady(source.element)
      const pdfBlob = await renderMobilePdf(source.element)

      await sharePdfWithMobileApps(pdfBlob, filename)
    } finally {
      source.dispose()
    }
  },
  async exportRecordsExcel(records) {
    const XLSX = await import('xlsx-js-style')
    const workbook = XLSX.utils.book_new()
    const repairRows = buildRepairExportRows(records)
    const chargeRows = buildChargeExportRows(records)
    const recordsSheet = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...repairRows])
    const chargesSheet = XLSX.utils.aoa_to_sheet([CHARGE_HEADERS, ...chargeRows])

    recordsSheet['!cols'] = REPAIR_EXPORT_COLUMNS
    configureRepairExportLayout(XLSX, recordsSheet, repairRows)
    chargesSheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 14 }]
    configureCenteredSheetLayout(XLSX, chargesSheet, CHARGE_HEADERS.length, chargeRows.length)
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

const PDF_PAGE_WIDTH_MM = 210
const PDF_PAGE_HEIGHT_MM = 297
const PDF_PAGE_MARGIN_MM = 10
const PDF_RENDER_WIDTH_PX = 794

/**
 * 行動瀏覽器對單一超長 canvas 的尺寸與記憶體限制很低。將報告切成 A4 高度的
 * 小 canvas 再逐頁寫入 PDF，可避免 html2pdf 在手機上產生看似有效的空白檔案。
 */
async function renderMobilePdf(source: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  const contentWidthMm = PDF_PAGE_WIDTH_MM - PDF_PAGE_MARGIN_MM * 2
  const contentHeightMm = PDF_PAGE_HEIGHT_MM - PDF_PAGE_MARGIN_MM * 2
  const sourceWidth = Math.max(Math.ceil(source.getBoundingClientRect().width), PDF_RENDER_WIDTH_PX)
  const pageHeightPx = Math.floor((sourceWidth * contentHeightMm) / contentWidthMm)
  const sourceHeight = Math.ceil(source.scrollHeight)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })

  for (let offset = 0; offset < sourceHeight; offset += pageHeightPx) {
    const renderHeight = Math.min(pageHeightPx, sourceHeight - offset)
    const canvas = await html2canvas(source, {
      backgroundColor: '#ffffff',
      height: renderHeight,
      logging: false,
      scale: 1,
      useCORS: true,
      width: sourceWidth,
      windowHeight: renderHeight,
      windowWidth: sourceWidth,
      x: 0,
      y: offset,
    })

    if (!canvasContainsReportContent(canvas)) {
      throw new Error('手機瀏覽器未能繪製 PDF 內容，請改用 Chrome 或 Safari 後重試。')
    }

    if (offset > 0) {
      pdf.addPage()
    }

    const imageHeightMm = (renderHeight * contentWidthMm) / sourceWidth
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', PDF_PAGE_MARGIN_MM, PDF_PAGE_MARGIN_MM, contentWidthMm, imageHeightMm)
  }

  return pdf.output('blob')
}

function canvasContainsReportContent(canvas: HTMLCanvasElement): boolean {
  const pixels = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, canvas.width, canvas.height).data

  if (!pixels) {
    return false
  }

  for (let index = 0; index < pixels.length; index += 16) {
    const [red, green, blue, alpha] = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]

    if (alpha > 0 && (red < 240 || green < 240 || blue < 240)) {
      return true
    }
  }

  return false
}

async function printPdfOnDesktop(record: RepairRecord): Promise<void> {
  const frame = document.createElement('iframe')
  const originalTitle = document.title
  const printTitle = getPdfExportTitle(record)

  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed; width:0; height:0; border:0; visibility:hidden;'
  document.body.append(frame)

  const printDocument = frame.contentDocument
  const printWindow = frame.contentWindow

  if (!printDocument || !printWindow) {
    frame.remove()
    throw new Error('無法建立列印文件。')
  }

  const cleanup = () => {
    document.title = originalTitle
    window.setTimeout(() => frame.remove(), 0)
  }

  printWindow.addEventListener('afterprint', cleanup, { once: true })

  try {
    printDocument.write(await buildRepairPrintHtml(record))
    printDocument.close()
    document.title = printTitle
    window.setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 0)
  } catch (error) {
    cleanup()
    throw error
  }
}

function isMobileDevice(): boolean {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent)
  const iPadDesktopUserAgent = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1

  return mobileUserAgent || iPadDesktopUserAgent
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
  XLSX: typeof import('xlsx-js-style'),
  workbook: import('xlsx-js-style').WorkBook,
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
    '機器屬性',
    '維修日期',
    '故障分類',
    '保固期判斷',
    '故障零件',
    '維修內容',
    '備註',
    '送回日期',
    '維修總金額',
]

const CHARGE_HEADERS = ['製造號碼', '收到日期', '收費項目', '金額']

export const REPAIR_EXPORT_COLUMNS = [
  { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 47 }, { wch: 27 }, { wch: 12 }, { wch: 14 },
]

const THIN_CELL_BORDER = {
  top: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
}

const REPAIR_CONTENT_COLUMN = 10
const NOTE_COLUMN = 11

export function buildRepairExportRows(records: RepairRecord[]): Array<Array<string | number>> {
  return records.map((record) => [
    record.receivedDate,
    record.returnLocation,
    record.customerName,
    record.serialNumber,
    record.shippedDate,
    getPurchaseTypeLabel(record.purchaseType),
    record.repairDate,
    record.faultCategory,
    getWarrantyStatus(record.receivedDate, record.shippedDate),
    record.faultParts.join('、'),
    record.repairContent,
    record.note,
    record.returnedDate,
    record.charges.reduce((total, charge) => total + charge.amount, 0),
  ])
}

export function buildChargeExportRows(records: RepairRecord[]): Array<Array<string | number>> {
  return records.flatMap((record) =>
    record.charges
      .filter((charge) => charge.amount !== 0)
      .map((charge) => [record.serialNumber, record.receivedDate, charge.label, charge.amount]),
  )
}

function configureRepairExportLayout(
  XLSX: typeof import('xlsx-js-style'),
  sheet: import('xlsx-js-style').WorkSheet,
  rows: Array<Array<string | number>>,
): void {
  for (let column = 0; column < EXPORT_HEADERS.length; column += 1) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })]

    if (headerCell) {
      headerCell.s = {
        alignment: { horizontal: 'center', vertical: 'center' },
        border: THIN_CELL_BORDER,
      }
    }
  }

  sheet['!rows'] = [{ hpt: 20 }]

  rows.forEach((row, index) => {
    const repairContent = normalizeExcelText(String(row[REPAIR_CONTENT_COLUMN] ?? ''))
    const note = normalizeExcelText(String(row[NOTE_COLUMN] ?? ''))

    for (let column = 0; column < EXPORT_HEADERS.length; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: column })]

      if (!cell) {
        continue
      }

      const isLongTextColumn = column === REPAIR_CONTENT_COLUMN || column === NOTE_COLUMN

      if (column === REPAIR_CONTENT_COLUMN) {
        cell.v = repairContent
        cell.w = repairContent
      }

      if (column === NOTE_COLUMN) {
        cell.v = note
        cell.w = note
      }

      cell.s = {
        alignment: {
          horizontal: isLongTextColumn ? 'left' : 'center',
          vertical: 'center',
          wrapText: isLongTextColumn,
        },
        border: THIN_CELL_BORDER,
      }
    }

  })
}

function configureCenteredSheetLayout(
  XLSX: typeof import('xlsx-js-style'),
  sheet: import('xlsx-js-style').WorkSheet,
  columnCount: number,
  rowCount: number,
): void {
  for (let row = 0; row <= rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]

      if (cell) {
        cell.s = {
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_CELL_BORDER,
        }
      }
    }
  }
}

export function normalizeExcelText(value: string): string {
  return value.replace(/\r\n?|\n/g, ' ').trim()
}

export function getPdfExportTitle(record: Pick<RepairRecord, 'returnedDate' | 'customerName'>): string {
  const returnedDate = /^\d{4}-\d{2}-\d{2}$/.test(record.returnedDate)
    ? record.returnedDate.replaceAll('-', '')
    : '未填送回日期'
  const customerName = sanitizeFilenamePart(record.customerName) || '未填客戶'

  return `維修報告_${returnedDate}_${customerName}`
}

export async function buildRepairPrintHtml(record: RepairRecord): Promise<string> {
  const total = record.charges.reduce((sum, charge) => sum + charge.amount, 0)
  const charges = record.charges
    .map((charge) => `<tr><td>${escapeHtml(charge.label)}</td><td>${charge.amount.toLocaleString()} 元</td></tr>`)
    .join('')
  const attachments = (
    await Promise.all(
      record.attachments.map(async (attachment) => {
      const previewUrl = await getAttachmentPreviewUrl(attachment)
      const description = escapeHtml(attachment.label || '未填寫照片說明')

      return previewUrl
        ? `<figure><img src="${escapeHtml(previewUrl)}" alt="${description}" /><figcaption>${description}</figcaption></figure>`
        : `<div class="attachment-fallback">${description} - ${escapeHtml(attachment.fileName)}</div>`
      }),
    )
  ).join('')
  const attachmentsSection = record.attachments.length > 0
    ? `
  <section class="attachments-section">
    <h2>附件清單</h2>
    <div class="attachments">${attachments}</div>
  </section>`
    : ''

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(getPdfExportTitle(record))}</title>
  <style>
    body { font-family: system-ui, "Noto Sans TC", sans-serif; margin: 32px; color: #172033; }
    .report-header { margin: 0 0 20px; }
    .company-name { margin: 0 0 8px; text-align: center; transform: translateY(-1em); font-family: "DFKai-SB", "BiauKai", "標楷體", serif; font-size: 2em; font-weight: 700; }
    h1 { margin: 0; }
    section { margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d8dee9; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { width: 140px; background: #f5f7fb; }
    .attachments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 0; list-style: none; }
    figure { margin: 0; break-inside: avoid; }
    figure img { display: block; width: 100%; max-height: 260px; border: 1px solid #d8dee9; border-radius: 4px; object-fit: contain; }
    figcaption { margin-top: 6px; font-weight: 700; }
    @media print {
      body { margin: 16mm; }
      .attachments { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .attachments-section { break-before: page; page-break-before: always; }
    }
  </style>
</head>
<body>
  <header class="report-header">
    <p class="company-name">庭茂農業生技股份有限公司</p>
    <h1>維修紀錄</h1>
  </header>
  <section>
    <table>
      <tr><th>收到日期</th><td>${escapeHtml(record.receivedDate)}</td></tr>
      <tr><th>回送地點</th><td>${escapeHtml(record.returnLocation)}</td></tr>
      <tr><th>客戶姓名</th><td>${escapeHtml(record.customerName)}</td></tr>
      <tr><th>製造號碼</th><td>${escapeHtml(record.serialNumber)}</td></tr>
      <tr><th>出貨日期</th><td>${escapeHtml(record.shippedDate)}</td></tr>
      <tr><th>機器屬性</th><td>${escapeHtml(getPurchaseTypeLabel(record.purchaseType))}</td></tr>
      <tr><th>維修日期</th><td>${escapeHtml(record.repairDate)}</td></tr>
      <tr><th>故障分類</th><td>${escapeHtml(record.faultCategory)}</td></tr>
      <tr><th>保固期判斷</th><td>${escapeHtml(getWarrantyStatus(record.receivedDate, record.shippedDate))}</td></tr>
      <tr><th>故障零件</th><td>${escapeHtml(record.faultParts.join('、'))}</td></tr>
      <tr><th>維修內容</th><td>${escapeHtml(record.repairContent)}</td></tr>
      <tr><th>備註</th><td>${escapeHtml(record.note)}</td></tr>
      <tr><th>送回日期</th><td>${escapeHtml(record.returnedDate)}</td></tr>
    </table>
  </section>
  <section>
    <h2>收費內容</h2>
    <table>${charges}<tr><th>維修總金額</th><td>${total.toLocaleString()} 元</td></tr></table>
  </section>
${attachmentsSection}
</body>
</html>`
}

async function getAttachmentPreviewUrl(recordAttachment: RepairRecord['attachments'][number]): Promise<string | undefined> {
  if (recordAttachment.previewUrl) {
    return recordAttachment.previewUrl
  }

  if (!recordAttachment.driveFileId) {
    return undefined
  }

  try {
    const { getGoogleDriveAttachmentPreviewDataUrl } = await import('./googleDriveAttachmentService')

    return await getGoogleDriveAttachmentPreviewDataUrl(recordAttachment)
  } catch {
    return undefined
  }
}

function createPdfExportElement(printHtml: string): { element: HTMLElement; dispose: () => void } {
  const printDocument = new DOMParser().parseFromString(printHtml, 'text/html')
  const element = document.createElement('article')
  const style = document.createElement('style')
  const printStyles = printDocument.querySelector('style')?.textContent ?? ''

  element.id = 'pdf-export-source'
  element.innerHTML = printDocument.body.innerHTML
  element.style.cssText = 'position:fixed; left:0; top:0; z-index:2147483647; width:794px; min-height:1123px; box-sizing:border-box; background:#ffffff; color:#172033; overflow:auto;'
  style.textContent = printStyles.replaceAll('body', '#pdf-export-source')
  element.prepend(style)
  document.body.append(element)

  return {
    element,
    dispose: () => element.remove(),
  }
}

async function waitForPdfSourceReady(source: HTMLElement): Promise<void> {
  const images = Array.from(source.querySelectorAll('img'))

  await Promise.all(images.map((image) => waitForImageOrTimeout(image, 5_000)))
  await Promise.race([
    document.fonts.ready,
    new Promise<void>((resolve) => window.setTimeout(resolve, 1_500)),
  ])
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())))
}

function waitForImageOrTimeout(image: HTMLImageElement, timeoutMs: number): Promise<void> {
  if (image.complete) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(resolve, timeoutMs)
    const finish = () => {
      window.clearTimeout(timeoutId)
      resolve()
    }

    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
  })
}

async function sharePdfWithMobileApps(pdfBlob: Blob, filename: string): Promise<void> {
  const pdfHeader = new TextDecoder().decode(await pdfBlob.slice(0, 5).arrayBuffer())

  if (pdfBlob.size === 0 || pdfHeader !== '%PDF-') {
    throw new Error('PDF 產生失敗，請稍後再試。')
  }

  const file = new File([pdfBlob], filename, { type: 'application/pdf' })
  const shareNavigator = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }

  if (!shareNavigator.share || !shareNavigator.canShare?.({ files: [file] })) {
    throw new Error('此手機瀏覽器不支援將 PDF 交由其他應用程式開啟，請改用 Chrome 或 Safari。')
  }

  try {
    await shareNavigator.share({ files: [file], title: filename })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    throw new Error('無法開啟 PDF 應用程式選擇視窗，請稍後再試。', { cause: error })
  }
}

function sanitizeFilenamePart(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]/g, '_')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
