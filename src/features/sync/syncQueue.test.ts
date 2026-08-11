import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discardAttachmentSync,
  enqueueAttachmentDeletionSync,
  enqueueAttachmentSync,
  removeSyncTask,
} from './syncQueue'

describe('附件刪除同步佇列', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      },
    })
  })

  it('儲存刪除後會取消未上傳任務並建立雲端刪除任務', () => {
    const pendingUpload = enqueueAttachmentSync([], 'record-1', {
      id: 'attachment-1',
      createdAt: '2026-08-11T00:00:00.000Z',
    })
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

  it('舊同步結果不會移除同一附件較新的上傳任務', () => {
    const firstTasks = enqueueAttachmentSync([], 'record-1', {
      id: 'attachment-1',
      createdAt: '2026-08-11T00:00:00.000Z',
    })
    const oldTask = firstTasks[0]
    const replacedTasks = enqueueAttachmentSync(firstTasks, 'record-1', {
      id: 'attachment-1',
      createdAt: '2026-08-11T00:01:00.000Z',
    })
    const remainingTasks = removeSyncTask(oldTask.id, oldTask.operationId)

    expect(remainingTasks).toEqual(replacedTasks)
    expect(remainingTasks[0].attachmentVersion).toBe('2026-08-11T00:01:00.000Z')
  })
})
