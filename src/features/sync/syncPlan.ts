import type { SyncStatus } from '../../types/repair'
import type { SyncTask } from './syncQueue'

export interface SyncPlanItem {
  target: 'firestore' | 'drive' | 'local'
  title: string
  status: SyncStatus
}

export const initialSyncPlan: SyncPlanItem[] = [
  {
    target: 'firestore',
    title: '維修單資料同步至雲端資料庫',
    status: 'pending',
  },
  {
    target: 'drive',
    title: '維修照片上傳至 Google 雲端硬碟',
    status: 'local',
  },
  {
    target: 'local',
    title: '待處理資料保留在本機，恢復連線後重送',
    status: 'local',
  },
]

export function buildSyncPlan(tasks: SyncTask[]): SyncPlanItem[] {
  const hasPendingText = tasks.some((task) => task.kind === 'repair-text')
  const hasPendingAttachment = tasks.some((task) => task.kind === 'attachment')

  return [
    {
      target: 'firestore',
      title: '維修單資料同步至雲端資料庫',
      status: hasPendingText ? 'pending' : 'synced',
    },
    {
      target: 'drive',
      title: '維修照片上傳至 Google 雲端硬碟',
      status: hasPendingAttachment ? 'pending' : 'local',
    },
    {
      target: 'local',
      title: '待處理資料保留在本機，恢復連線後重送',
      status: tasks.length > 0 ? 'pending' : 'synced',
    },
  ]
}
