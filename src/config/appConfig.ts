export const appConfig = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '',
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '',
  },
  googleDrive: {
    folderId: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID?.trim() ?? '',
    scope:
      import.meta.env.VITE_GOOGLE_DRIVE_SCOPE?.trim() ??
      'https://www.googleapis.com/auth/drive.file',
  },
  attachmentUploadEnabled: import.meta.env.VITE_ATTACHMENT_UPLOAD_ENABLED === 'true',
  authMode: import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'google' : 'local',
} as const

export function isGoogleAuthConfigured(): boolean {
  return Boolean(appConfig.googleClientId)
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    appConfig.firebase.apiKey &&
      appConfig.firebase.authDomain &&
      appConfig.firebase.projectId &&
      appConfig.firebase.appId,
  )
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(appConfig.attachmentUploadEnabled && appConfig.googleDrive.folderId && appConfig.googleDrive.scope)
}
