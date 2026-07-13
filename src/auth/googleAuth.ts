export interface AuthUser {
  id: string
  name: string
  email?: string
  picture?: string
  provider: 'google'
}

const GOOGLE_SCRIPT_ID = 'google-identity-services'
const AUTH_STORAGE_KEY = 'repair-record-system.auth-user'

interface GoogleCredentialResponse {
  credential: string
}

interface GooglePromptNotification {
  isNotDisplayed(): boolean
  isSkippedMoment(): boolean
  getNotDisplayedReason(): string
  getSkippedReason(): string
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(options: {
        client_id: string
        callback(response: GoogleCredentialResponse): void
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
      }): void
      renderButton(
        parent: HTMLElement,
        options: {
          theme?: 'outline' | 'filled_blue' | 'filled_black'
          size?: 'large' | 'medium' | 'small'
          text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
          shape?: 'rectangular' | 'pill' | 'circle' | 'square'
          logo_alignment?: 'left' | 'center'
          width?: string
        },
      ): void
      prompt(callback?: (notification: GooglePromptNotification) => void): void
      disableAutoSelect(): void
    }
  }
}

interface GoogleJwtPayload {
  sub: string
  name?: string
  email?: string
  picture?: string
}

declare global {
  interface Window {
    google?: GoogleIdentityServices
  }
}

export function createLocalGoogleUser(): AuthUser {
  return {
    id: 'local-google-user',
    name: 'Google 使用者',
    email: 'local@example.com',
    provider: 'google',
  }
}

export function getStoredAuthUser(): AuthUser | null {
  const rawUser = localStorage.getItem(AUTH_STORAGE_KEY)

  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser) as AuthUser
  } catch {
    clearStoredAuthUser()
    return null
  }
}

export function saveAuthUser(user: AuthUser): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
}

export function clearStoredAuthUser(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
  window.google?.accounts.id.disableAutoSelect()
}

export async function signInWithGoogle(clientId: string): Promise<AuthUser> {
  if (!clientId) {
    const localUser = createLocalGoogleUser()
    saveAuthUser(localUser)
    return localUser
  }

  await loadGoogleIdentityServices()

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Google 登入逾時，請稍後再試。'))
    }, 30000)

    window.google?.accounts.id.initialize({
      client_id: clientId,
      callback(response) {
        window.clearTimeout(timeoutId)
        const user = parseCredential(response.credential)
        saveAuthUser(user)
        resolve(user)
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    window.google?.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        window.clearTimeout(timeoutId)
        reject(new Error(`Google 登入未顯示：${notification.getNotDisplayedReason()}`))
      }

      if (notification.isSkippedMoment()) {
        window.clearTimeout(timeoutId)
        reject(new Error(`Google 登入已略過：${notification.getSkippedReason()}`))
      }
    })
  })
}

export async function renderGoogleSignInButton(
  clientId: string,
  container: HTMLElement,
  onSuccess: (user: AuthUser) => void,
  onError: (message: string) => void,
): Promise<void> {
  if (!clientId) {
    onError('尚未設定 Google Client ID。')
    return
  }

  await loadGoogleIdentityServices()

  container.replaceChildren()

  window.google?.accounts.id.initialize({
    client_id: clientId,
    callback(response) {
      try {
        const user = parseCredential(response.credential)
        saveAuthUser(user)
        onSuccess(user)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Google 登入憑證解析失敗。')
      }
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  })

  window.google?.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: '260',
  })
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.id) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID)

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('無法載入 Google 登入服務。')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('無法載入 Google 登入服務。'))
    document.head.append(script)
  })
}

function parseCredential(credential: string): AuthUser {
  const [, payload] = credential.split('.')

  if (!payload) {
    throw new Error('Google 登入憑證格式不正確。')
  }

  const profile = JSON.parse(decodeBase64Url(payload)) as GoogleJwtPayload

  return {
    id: profile.sub,
    name: profile.name ?? profile.email ?? 'Google 使用者',
    email: profile.email,
    picture: profile.picture,
    provider: 'google',
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const decoded = window.atob(padded)
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}
