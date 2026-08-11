import { createHash } from 'node:crypto'

export function buildAttachmentUploadKey(recordId, attachment, buffer) {
  return createHash('sha256').update(recordId).update('\0').update(attachment.id).update('\0').update(attachment.createdAt).update('\0').update(buffer).digest('hex')
}

export function buildExistingUploadQuery(folderId, uploadKey) {
  return [`'${escapeDriveQueryValue(folderId)}' in parents`, 'trashed = false', `appProperties has { key='repairUploadKey' and value='${escapeDriveQueryValue(uploadKey)}' }`].join(
    ' and ',
  )
}

function escapeDriveQueryValue(value) {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}
