import type { RepairAttachment, RepairRecord, SyncStatus } from '../../types/repair'

export type SyncTaskKind = 'repair-text' | 'attachment' | 'attachment-delete'

export interface SyncTask {
  id: string
  operationId: string
  kind: SyncTaskKind
  recordId: string
  attachmentId?: string
  attachmentVersion?: string
  driveFileId?: string
  status: SyncStatus
  error?: string
  createdAt: string
  updatedAt: string
}

const SYNC_QUEUE_KEY = 'repair-record-system.sync-queue'

export function loadSyncQueue(): SyncTask[] {
  const rawQueue = localStorage.getItem(SYNC_QUEUE_KEY)

  if (!rawQueue) {
    return []
  }

  try {
    return (JSON.parse(rawQueue) as SyncTask[]).map(normalizeSyncTask)
  } catch {
    return []
  }
}

export function saveSyncQueue(tasks: SyncTask[]): SyncTask[] {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(tasks))

  return tasks
}

export function enqueueRepairTextSync(tasks: SyncTask[], record: RepairRecord): SyncTask[] {
  return upsertSyncTask(tasks, {
    kind: 'repair-text',
    recordId: record.id,
  })
}

export function enqueueAttachmentSync(
  tasks: SyncTask[],
  recordId: string,
  attachment: Pick<RepairAttachment, 'id' | 'createdAt'>,
): SyncTask[] {
  return upsertSyncTask(tasks, {
    kind: 'attachment',
    recordId,
    attachmentId: attachment.id,
    attachmentVersion: attachment.createdAt,
  })
}

export function enqueueAttachmentDeletionSync(
  tasks: SyncTask[],
  recordId: string,
  attachment: Pick<RepairAttachment, 'id' | 'driveFileId'>,
): SyncTask[] {
  if (!attachment.driveFileId) {
    return tasks
  }

  return upsertSyncTask(tasks, {
    kind: 'attachment-delete',
    recordId,
    attachmentId: attachment.id,
    driveFileId: attachment.driveFileId,
  })
}

export function discardAttachmentSync(tasks: SyncTask[], recordId: string, attachmentId: string): SyncTask[] {
  return saveSyncQueue(tasks.filter((task) => !(task.kind === 'attachment' && task.recordId === recordId && task.attachmentId === attachmentId)))
}

export function summarizeSyncQueue(tasks: SyncTask[]) {
  return {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === 'pending' || task.status === 'local' || task.status === 'syncing').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  }
}

export function updateSyncTaskStatus(
  taskId: string,
  operationId: string,
  status: SyncTask['status'],
  error?: string,
): SyncTask[] {
  const tasks = loadSyncQueue()
  const nextTasks = tasks.map((task) =>
    task.id === taskId && task.operationId === operationId
      ? { ...task, status, error, updatedAt: new Date().toISOString() }
      : task,
  )

  return saveSyncQueue(nextTasks)
}

export function removeSyncTask(taskId: string, operationId: string): SyncTask[] {
  return saveSyncQueue(
    loadSyncQueue().filter((task) => task.id !== taskId || task.operationId !== operationId),
  )
}

export function retryFailedSyncTasks(tasks = loadSyncQueue()): SyncTask[] {
  const now = new Date().toISOString()

  return saveSyncQueue(tasks.map((task) => (
    task.status === 'failed' ? { ...task, status: 'pending' as const, error: undefined, updatedAt: now } : task
  )))
}

function upsertSyncTask(
  tasks: SyncTask[],
  task: Pick<SyncTask, 'kind' | 'recordId' | 'attachmentId' | 'attachmentVersion' | 'driveFileId'>,
): SyncTask[] {
  const now = new Date().toISOString()
  const taskId = [task.kind, task.recordId, task.attachmentId].filter(Boolean).join(':')
  const nextTask: SyncTask = {
    id: taskId,
    operationId: crypto.randomUUID(),
    kind: task.kind,
    recordId: task.recordId,
    attachmentId: task.attachmentId,
    attachmentVersion: task.attachmentVersion,
    driveFileId: task.driveFileId,
    status: 'pending',
    createdAt: tasks.find((item) => item.id === taskId)?.createdAt ?? now,
    updatedAt: now,
  }
  const nextTasks = tasks.some((item) => item.id === taskId)
    ? tasks.map((item) => (item.id === taskId ? nextTask : item))
    : [...tasks, nextTask]

  return saveSyncQueue(nextTasks)
}

function normalizeSyncTask(task: SyncTask): SyncTask {
  return {
    ...task,
    operationId: task.operationId ?? `${task.id}:${task.createdAt}`,
    status: task.status === 'syncing' ? 'pending' : task.status,
  }
}
