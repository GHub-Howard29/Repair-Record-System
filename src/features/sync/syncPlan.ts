import type { SyncStatus } from '../../types/repair'

export interface SyncPlanItem {
  target: 'firestore' | 'drive' | 'local'
  title: string
  status: SyncStatus
}

export const initialSyncPlan: SyncPlanItem[] = [
  {
    target: 'firestore',
    title: '文字資料即時同步至 Google Firestore',
    status: 'pending',
  },
  {
    target: 'drive',
    title: '照片附件依網路狀態同步至 Google Drive',
    status: 'local',
  },
  {
    target: 'local',
    title: '離線與失敗資料保留於本機待同步清單',
    status: 'local',
  },
]

