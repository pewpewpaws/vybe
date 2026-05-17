const IMPORT_STATUS_KEY = 'vyne-import-status'
const IMPORT_LABEL_KEY = 'vyne-import-label'

export type BackgroundImportStatus = 'idle' | 'pending' | 'success' | 'error'

export function beginBackgroundImport(label: string) {
  sessionStorage.setItem(IMPORT_STATUS_KEY, 'pending')
  sessionStorage.setItem(IMPORT_LABEL_KEY, label)
}

export function succeedBackgroundImport(label: string) {
  sessionStorage.setItem(IMPORT_STATUS_KEY, 'success')
  sessionStorage.setItem(IMPORT_LABEL_KEY, label)
}

export function failBackgroundImport(label: string) {
  sessionStorage.setItem(IMPORT_STATUS_KEY, 'error')
  sessionStorage.setItem(IMPORT_LABEL_KEY, label)
}

export function clearBackgroundImport() {
  sessionStorage.removeItem(IMPORT_STATUS_KEY)
  sessionStorage.removeItem(IMPORT_LABEL_KEY)
}

export function getBackgroundImportStatus(): BackgroundImportStatus {
  const status = sessionStorage.getItem(IMPORT_STATUS_KEY)
  if (status === 'pending' || status === 'success' || status === 'error') {
    return status
  }
  return 'idle'
}

export function getBackgroundImportLabel(status?: BackgroundImportStatus) {
  const currentStatus = status ?? getBackgroundImportStatus()
  const savedLabel = sessionStorage.getItem(IMPORT_LABEL_KEY)
  if (savedLabel) {
    return savedLabel
  }

  if (currentStatus === 'success') {
    return 'Playlist imported successfully.'
  }

  if (currentStatus === 'error') {
    return 'Playlist import failed. Please try again.'
  }

  return 'Updating your playlist in the background.'
}
