import { describe, expect, it } from 'vitest'
import type { RepairAttachment } from '../../types/repair'
import { getAttachmentSyncStatusLabel } from './attachmentRules'

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
