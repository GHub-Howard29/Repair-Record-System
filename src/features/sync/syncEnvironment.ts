export interface SyncEnvironment {
  online: boolean
  connectionType: 'wifi' | 'cellular' | 'unknown'
}

interface NavigatorWithConnection extends Navigator {
  connection?: {
    type?: string
    effectiveType?: string
  }
}

export function getSyncEnvironment(): SyncEnvironment {
  const connection = (navigator as NavigatorWithConnection).connection
  const type = connection?.type ?? connection?.effectiveType ?? ''

  return {
    online: navigator.onLine,
    connectionType: type.includes('cellular') || type.includes('2g') || type.includes('3g') || type.includes('4g')
      ? 'cellular'
      : type.includes('wifi')
        ? 'wifi'
        : 'unknown',
  }
}

