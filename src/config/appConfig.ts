export const appConfig = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '',
  authMode: import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'google' : 'local',
} as const

export function isGoogleAuthConfigured(): boolean {
  return Boolean(appConfig.googleClientId)
}

