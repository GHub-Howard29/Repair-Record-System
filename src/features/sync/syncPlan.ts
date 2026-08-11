import type { SyncStatus } from '../../types/repair'
import type { SyncTask } from './syncQueue'

export interface SyncPlanItem {
  target: 'firestore' | 'drive'
  title: string
  status: SyncStatus
  count: number
}

export function buildSyncPlan(tasks: SyncTask[]): SyncPlanItem[] {
  const textTasks = tasks.filter((task) => task.kind === 'repair-text')
  const attachmentTasks = tasks.filter((task) => task.kind === 'attachment' || task.kind === 'attachment-delete')
  const plan: SyncPlanItem[] = []

  if (textTasks.length > 0) {
    plan.push({
      target: 'firestore',
      title: '維修單資料同步至雲端資料庫',
      status: getGroupStatus(textTasks),
      count: textTasks.length,
    })
  }

  if (attachmentTasks.length > 0) {
    const hasUpload = attachmentTasks.some((task) => task.kind === 'attachment')
    const hasDeletion = attachmentTasks.some((task) => task.kind === 'attachment-delete')
    const title = hasUpload && hasDeletion
      ? '維修照片上傳／刪除同步至 Google 雲端硬碟'
      : hasDeletion
        ? '維修照片刪除同步至 Google 雲端硬碟'
        : '維修照片上傳至 Google 雲端硬碟'

    plan.push({
      target: 'drive',
      title,
      status: getGroupStatus(attachmentTasks),
      count: attachmentTasks.length,
    })
  }

  return plan
}

function getGroupStatus(tasks: SyncTask[]): SyncStatus {
  if (tasks.some((task) => task.status === 'failed')) {
    return 'failed'
  }

  if (tasks.some((task) => task.status === 'syncing')) {
    return 'syncing'
  }

  if (tasks.some((task) => task.status === 'local')) {
    return 'local'
  }

  return 'pending'
}
