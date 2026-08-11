import { describe, expect, it, vi } from 'vitest'
import { ATTACHMENT_DELETE_LOCK_MS, runWithMinimumLock } from './attachmentDeleteLock'

describe('附件刪除操作鎖', () => {
  it('刪除很快完成時仍會維持一秒鎖定', async () => {
    const action = vi.fn(async () => {})
    const wait = vi.fn(async () => {})

    await runWithMinimumLock(action, ATTACHMENT_DELETE_LOCK_MS, () => 100, wait)

    expect(action).toHaveBeenCalledOnce()
    expect(wait).toHaveBeenCalledWith(1000)
  })

  it('刪除本身已超過一秒時不會額外等待', async () => {
    const action = vi.fn(async () => {})
    const wait = vi.fn(async () => {})
    const now = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(1200)

    await runWithMinimumLock(action, ATTACHMENT_DELETE_LOCK_MS, now, wait)

    expect(wait).not.toHaveBeenCalled()
  })

  it('刪除失敗時仍會維持剩餘鎖定時間後再回報錯誤', async () => {
    const wait = vi.fn(async () => {})

    await expect(runWithMinimumLock(
      async () => {
        throw new Error('刪除失敗')
      },
      ATTACHMENT_DELETE_LOCK_MS,
      () => 100,
      wait,
    )).rejects.toThrow('刪除失敗')
    expect(wait).toHaveBeenCalledWith(1000)
  })
})
