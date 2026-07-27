import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discardAttachmentSync,
  enqueueAttachmentDeletionSync,
  enqueueAttachmentSync,
} from './syncQueue'

describe('附件刪除同步佇列', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
    })
  })

  it('儲存刪除後會取消未上傳任務並建立雲端刪除任務', () => {
    const pendingUpload = enqueueAttachmentSync([], 'record-1', 'attachment-1')
    const withoutUpload = discardAttachmentSync(pendingUpload, 'record-1', 'attachment-1')
    const tasks = enqueueAttachmentDeletionSync(withoutUpload, 'record-1', {
      id: 'attachment-1',
      driveFileId: 'drive-file-1',
    })

    expect(tasks).toEqual([
      expect.objectContaining({
        id: 'attachment-delete:record-1:attachment-1',
        kind: 'attachment-delete',
        recordId: 'record-1',
        attachmentId: 'attachment-1',
        driveFileId: 'drive-file-1',
      }),
    ])
  })

  it('尚未上傳 Google Drive 的照片不建立刪除任務', () => {
    const tasks = enqueueAttachmentDeletionSync([], 'record-1', { id: 'attachment-1' })

    expect(tasks).toEqual([])
  })
})
