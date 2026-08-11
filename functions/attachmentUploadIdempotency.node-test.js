import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAttachmentUploadKey, buildExistingUploadQuery } from './attachmentUploadIdempotency.js'

test('相同附件內容會產生相同上傳識別碼', () => {
  const attachment = { id: 'attachment-1', createdAt: '2026-08-11T03:40:00.000Z' }
  const first = buildAttachmentUploadKey('record-1', attachment, Buffer.from('same image'))
  const second = buildAttachmentUploadKey('record-1', attachment, Buffer.from('same image'))

  assert.equal(first, second)
})

test('更換附件版本或內容時會產生不同上傳識別碼', () => {
  const original = buildAttachmentUploadKey('record-1', { id: 'attachment-1', createdAt: '2026-08-11T03:40:00.000Z' }, Buffer.from('image'))
  const replaced = buildAttachmentUploadKey('record-1', { id: 'attachment-1', createdAt: '2026-08-11T03:55:00.000Z' }, Buffer.from('image'))
  const changed = buildAttachmentUploadKey('record-1', { id: 'attachment-1', createdAt: '2026-08-11T03:40:00.000Z' }, Buffer.from('different image'))

  assert.notEqual(original, replaced)
  assert.notEqual(original, changed)
})

test('Drive 查詢會安全處理特殊字元', () => {
  const query = buildExistingUploadQuery("folder'id", 'key\\value')

  assert.equal(query, "'folder\\'id' in parents and trashed = false and appProperties has { key='repairUploadKey' and value='key\\\\value' }")
})
