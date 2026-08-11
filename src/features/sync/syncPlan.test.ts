import { describe, expect, it } from 'vitest'
import { buildSyncPlan } from './syncPlan'
import type { SyncTask } from './syncQueue'

const task = (kind: SyncTask['kind'], status: SyncTask['status']): SyncTask => ({
  id: `${kind}-${status}`,
  operationId: `${kind}-${status}-operation`,
  kind,
  recordId: 'record-1',
  status,
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
})

describe('同步狀態清單', () => {
  it('沒有待處理工作時不顯示固定同步列', () => {
    expect(buildSyncPlan([])).toEqual([])
  })

  it('依實際工作合併顯示文字與照片同步', () => {
    expect(buildSyncPlan([
      task('repair-text', 'pending'),
      task('attachment', 'pending'),
      task('attachment-delete', 'local'),
    ])).toEqual([
      { target: 'firestore', title: '維修單資料同步至雲端資料庫', status: 'pending', count: 1 },
      { target: 'drive', title: '維修照片上傳／刪除同步至 Google 雲端硬碟', status: 'local', count: 2 },
    ])
  })

  it('背景處理期間顯示同步中', () => {
    expect(buildSyncPlan([task('attachment', 'syncing')])).toEqual([
      { target: 'drive', title: '維修照片上傳至 Google 雲端硬碟', status: 'syncing', count: 1 },
    ])
  })
})
