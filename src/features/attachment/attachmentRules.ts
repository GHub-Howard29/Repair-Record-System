import type { RepairAttachment } from '../../types/repair'

export const MAX_ATTACHMENT_COUNT = 5
export const MAX_ATTACHMENT_SIZE = 1.5 * 1024 * 1024

const ATTACHMENT_LABELS = ['附件一', '附件二', '附件三', '附件四', '附件五']

export function getAttachmentLabel(index: number): string {
  return ATTACHMENT_LABELS[index] ?? `附件${index + 1}`
}

export function canAddAttachment(attachments: RepairAttachment[]): boolean {
  return attachments.length < MAX_ATTACHMENT_COUNT
}

export function validateAttachmentFile(file: File, attachments: RepairAttachment[], replacing = false): string | null {
  if (!file.type.startsWith('image/')) {
    return '僅支援圖片格式。'
  }

  if (!replacing && !canAddAttachment(attachments)) {
    return '每筆維修紀錄最多五張附件。'
  }

  return null
}

export async function createAttachmentFromFile(file: File, index: number): Promise<RepairAttachment> {
  const compressedResult =
    file.size > MAX_ATTACHMENT_SIZE ? await compressImage(file, MAX_ATTACHMENT_SIZE) : await readFileAsDataUrl(file)

  return {
    id: crypto.randomUUID(),
    label: getAttachmentLabel(index),
    fileName: file.name,
    size: compressedResult.size,
    mimeType: compressedResult.mimeType,
    compressed: compressedResult.compressed,
    previewUrl: compressedResult.dataUrl,
    syncStatus: 'local',
    createdAt: new Date().toISOString(),
  }
}

export function relabelAttachments(attachments: RepairAttachment[]): RepairAttachment[] {
  return attachments.map((attachment, index) => ({
    ...attachment,
    label: getAttachmentLabel(index),
  }))
}

interface AttachmentImageResult {
  dataUrl: string
  size: number
  mimeType: string
  compressed: boolean
}

async function compressImage(file: File, maxSize: number): Promise<AttachmentImageResult> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('瀏覽器不支援圖片壓縮。')
  }

  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let quality = 0.9
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  let size = estimateDataUrlSize(dataUrl)

  while (size > maxSize && quality > 0.45) {
    quality -= 0.08
    dataUrl = canvas.toDataURL('image/jpeg', quality)
    size = estimateDataUrlSize(dataUrl)
  }

  return {
    dataUrl,
    size,
    mimeType: 'image/jpeg',
    compressed: true,
  }
}

async function readFileAsDataUrl(file: File): Promise<AttachmentImageResult> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('無法讀取附件。'))
    reader.readAsDataURL(file)
  })

  return {
    dataUrl,
    size: file.size,
    mimeType: file.type,
    compressed: false,
  }
}

function estimateDataUrlSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? ''

  return Math.ceil((base64.length * 3) / 4)
}

