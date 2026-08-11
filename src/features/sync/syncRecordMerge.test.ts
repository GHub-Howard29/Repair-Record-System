import { describe, expect, it } from 'vitest'
import type { RepairRecord } from '../../types/repair'
import type { SyncTask } from './syncQueue'
import { getCloudRecordsSafeToPersist, mergeCloudRecordsForDisplay } from './syncRecordMerge'

function record(syncStatus: RepairRecord['attachments'][number]['syncStatus']): RepairRecord {
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
    attachments: [{
      id: 'attachment-1',
      label: '維修前',
      fileName: 'attachment.jpg',
      size: 1024,
      mimeType: 'image/jpeg',
      compressed: false,
      previewUrl: syncStatus === 'syncing' ? 'data:image/jpeg;base64,YQ==' : undefined,
      driveFileId: syncStatus === 'synced' ? 'drive-1' : undefined,
      syncStatus,
      createdAt: '2026-08-11T00:00:00.000Z',
    }],
    textSyncStatus: 'synced',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  }
}

function attachmentTask(): SyncTask {
  return {
    id: 'attachment:record-1:attachment-1',
    operationId: 'operation-1',
    kind: 'attachment',
    recordId: 'record-1',
    attachmentId: 'attachment-1',
    attachmentVersion: '2026-08-11T00:00:00.000Z',
    status: 'syncing',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  }
}

describe('Firestore 即時資料合併', () => {
  it('有附件任務時保留本機版本且不允許雲端快照回寫本機', () => {
    const localRecord = record('syncing')
    const cloudRecord = record('synced')
    const tasks = [attachmentTask()]

    expect(mergeCloudRecordsForDisplay([cloudRecord], [localRecord], tasks)).toEqual([localRecord])
    expect(getCloudRecordsSafeToPersist([cloudRecord], [localRecord], tasks)).toEqual([])
  })

  it('任務完成後採用雲端同步狀態並保留本機預覽', () => {
    const localRecord = record('syncing')
    const cloudRecord = record('synced')
    const [mergedRecord] = mergeCloudRecordsForDisplay([cloudRecord], [localRecord], [])

    expect(mergedRecord.attachments[0]).toEqual(expect.objectContaining({
      driveFileId: 'drive-1',
      previewUrl: 'data:image/jpeg;base64,YQ==',
      syncStatus: 'synced',
    }))
    expect(getCloudRecordsSafeToPersist([cloudRecord], [localRecord], [])).toEqual([mergedRecord])
  })
})
