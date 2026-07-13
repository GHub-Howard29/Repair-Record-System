export const appConfig = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '',
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '',
  },
  googleDriveFolderId: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID?.trim() ?? '',
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
  return Boolean(appConfig.googleDriveFolderId)
}
