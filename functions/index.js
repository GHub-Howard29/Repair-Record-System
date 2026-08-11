import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { buildAttachmentUploadKey, buildExistingUploadQuery } from './attachmentUploadIdempotency.js'

initializeApp()

const firestore = getFirestore()

const driveFolderId = defineSecret('GOOGLE_DRIVE_FOLDER_ID')
const driveOauthClientId = defineSecret('GOOGLE_DRIVE_OAUTH_CLIENT_ID')
const driveOauthClientSecret = defineSecret('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET')
const driveOauthRefreshToken = defineSecret('GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN')
const allowedEmails = defineSecret('ALLOWED_EMAILS')

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const uploadLeaseDurationMs = 70_000
const uploadWaitDurationMs = 15_000

export const uploadRepairAttachment = onCall(
  {
    region: 'asia-east1',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [driveFolderId, driveOauthClientId, driveOauthClientSecret, driveOauthRefreshToken, allowedEmails],
  },
  async (request) => {
    const email = request.auth?.token.email

    if (!email) {
      throw new HttpsError('unauthenticated', '請先登入再上傳附件。')
    }

    const permittedEmails = parseAllowedEmails(allowedEmails.value())

    if (!permittedEmails.includes(email.toLowerCase())) {
      throw new HttpsError('permission-denied', '此帳號沒有上傳附件的權限。')
    }

    const { recordId, attachment } = request.data ?? {}
    validateUpload(recordId, attachment)

    const base64 = attachment.previewUrl.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')
    const uploadKey = buildAttachmentUploadKey(recordId, attachment, buffer)
    const uploadStateRef = firestore.collection('attachmentUploadStates').doc(uploadKey)
    const ownerToken = randomUUID()
    const claim = await claimAttachmentUpload(uploadStateRef, ownerToken, recordId, attachment.id)

    if (claim.completed) {
      return toUploadResponse(attachment.id, claim)
    }

    if (!claim.owned) {
      const completedUpload = await waitForAttachmentUpload(uploadStateRef)

      if (completedUpload) {
        return toUploadResponse(attachment.id, completedUpload)
      }

      throw new HttpsError('unavailable', '相同附件正在上傳，請稍後再次同步。')
    }

    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(
      driveOauthClientId.value(),
      driveOauthClientSecret.value(),
    )
    auth.setCredentials({ refresh_token: driveOauthRefreshToken.value() })
    const drive = google.drive({ version: 'v3', auth })
    let uploaded

    try {
      const existing = await drive.files.list({
        q: buildExistingUploadQuery(driveFolderId.value(), uploadKey),
        spaces: 'drive',
        fields: 'files(id,webViewLink)',
        pageSize: 1,
      })
      const existingFile = existing.data.files?.[0]

      uploaded = existingFile
        ? { data: existingFile }
        : await drive.files.create({
            requestBody: {
              name: `${recordId}-${attachment.fileName}`,
              parents: [driveFolderId.value()],
              appProperties: {
                repairUploadKey: uploadKey,
                repairRecordId: recordId,
                repairAttachmentId: attachment.id,
              },
            },
            media: {
              mimeType: attachment.mimeType,
              body: Readable.from(buffer),
            },
            fields: 'id,webViewLink',
          })
    } catch (error) {
      await failAttachmentUpload(uploadStateRef, ownerToken)
      console.error('Google Drive upload failed', {
        code: error?.code,
        message: error?.message,
        reason: error?.errors?.[0]?.reason,
      })
      throw new HttpsError('failed-precondition', '無法寫入 Google 雲端硬碟，請確認資料夾 ID、授權帳號與 Drive 權限。')
    }

    if (!uploaded.data.id) {
      await failAttachmentUpload(uploadStateRef, ownerToken)
      throw new HttpsError('internal', 'Google Drive 未回傳檔案 ID。')
    }

    await completeAttachmentUpload(uploadStateRef, ownerToken, uploaded.data.id, uploaded.data.webViewLink ?? '')

    return toUploadResponse(attachment.id, {
      driveFileId: uploaded.data.id,
      driveUrl: uploaded.data.webViewLink ?? '',
    })
  },
)

export const getRepairAttachmentPreview = onCall(
  {
    region: 'asia-east1',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [driveFolderId, driveOauthClientId, driveOauthClientSecret, driveOauthRefreshToken, allowedEmails],
  },
  async (request) => {
    const email = request.auth?.token.email

    if (!email) {
      throw new HttpsError('unauthenticated', '請先登入後再讀取附件。')
    }

    const permittedEmails = parseAllowedEmails(allowedEmails.value())

    if (!permittedEmails.includes(email.toLowerCase())) {
      throw new HttpsError('permission-denied', '目前帳號沒有讀取附件的權限。')
    }

    const driveFileId = request.data?.driveFileId

    if (typeof driveFileId !== 'string' || !driveFileId.trim()) {
      throw new HttpsError('invalid-argument', '缺少附件檔案識別碼。')
    }

    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(driveOauthClientId.value(), driveOauthClientSecret.value())
    auth.setCredentials({ refresh_token: driveOauthRefreshToken.value() })
    const drive = google.drive({ version: 'v3', auth })
    const file = await drive.files.get({ fileId: driveFileId, fields: 'parents,mimeType' })

    if (!file.data.parents?.includes(driveFolderId.value()) || !imageMimeTypes.has(file.data.mimeType ?? '')) {
      throw new HttpsError('permission-denied', '無法讀取指定附件。')
    }

    const image = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    )
    const base64 = Buffer.from(image.data).toString('base64')

    return { dataUrl: `data:${file.data.mimeType};base64,${base64}` }
  },
)

export const deleteRepairAttachment = onCall(
  {
    region: 'asia-east1',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [driveFolderId, driveOauthClientId, driveOauthClientSecret, driveOauthRefreshToken, allowedEmails],
  },
  async (request) => {
    const email = request.auth?.token.email

    if (!email) {
      throw new HttpsError('unauthenticated', '請先登入後再刪除附件。')
    }

    const permittedEmails = parseAllowedEmails(allowedEmails.value())

    if (!permittedEmails.includes(email.toLowerCase())) {
      throw new HttpsError('permission-denied', '此帳號沒有刪除附件的權限。')
    }

    const { recordId, attachmentId, driveFileId } = request.data ?? {}

    if (typeof recordId !== 'string' || !recordId.trim() || typeof attachmentId !== 'string' || !attachmentId.trim()) {
      throw new HttpsError('invalid-argument', '缺少維修紀錄或附件識別碼。')
    }

    if (typeof driveFileId !== 'string' || !driveFileId.trim()) {
      throw new HttpsError('invalid-argument', '缺少 Google Drive 附件識別碼。')
    }

    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(driveOauthClientId.value(), driveOauthClientSecret.value())
    auth.setCredentials({ refresh_token: driveOauthRefreshToken.value() })
    const drive = google.drive({ version: 'v3', auth })
    let file

    try {
      file = await drive.files.get({ fileId: driveFileId, fields: 'parents,mimeType' })
    } catch (error) {
      if (getDriveErrorStatus(error) === 404) {
        // 舊版同步佇列可能保留已被移除的檔案；目標既已達成，視為成功。
        return { driveFileId }
      }

      console.error('Google Drive attachment lookup failed', {
        code: error?.code,
        message: error?.message,
        reason: error?.errors?.[0]?.reason,
      })
      throw new HttpsError('failed-precondition', '無法讀取欲刪除的 Google 雲端硬碟照片，請確認 Drive 權限。')
    }

    if (!file.data.parents?.includes(driveFolderId.value()) || !imageMimeTypes.has(file.data.mimeType ?? '')) {
      throw new HttpsError('permission-denied', '無法刪除指定附件。')
    }

    try {
      await drive.files.delete({ fileId: driveFileId })
    } catch (error) {
      if (getDriveErrorStatus(error) !== 404) {
        console.error('Google Drive attachment deletion failed', {
          code: error?.code,
          message: error?.message,
          reason: error?.errors?.[0]?.reason,
        })
        throw new HttpsError('failed-precondition', '無法刪除 Google 雲端硬碟照片，請確認 Drive 權限。')
      }
    }

    return { driveFileId }
  },
)

async function claimAttachmentUpload(uploadStateRef, ownerToken, recordId, attachmentId) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(uploadStateRef)
    const state = snapshot.data()

    if (typeof state?.driveFileId === 'string') {
      return {
        completed: true,
        driveFileId: state.driveFileId,
        driveUrl: typeof state.driveUrl === 'string' ? state.driveUrl : '',
      }
    }

    if (state?.status === 'uploading' && Number(state.leaseExpiresAt) > Date.now()) {
      return { completed: false, owned: false }
    }

    transaction.set(uploadStateRef, {
      status: 'uploading',
      ownerToken,
      recordId,
      attachmentId,
      leaseExpiresAt: Date.now() + uploadLeaseDurationMs,
      updatedAt: new Date().toISOString(),
    })

    return { completed: false, owned: true }
  })
}

async function waitForAttachmentUpload(uploadStateRef) {
  const deadline = Date.now() + uploadWaitDurationMs

  while (Date.now() < deadline) {
    const state = (await uploadStateRef.get()).data()

    if (typeof state?.driveFileId === 'string') {
      return {
        driveFileId: state.driveFileId,
        driveUrl: typeof state.driveUrl === 'string' ? state.driveUrl : '',
      }
    }

    if (state?.status === 'failed') {
      return undefined
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return undefined
}

async function completeAttachmentUpload(uploadStateRef, ownerToken, driveFileId, driveUrl) {
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(uploadStateRef)

    if (snapshot.data()?.ownerToken !== ownerToken) {
      return
    }

    transaction.set(uploadStateRef, {
      status: 'completed',
      driveFileId,
      driveUrl,
      leaseExpiresAt: 0,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
  })
}

async function failAttachmentUpload(uploadStateRef, ownerToken) {
  try {
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(uploadStateRef)

      if (snapshot.data()?.ownerToken !== ownerToken) {
        return
      }

      transaction.set(uploadStateRef, {
        status: 'failed',
        leaseExpiresAt: 0,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    })
  } catch (error) {
    console.error('Attachment upload state update failed', { message: error?.message })
  }
}

function toUploadResponse(attachmentId, upload) {
  return {
    attachmentId,
    driveFileId: upload.driveFileId,
    driveUrl: upload.driveUrl ?? '',
  }
}

function validateUpload(recordId, attachment) {
  if (typeof recordId !== 'string' || !recordId.trim()) {
    throw new HttpsError('invalid-argument', '缺少維修紀錄 ID。')
  }

  if (!attachment || typeof attachment !== 'object') {
    throw new HttpsError('invalid-argument', '缺少附件資料。')
  }

  if (
    typeof attachment.id !== 'string' ||
    !attachment.id.trim() ||
    typeof attachment.createdAt !== 'string' ||
    !attachment.createdAt.trim() ||
    typeof attachment.fileName !== 'string' ||
    !attachment.fileName.trim()
  ) {
    throw new HttpsError('invalid-argument', '附件識別資料不正確。')
  }

  if (!imageMimeTypes.has(attachment.mimeType) || typeof attachment.previewUrl !== 'string') {
    throw new HttpsError('invalid-argument', '附件格式不正確。')
  }

  if (attachment.size > 1_500_000 || !attachment.previewUrl.startsWith(`data:${attachment.mimeType};base64,`)) {
    throw new HttpsError('invalid-argument', '附件大小或內容不正確。')
  }
}

function parseAllowedEmails(value) {
  try {
    const parsed = JSON.parse(value)

    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    }
  } catch {
    // 支援以逗號分隔的既有 Secret 格式。
  }

  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function getDriveErrorStatus(error) {
  return error?.code ?? error?.response?.status
}
