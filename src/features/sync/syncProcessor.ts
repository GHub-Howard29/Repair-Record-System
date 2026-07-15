import type { AttachmentStorageService } from '../../services/attachmentStorageService'
import type { RepairRecordService } from '../../services/repairRecordService'
import type { RepairRecord } from '../../types/repair'
import { saveSyncQueue, type SyncTask } from './syncQueue'
import type { SyncEnvironment } from './syncEnvironment'

export interface SyncProcessorOptions {
  environment: SyncEnvironment
  repairRecordService: RepairRecordService
  attachmentStorageService: AttachmentStorageService
}

export interface SyncProcessorResult {
  records: RepairRecord[]
  tasks: SyncTask[]
  message: string
}

export async function processSyncQueue(
  records: RepairRecord[],
  tasks: SyncTask[],
  options: SyncProcessorOptions,
): Promise<SyncProcessorResult> {
  if (!options.environment.online) {
    return {
      records,
      tasks: saveSyncQueue(markTasks(tasks, 'local')),
      message: '目前離線，資料已保留於本機待同步清單。',
    }
  }

  let nextRecords = records
  let nextTasks = tasks
  let completedCount = 0

  for (const task of tasks) {
    try {
      if (task.kind === 'attachment' && !options.attachmentStorageService.isCloudStorage) {
        nextTasks = updateTaskStatus(nextTasks, task.id, 'local')
        continue
      }

      if (task.kind === 'repair-text') {
        nextRecords = await syncRepairText(nextRecords, task.recordId, options.repairRecordService)
      }

      if (task.kind === 'attachment' && task.attachmentId) {
        nextRecords = await syncAttachment(
          nextRecords,
          task.recordId,
          task.attachmentId,
          options.attachmentStorageService,
          options.repairRecordService,
        )
      }

      nextTasks = nextTasks.filter((item) => item.id !== task.id)
      completedCount += 1
    } catch (error) {
      nextTasks = updateTaskStatus(nextTasks, task.id, 'failed', getSyncErrorMessage(error))
    }
  }

  saveSyncQueue(nextTasks)

  return {
    records: nextRecords,
    tasks: nextTasks,
    message: buildResultMessage(completedCount, nextTasks),
  }
}

async function syncRepairText(
  records: RepairRecord[],
  recordId: string,
  repairRecordService: RepairRecordService,
): Promise<RepairRecord[]> {
  const record = records.find((item) => item.id === recordId)

  if (!record) {
    return records
  }

  const nextRecord = {
    ...record,
    textSyncStatus: 'synced' as const,
    updatedAt: new Date().toISOString(),
  }

  return repairRecordService.save(nextRecord)
}

async function syncAttachment(
  records: RepairRecord[],
  recordId: string,
  attachmentId: string,
  attachmentStorageService: AttachmentStorageService,
  repairRecordService: RepairRecordService,
): Promise<RepairRecord[]> {
  const record = records.find((item) => item.id === recordId)
  const attachment = record?.attachments.find((item) => item.id === attachmentId)

  if (!record || !attachment) {
    return records
  }

  const syncedAttachment = await attachmentStorageService.upload(record.id, attachment)
  const nextRecord = {
    ...record,
    attachments: record.attachments.map((item) => (item.id === attachmentId ? syncedAttachment : item)),
    updatedAt: new Date().toISOString(),
  }

  return repairRecordService.save(nextRecord)
}

function markTasks(tasks: SyncTask[], status: SyncTask['status']): SyncTask[] {
  return tasks.map((task) => ({
    ...task,
    status,
    updatedAt: new Date().toISOString(),
  }))
}

function updateTaskStatus(tasks: SyncTask[], taskId: string, status: SyncTask['status'], error?: string): SyncTask[] {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status,
          error,
          updatedAt: new Date().toISOString(),
        }
      : task,
  )
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
