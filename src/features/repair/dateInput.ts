export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)

  if (digits.length <= 4) {
    return digits
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}/${digits.slice(4)}`
  }

  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`
}

export function getDateInputDraft(nextRawValue: string, previousDraft: string, selectionStart: number | null): string {
  const sanitizedValue = nextRawValue.replace(/[^\d/]/g, '').slice(0, 10)
  const isAppendingAtEnd =
    sanitizedValue.length > previousDraft.length && selectionStart === nextRawValue.length

  if (!sanitizedValue.includes('/') || isAppendingAtEnd) {
    return formatDateInput(sanitizedValue)
  }

  return sanitizedValue
}

export function toStoredDateValue(draft: string): string {
  return draft.replaceAll('/', '-')
}

export function restoreInvalidDateInput(value: string, valueBeforeEditing: string, required: boolean): string {
  if ((!required && value === '') || isValidIsoDate(value)) {
    return value
  }

  return valueBeforeEditing
}

export function promoteInitialValidDate(valueBeforeEditing: string, nextValue: string): string {
  return valueBeforeEditing === '' && isValidIsoDate(nextValue) ? nextValue : valueBeforeEditing
}
import { isValidIsoDate } from '../warranty/warranty'
