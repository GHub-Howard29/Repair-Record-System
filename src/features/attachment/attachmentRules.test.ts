import { describe, expect, it } from 'vitest'
import type { RepairAttachment } from '../../types/repair'
import { canAddAttachment, getAttachmentSyncStatusLabel, MAX_ATTACHMENT_COUNT, sortAttachmentsForPrint } from './attachmentRules'

function attachment(overrides: Partial<RepairAttachment> = {}): RepairAttachment {
  return {
    id: 'attachment-1',
    label: '維修前',
    fileName: 'repair.jpg',
    size: 1024,
    mimeType: 'image/jpeg',
    compressed: false,
    syncStatus: 'local',
    createdAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('附件同步狀態文字', () => {
  it('本機持有照片時顯示尚未上傳至雲端', () => {
    expect(getAttachmentSyncStatusLabel(attachment({ previewUrl: 'data:image/jpeg;base64,abc' })))
      .toBe('尚未上傳至雲端')
  })

  it('其他裝置沒有照片內容時標示照片保留於來源裝置', () => {
    expect(getAttachmentSyncStatusLabel(attachment()))
      .toBe('尚未上傳至雲端（照片保留於來源裝置）')
  })

  it.each([
    ['pending', '等待同步'],
    ['syncing', '同步中'],
    ['synced', '已完成同步'],
    ['failed', '同步失敗'],
  ] as const)('%s 狀態顯示 %s', (syncStatus, label) => {
    expect(getAttachmentSyncStatusLabel(attachment({ syncStatus }))).toBe(label)
  })
})

describe('附件數量與列印排序', () => {
  it('最多可加入六張附件', () => {
    const attachments = Array.from({ length: MAX_ATTACHMENT_COUNT }, (_, index) => attachment({ id: `attachment-${index}` }))

    expect(canAddAttachment(attachments.slice(0, -1))).toBe(true)
    expect(canAddAttachment(attachments)).toBe(false)
  })

  it('列印時依維修前、維修中、維修後、其他排序，並保留同類儲存順序', () => {
    const sorted = sortAttachmentsForPrint([
      attachment({ id: 'during-a', label: '維修中' }),
      attachment({ id: 'before-a', label: '維修前' }),
      attachment({ id: 'other-a', label: '自訂說明' }),
      attachment({ id: 'during-b', label: '維修中' }),
      attachment({ id: 'before-b', label: '維修前' }),
    ])

    expect(sorted.map(({ id }) => id)).toEqual(['before-a', 'before-b', 'during-a', 'during-b', 'other-a'])
  })
})
