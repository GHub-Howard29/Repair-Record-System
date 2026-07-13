import type { AttachmentStorageService } from '../../services/attachmentStorageService'
import type { RepairRecordService } from '../../services/repairRecordService'
import type { RepairRecord } from '../../types/repair'
import { saveSyncQueue, type SyncTask } from './syncQueue'
import type { SyncEnvironment } from './syncEnvironment'

export interface SyncProcessorOptions {
  allowMobileAttachmentSync: boolean
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
  let deferredCount = 0

  for (const task of tasks) {
    if (task.kind === 'attachment' && options.environment.connectionType === 'cellular' && !options.allowMobileAttachmentSync) {
      nextTasks = updateTaskStatus(nextTasks, task.id, 'local')
      deferredCount += 1
      continue
    }

    try {
      if (task.kind === 'repair-text') {
        nextRecords = syncRepairText(nextRecords, task.recordId, options.repairRecordService)
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
    } catch {
      nextTasks = updateTaskStatus(nextTasks, task.id, 'failed')
    }
  }

  saveSyncQueue(nextTasks)

  return {
    records: nextRecords,
    tasks: nextTasks,
    message: buildResultMessage(completedCount, deferredCount, nextTasks),
  }
}

function syncRepairText(
  records: RepairRecord[],
  recordId: string,
  repairRecordService: RepairRecordService,
): RepairRecord[] {
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

function updateTaskStatus(tasks: SyncTask[], taskId: string, status: SyncTask['status']): SyncTask[] {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status,
          updatedAt: new Date().toISOString(),
        }
      : task,
  )
}

function buildResultMessage(completedCount: number, deferredCount: number, tasks: SyncTask[]): string {
  const failedCount = tasks.filter((task) => task.status === 'failed').length

  if (completedCount === 0 && deferredCount > 0) {
    return '目前使用行動網路，附件已保留於本機稍後同步。'
  }

  if (failedCount > 0) {
    return `已同步 ${completedCount} 筆，${failedCount} 筆失敗，請稍後重試。`
  }

  if (tasks.length === 0) {
    return `同步完成，共處理 ${completedCount} 筆待同步資料。`
  }

  return `已同步 ${completedCount} 筆，尚有 ${tasks.length} 筆待同步資料。`
}

