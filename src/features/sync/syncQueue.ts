import type { RepairRecord, SyncStatus } from '../../types/repair'

export type SyncTaskKind = 'repair-text' | 'attachment'

export interface SyncTask {
  id: string
  kind: SyncTaskKind
  recordId: string
  attachmentId?: string
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
    return JSON.parse(rawQueue) as SyncTask[]
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

export function enqueueAttachmentSync(tasks: SyncTask[], recordId: string, attachmentId: string): SyncTask[] {
  return upsertSyncTask(tasks, {
    kind: 'attachment',
    recordId,
    attachmentId,
  })
}

export function summarizeSyncQueue(tasks: SyncTask[]) {
  return {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === 'pending' || task.status === 'local').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  }
}

function upsertSyncTask(
  tasks: SyncTask[],
  task: Pick<SyncTask, 'kind' | 'recordId' | 'attachmentId'>,
): SyncTask[] {
  const now = new Date().toISOString()
  const taskId = [task.kind, task.recordId, task.attachmentId].filter(Boolean).join(':')
  const nextTask: SyncTask = {
    id: taskId,
    kind: task.kind,
    recordId: task.recordId,
    attachmentId: task.attachmentId,
    status: 'pending',
    createdAt: tasks.find((item) => item.id === taskId)?.createdAt ?? now,
    updatedAt: now,
  }
  const nextTasks = tasks.some((item) => item.id === taskId)
    ? tasks.map((item) => (item.id === taskId ? nextTask : item))
    : [...tasks, nextTask]

  return saveSyncQueue(nextTasks)
}
