import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttachmentStorageService } from '../../services/attachmentStorageService'
import type { RepairRecordService } from '../../services/repairRecordService'
import type { RepairAttachment, RepairRecord } from '../../types/repair'
import { processSyncQueue } from './syncProcessor'
import { discardAttachmentSync, enqueueAttachmentSync, loadSyncQueue } from './syncQueue'

function attachment(id: string, createdAt: string): RepairAttachment {
  return {
    id,
    label: '維修前',
    fileName: `${id}.jpg`,
    size: 1024,
    mimeType: 'image/jpeg',
    compressed: false,
    previewUrl: 'data:image/jpeg;base64,YQ==',
    syncStatus: 'pending',
    createdAt,
  }
}

function record(attachments: RepairAttachment[]): RepairRecord {
  return {
    id: 'record-1',
    receivedDate: '2026-08-11',
    returnLocation: '總公司',
    customerName: '測試客戶',
    serialNumber: 'NIS-000000000001',
    shippedDate: '',
    purchaseType: 'customer',
    repairDate: '',
    faultCategory: '',
    faultParts: [],
    repairContent: '',
    note: '',
    returnedDate: '',
    charges: [],
    attachments,
    textSyncStatus: 'pending',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  }
}

function createLocalService(initialRecord: RepairRecord) {
  let records = [initialRecord]
  const service: RepairRecordService = {
    async list() {
      return records
    },
    async save(nextRecord) {
      records = records.map((item) => (item.id === nextRecord.id ? nextRecord : item))
      return records
    },
    async replaceAll(nextRecords) {
      records = nextRecords
      return records
    },
  }

  return { service, getRecords: () => records }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })

  return { promise, resolve }
}

describe('背景附件同步', () => {
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

  it('第一張上傳期間新增第二張，不會被舊同步結果覆蓋', async () => {
    const firstAttachment = attachment('attachment-1', '2026-08-11T00:00:00.000Z')
    const secondAttachment = attachment('attachment-2', '2026-08-11T00:01:00.000Z')
    const local = createLocalService(record([firstAttachment]))
    const firstUpload = deferred<RepairAttachment>()
    let uploadCount = 0
    const attachmentService: AttachmentStorageService = {
      isCloudStorage: true,
      async upload(_recordId, current) {
        uploadCount += 1

        if (uploadCount === 1) {
          return firstUpload.promise
        }

        return { ...current, driveFileId: 'drive-2', driveUrl: 'https://drive/2', syncStatus: 'synced' }
      },
      remove: vi.fn(async () => {}),
    }
    const cloudService: RepairRecordService = {
      list: vi.fn(async () => []),
      save: vi.fn(async (current) => [current]),
      replaceAll: vi.fn(async (records) => records),
    }
    enqueueAttachmentSync([], 'record-1', firstAttachment)
    const processing = processSyncQueue({
      environment: { online: true, connectionType: 'wifi' },
      repairRecordService: cloudService,
      localRepairRecordService: local.service,
      attachmentStorageService: attachmentService,
    })

    await vi.waitFor(() => expect(uploadCount).toBe(1))
    await local.service.save(record([firstAttachment, secondAttachment]))
    enqueueAttachmentSync(loadSyncQueue(), 'record-1', secondAttachment)
    firstUpload.resolve({
      ...firstAttachment,
      driveFileId: 'drive-1',
      driveUrl: 'https://drive/1',
      syncStatus: 'synced',
    })
    await processing

    expect(local.getRecords()[0].attachments).toEqual([
      expect.objectContaining({ id: 'attachment-1', driveFileId: 'drive-1' }),
      expect.objectContaining({ id: 'attachment-2', driveFileId: 'drive-2' }),
    ])
    expect(loadSyncQueue()).toEqual([])
  })

  it('照片上傳途中被刪除時，會清除稍後完成的雲端檔案', async () => {
    const currentAttachment = attachment('attachment-1', '2026-08-11T00:00:00.000Z')
    const local = createLocalService(record([currentAttachment]))
    const upload = deferred<RepairAttachment>()
    const remove = vi.fn(async () => {})
    const attachmentService: AttachmentStorageService = {
      isCloudStorage: true,
      upload: vi.fn(async () => upload.promise),
      remove,
    }
    const cloudService: RepairRecordService = {
      list: vi.fn(async () => []),
      save: vi.fn(async (current) => [current]),
      replaceAll: vi.fn(async (records) => records),
    }
    const tasks = enqueueAttachmentSync([], 'record-1', currentAttachment)
    const processing = processSyncQueue({
      environment: { online: true, connectionType: 'wifi' },
      repairRecordService: cloudService,
      localRepairRecordService: local.service,
      attachmentStorageService: attachmentService,
    })

    await vi.waitFor(() => expect(attachmentService.upload).toHaveBeenCalledOnce())
    await local.service.save(record([]))
    discardAttachmentSync(tasks, 'record-1', currentAttachment.id)
    upload.resolve({ ...currentAttachment, driveFileId: 'drive-1', syncStatus: 'synced' })
    await processing

    expect(remove).toHaveBeenCalledWith('record-1', {
      id: 'attachment-1',
      driveFileId: 'drive-1',
    })
    expect(local.getRecords()[0].attachments).toEqual([])
  })

  it('過期雲端檔案清除失敗時會保留刪除任務', async () => {
    const currentAttachment = attachment('attachment-1', '2026-08-11T00:00:00.000Z')
    const local = createLocalService(record([currentAttachment]))
    const upload = deferred<RepairAttachment>()
    const attachmentService: AttachmentStorageService = {
      isCloudStorage: true,
      upload: vi.fn(async () => upload.promise),
      remove: vi.fn(async () => {
        throw new Error('Drive 暫時無法刪除')
      }),
    }
    const cloudService: RepairRecordService = {
      list: vi.fn(async () => []),
      save: vi.fn(async (current) => [current]),
      replaceAll: vi.fn(async (records) => records),
    }
    const tasks = enqueueAttachmentSync([], 'record-1', currentAttachment)
    const processing = processSyncQueue({
      environment: { online: true, connectionType: 'wifi' },
      repairRecordService: cloudService,
      localRepairRecordService: local.service,
      attachmentStorageService: attachmentService,
    })

    await vi.waitFor(() => expect(attachmentService.upload).toHaveBeenCalledOnce())
    await local.service.save(record([]))
    discardAttachmentSync(tasks, 'record-1', currentAttachment.id)
    upload.resolve({ ...currentAttachment, driveFileId: 'drive-1', syncStatus: 'synced' })
    await processing

    expect(loadSyncQueue()).toEqual([
      expect.objectContaining({
        kind: 'attachment-delete',
        attachmentId: 'attachment-1',
        driveFileId: 'drive-1',
        status: 'failed',
      }),
    ])
  })
})
