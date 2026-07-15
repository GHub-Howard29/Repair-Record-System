import { initializeApp } from 'firebase-admin/app'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { google } from 'googleapis'
import { Readable } from 'node:stream'

initializeApp()

const driveFolderId = defineSecret('GOOGLE_DRIVE_FOLDER_ID')
const driveOauthClientId = defineSecret('GOOGLE_DRIVE_OAUTH_CLIENT_ID')
const driveOauthClientSecret = defineSecret('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET')
const driveOauthRefreshToken = defineSecret('GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN')
const allowedEmails = defineSecret('ALLOWED_EMAILS')

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

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

    const permittedEmails = allowedEmails.value()
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    if (!permittedEmails.includes(email.toLowerCase())) {
      throw new HttpsError('permission-denied', '此帳號沒有上傳附件的權限。')
    }

    const { recordId, attachment } = request.data ?? {}
    validateUpload(recordId, attachment)

    const base64 = attachment.previewUrl.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')
    const auth = new google.auth.OAuth2(
      driveOauthClientId.value(),
      driveOauthClientSecret.value(),
    )
    auth.setCredentials({ refresh_token: driveOauthRefreshToken.value() })
    const drive = google.drive({ version: 'v3', auth })
    let uploaded

    try {
      uploaded = await drive.files.create({
        requestBody: {
          name: `${recordId}-${attachment.fileName}`,
          parents: [driveFolderId.value()],
        },
        media: {
          mimeType: attachment.mimeType,
          body: Readable.from(buffer),
        },
        fields: 'id,webViewLink',
      })
    } catch (error) {
      console.error('Google Drive upload failed', {
        code: error?.code,
        message: error?.message,
        reason: error?.errors?.[0]?.reason,
      })
      throw new HttpsError('failed-precondition', '無法寫入 Google 雲端硬碟，請確認資料夾 ID、授權帳號與 Drive 權限。')
    }

    if (!uploaded.data.id) {
      throw new HttpsError('internal', 'Google Drive 未回傳檔案 ID。')
    }

    return {
      attachmentId: attachment.id,
      driveFileId: uploaded.data.id,
      driveUrl: uploaded.data.webViewLink ?? '',
    }
  },
)

function validateUpload(recordId, attachment) {
  if (typeof recordId !== 'string' || !recordId.trim()) {
    throw new HttpsError('invalid-argument', '缺少維修紀錄 ID。')
  }

  if (!attachment || typeof attachment !== 'object') {
    throw new HttpsError('invalid-argument', '缺少附件資料。')
  }

  if (!imageMimeTypes.has(attachment.mimeType) || typeof attachment.previewUrl !== 'string') {
    throw new HttpsError('invalid-argument', '附件格式不正確。')
  }

  if (attachment.size > 1_500_000 || !attachment.previewUrl.startsWith(`data:${attachment.mimeType};base64,`)) {
    throw new HttpsError('invalid-argument', '附件大小或內容不正確。')
  }
}
