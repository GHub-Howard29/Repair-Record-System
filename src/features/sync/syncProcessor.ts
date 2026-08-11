import type { AttachmentStorageService } from '../../services/attachmentStorageService'
import type { RepairRecordService } from '../../services/repairRecordService'
import type { RepairAttachment, RepairRecord } from '../../types/repair'
import {
  enqueueAttachmentDeletionSync,
  loadSyncQueue,
  removeSyncTask,
  saveSyncQueue,
  updateSyncTaskStatus,
  type SyncTask,
} from './syncQueue'
import type { SyncEnvironment } from './syncEnvironment'

export interface SyncProcessorOptions {
  environment: SyncEnvironment
  repairRecordService: RepairRecordService
  localRepairRecordService: RepairRecordService
  attachmentStorageService: AttachmentStorageService
  onProgress?: (records: RepairRecord[], tasks: SyncTask[]) => void
}

export interface SyncProcessorResult {
  records: RepairRecord[]
  tasks: SyncTask[]
  message: string
}

export async function processSyncQueue(options: SyncProcessorOptions): Promise<SyncProcessorResult> {
  if (!options.environment.online) {
    const tasks = saveSyncQueue(markActiveTasks(loadSyncQueue(), 'local'))
    const records = await options.localRepairRecordService.list()
    options.onProgress?.(records, tasks)

    return {
      records,
      tasks,
      message: '目前離線，資料已保留於本機待同步清單。',
    }
  }

  let completedCount = 0

  while (true) {
    const task = loadSyncQueue().find((item) => item.status === 'pending' || item.status === 'local')

    if (!task) {
      break
    }

    let nextTasks = updateSyncTaskStatus(task.id, task.operationId, 'syncing')
    await publishProgress(options, nextTasks)

    try {
      if (task.kind === 'attachment' && !options.attachmentStorageService.isCloudStorage) {
        nextTasks = updateSyncTaskStatus(task.id, task.operationId, 'local')
        await publishProgress(options, nextTasks)
        break
      }

      await processTask(task, options)
      nextTasks = removeSyncTask(task.id, task.operationId)
      completedCount += 1
    } catch (error) {
      nextTasks = updateSyncTaskStatus(task.id, task.operationId, 'failed', getSyncErrorMessage(error))
      await markAttachmentFailed(task, options.localRepairRecordService)
    }

    await publishProgress(options, nextTasks)
  }

  const records = await options.localRepairRecordService.list()
  const tasks = loadSyncQueue()

  return {
    records,
    tasks,
    message: buildResultMessage(completedCount, tasks),
  }
}

async function processTask(task: SyncTask, options: SyncProcessorOptions): Promise<void> {
  if (task.kind === 'repair-text') {
    await syncRepairText(task, options)
    return
  }

  if (task.kind === 'attachment' && task.attachmentId) {
    const record = await findLocalRecord(options.localRepairRecordService, task.recordId)
    const attachmentVersion = task.attachmentVersion
      ?? record?.attachments.find((attachment) => attachment.id === task.attachmentId)?.createdAt

    if (attachmentVersion) {
      await syncAttachment({ ...task, attachmentVersion }, options)
    }
    return
  }

  if (task.kind === 'attachment-delete' && task.attachmentId && task.driveFileId) {
    await options.attachmentStorageService.remove(task.recordId, {
      id: task.attachmentId,
      driveFileId: task.driveFileId,
    })
  }
}

async function syncRepairText(task: SyncTask, options: SyncProcessorOptions): Promise<void> {
  const record = await findLocalRecord(options.localRepairRecordService, task.recordId)

  if (!record) {
    return
  }

  await options.repairRecordService.save({
    ...record,
    textSyncStatus: 'synced',
    updatedAt: new Date().toISOString(),
  })

  if (!isCurrentTask(task)) {
    return
  }

  const latestRecord = await findLocalRecord(options.localRepairRecordService, task.recordId)

  if (latestRecord) {
    await options.localRepairRecordService.save({ ...latestRecord, textSyncStatus: 'synced' })
  }
}

async function syncAttachment(task: SyncTask, options: SyncProcessorOptions): Promise<void> {
  const record = await findLocalRecord(options.localRepairRecordService, task.recordId)
  const attachment = findAttachmentVersion(record, task)

  if (!record || !attachment) {
    return
  }

  await updateLocalAttachment(options.localRepairRecordService, task, (current) => ({
    ...current,
    syncStatus: 'syncing',
  }))
  const syncedAttachment = await options.attachmentStorageService.upload(record.id, attachment)
  const latestRecord = await findLocalRecord(options.localRepairRecordService, task.recordId)
  const latestAttachment = findAttachmentVersion(latestRecord, task)

  if (!latestRecord || !latestAttachment) {
    await removeObsoleteUpload(task, syncedAttachment, options.attachmentStorageService)
    return
  }

  const syncedRecord = {
    ...latestRecord,
    attachments: latestRecord.attachments.map((item) => (
      item.id === task.attachmentId && item.createdAt === task.attachmentVersion
        ? { ...syncedAttachment, previewUrl: item.previewUrl }
        : item
    )),
    updatedAt: new Date().toISOString(),
  }

  await options.localRepairRecordService.save(syncedRecord)
  await options.repairRecordService.save(syncedRecord)

  const recordAfterCloudSave = await findLocalRecord(options.localRepairRecordService, task.recordId)

  if (!findAttachmentVersion(recordAfterCloudSave, task)) {
    await removeObsoleteUpload(task, syncedAttachment, options.attachmentStorageService)
  }
}

async function removeObsoleteUpload(
  task: SyncTask,
  attachment: RepairAttachment,
  attachmentStorageService: AttachmentStorageService,
): Promise<void> {
  if (!attachment.driveFileId) {
    return
  }

  const deletionTasks = enqueueAttachmentDeletionSync(loadSyncQueue(), task.recordId, {
    id: task.attachmentId ?? attachment.id,
    driveFileId: attachment.driveFileId,
  })
  const deletionTask = deletionTasks.find((item) => (
    item.kind === 'attachment-delete'
    && item.recordId === task.recordId
    && item.attachmentId === (task.attachmentId ?? attachment.id)
  ))

  await attachmentStorageService.remove(task.recordId, {
    id: task.attachmentId ?? attachment.id,
    driveFileId: attachment.driveFileId,
  })

  if (deletionTask) {
    removeSyncTask(deletionTask.id, deletionTask.operationId)
  }
}

async function markAttachmentFailed(task: SyncTask, localService: RepairRecordService): Promise<void> {
  if (task.kind !== 'attachment') {
    return
  }

  await updateLocalAttachment(localService, task, (attachment) => ({ ...attachment, syncStatus: 'failed' }))
}

async function updateLocalAttachment(
  localService: RepairRecordService,
  task: SyncTask,
  update: (attachment: RepairAttachment) => RepairAttachment,
): Promise<void> {
  const record = await findLocalRecord(localService, task.recordId)

  if (!record || !findAttachmentVersion(record, task)) {
    return
  }

  await localService.save({
    ...record,
    attachments: record.attachments.map((attachment) => (
      attachment.id === task.attachmentId && attachment.createdAt === task.attachmentVersion
        ? update(attachment)
        : attachment
    )),
  })
}

function findAttachmentVersion(record: RepairRecord | undefined, task: SyncTask): RepairAttachment | undefined {
  return record?.attachments.find((attachment) => (
    attachment.id === task.attachmentId && attachment.createdAt === task.attachmentVersion
  ))
}

async function findLocalRecord(service: RepairRecordService, recordId: string): Promise<RepairRecord | undefined> {
  return (await service.list()).find((record) => record.id === recordId)
}

function isCurrentTask(task: SyncTask): boolean {
  return loadSyncQueue().some((item) => item.id === task.id && item.operationId === task.operationId)
}

async function publishProgress(options: SyncProcessorOptions, tasks: SyncTask[]): Promise<void> {
  if (!options.onProgress) {
    return
  }

  options.onProgress(await options.localRepairRecordService.list(), tasks)
}

function markActiveTasks(tasks: SyncTask[], status: SyncTask['status']): SyncTask[] {
  return tasks.map((task) => (
    task.status === 'failed' ? task : { ...task, status, updatedAt: new Date().toISOString() }
  ))
}

function buildResultMessage(completedCount: number, tasks: SyncTask[]): string {
  const failedCount = tasks.filter((task) => task.status === 'failed').length

  if (failedCount > 0) {
    const failedTask = tasks.find((task) => task.status === 'failed')
    return `已完成 ${completedCount} 筆；${failedCount} 筆未完成。${failedTask?.error ?? '請稍後重試。'}`
  }

  if (tasks.length === 0) {
    return `同步完成，共處理 ${completedCount} 筆待同步資料。`
  }

  return `已完成 ${completedCount} 筆；${tasks.length} 筆資料仍保留在本機，等待下次同步。`
}

function getSyncErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '雲端服務暫時無法處理，請稍後再試。'
}
