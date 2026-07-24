import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  clearStoredAuthUser,
  getStoredAuthUser,
  renderGoogleSignInButton,
  signInWithGoogle,
  type AuthUser,
} from './auth/googleAuth'
import { appConfig, isFirebaseConfigured, isGoogleAuthConfigured, isGoogleDriveConfigured } from './config/appConfig'
import { buildSyncPlan } from './features/sync/syncPlan'
import { getSyncEnvironment } from './features/sync/syncEnvironment'
import { processSyncQueue } from './features/sync/syncProcessor'
import {
  enqueueAttachmentSync,
  enqueueRepairTextSync,
  loadSyncQueue,
  saveSyncQueue,
  summarizeSyncQueue,
  type SyncTask,
} from './features/sync/syncQueue'
import {
  buildRepairRecord,
  getSerialNumberError,
  getRepairStatusLabel,
  hasOpenRepairWithSerial,
  isRepairCompleted,
  parseFaultParts,
  sumCharges,
  toRepairFormValues,
  validateRepairForm,
} from './features/repair/repairRules'
import {
  createAttachmentFromFile,
  getAttachmentLabel,
  relabelAttachments,
  validateAttachmentFile,
} from './features/attachment/attachmentRules'
import { ATTACHMENT_DESCRIPTIONS, DEFAULT_FAULT_CATEGORIES, DEFAULT_FAULT_PARTS } from './features/repair/repairOptions'
import { getPurchaseTypeLabel } from './features/repair/purchaseType'
import { getWarrantyStatus } from './features/warranty/warranty'
import { localAttachmentStorageService } from './services/attachmentStorageService'
import { googleDriveAttachmentService } from './services/googleDriveAttachmentService'
import { browserExportService } from './services/exportService'
import { firestoreRepairRecordService } from './services/firestoreRepairRecordService'
import { localRepairRecordService } from './storage/repairRepository'
import type { PurchaseType, RepairAttachment, RepairFormValues, RepairRecord } from './types/repair'

const repairRecordService = isFirebaseConfigured() ? firestoreRepairRecordService : localRepairRecordService
const attachmentStorageService = isGoogleDriveConfigured() ? googleDriveAttachmentService : localAttachmentStorageService

function getSyncStatusLabel(status: 'local' | 'pending' | 'synced' | 'failed'): string {
  return {
    local: '保留在本機',
    pending: '等待處理',
    synced: '已完成',
    failed: '同步失敗',
  }[status]
}

function getAttachmentPreviewUrl(attachment: RepairAttachment): string | undefined {
  if (attachment.previewUrl) {
    return attachment.previewUrl
  }

  return attachment.driveFileId ? `https://drive.google.com/thumbnail?id=${attachment.driveFileId}&sz=w1000` : undefined
}

function getHistoryChargeSummary(record: RepairRecord): string {
  const chargedItems = record.charges.filter((charge) => charge.amount !== 0).map((charge) => charge.label)

  return chargedItems.length > 0 ? chargedItems.join('、') : '無收費項目'
}

function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)

  if (digits.length <= 4) {
    return digits
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}/${digits.slice(4)}`
  }

  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`
}

function isDateInputInRange(value: string): boolean {
  const digits = value.replace(/\D/g, '')

  if (digits.length >= 6) {
    const month = Number(digits.slice(4, 6))

    if (month < 1 || month > 12) {
      return false
    }
  }

  if (digits.length === 8) {
    const day = Number(digits.slice(6, 8))

    if (day < 1 || day > 31) {
      return false
    }
  }

  return true
}

function DateField({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const pickerRef = useRef<HTMLInputElement>(null)

  function chooseDate() {
    const picker = pickerRef.current

    if (!picker) {
      return
    }

    if (typeof picker.showPicker === 'function') {
      picker.showPicker()
      return
    }

    picker.focus()
  }

  return (
    <div className="date-field" aria-label="日期輸入">
      <input
        className="date-text-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY/MM/DD"
        maxLength={10}
        value={formatDateInput(value)}
        disabled={disabled}
        aria-label="日期，請輸入年份 4 碼、月份 2 碼、日期 2 碼"
        onChange={(event) => {
          const nextValue = formatDateInput(event.target.value)

          if (isDateInputInRange(nextValue)) {
            onChange(nextValue.replaceAll('/', '-'))
          }
        }}
      />
      <button type="button" className="date-picker-button" onClick={chooseDate} disabled={disabled} aria-label="選擇日期">
        📅
      </button>
      <input
        ref={pickerRef}
        className="date-picker-control"
        type="date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
        disabled={disabled}
        tabIndex={-1}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </div>
  )
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuthUser())
  const [records, setRecords] = useState<RepairRecord[]>([])
  const [syncTasks, setSyncTasks] = useState<SyncTask[]>(() => loadSyncQueue())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedRecord = records.find((record) => record.id === selectedId)
  const [form, setForm] = useState<RepairFormValues>(() => toRepairFormValues())
  const [draftAttachments, setDraftAttachments] = useState<RepairAttachment[]>([])
  const [attachmentDescription, setAttachmentDescription] = useState<(typeof ATTACHMENT_DESCRIPTIONS)[number]>('維修前')
  const [customAttachmentDescription, setCustomAttachmentDescription] = useState('')
  const [searchText, setSearchText] = useState('')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [recordStatusFilter, setRecordStatusFilter] = useState<'active' | 'completed' | ''>('active')
  const [isStatusFilterExplicit, setIsStatusFilterExplicit] = useState(false)
  const [mobileView, setMobileView] = useState<'records' | 'editor' | 'details'>('records')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLoadingRecords, setIsLoadingRecords] = useState(true)
  const [message, setMessage] = useState(
    isGoogleAuthConfigured() ? '請先使用新增按鈕後開始作業。' : '尚未設定 Google Client ID，目前使用本機開發登入。',
  )
  const [attachmentMessage, setAttachmentMessage] = useState('可先加入照片，儲存維修單後會自動上傳。')
  const [syncMessage, setSyncMessage] = useState('同步清單會保留維修單與照片，連線恢復後會再次送出。')
  const [exportMessage, setExportMessage] = useState('可匯出單筆維修紀錄或全部資料；PDF 列印時請取消勾選「頁首及頁尾」。')
  const [exportSelectionMode, setExportSelectionMode] = useState<'pdf' | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<RepairAttachment | null>(null)
  const [authMessage, setAuthMessage] = useState(
    isGoogleAuthConfigured() ? '正式 Google OAuth 已設定。' : '請在 .env 設定 VITE_GOOGLE_CLIENT_ID 啟用正式登入。',
  )
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const completed = selectedRecord ? isRepairCompleted(selectedRecord) : false
  const serialNumberError = getSerialNumberError(form.serialNumber)
  const formFaultParts = useMemo(() => parseFaultParts(form.faultPartsText), [form.faultPartsText])
  const attachmentList = selectedRecord?.attachments ?? draftAttachments
  const availableFaultParts = useMemo(
    () => Array.from(new Set([...DEFAULT_FAULT_PARTS, ...formFaultParts])),
    [formFaultParts],
  )
  const hasRecordSearch = Boolean(searchText.trim() || startDateFilter || endDateFilter || categoryFilter)
  const serialHistory = useMemo(
    () => {
      const now = Date.now()

      return records
        .filter(
          (record) =>
            record.id !== selectedRecord?.id &&
            record.serialNumber.trim().toLowerCase() === form.serialNumber.trim().toLowerCase(),
        )
        .sort((left, right) => {
          const leftTime = left.returnedDate ? new Date(`${left.returnedDate}T00:00:00`).getTime() : Number.NaN
          const rightTime = right.returnedDate ? new Date(`${right.returnedDate}T00:00:00`).getTime() : Number.NaN
          const leftDistance = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : Math.abs(leftTime - now)
          const rightDistance = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : Math.abs(rightTime - now)

          return leftDistance - rightDistance || rightTime - leftTime
        })
    },
    [form.serialNumber, records, selectedRecord?.id],
  )

  const stats = useMemo(
    () => ({
      total: records.length,
      active: records.filter((record) => !isRepairCompleted(record)).length,
      completed: records.filter(isRepairCompleted).length,
      pendingSync: records.filter((record) => record.textSyncStatus !== 'synced').length,
    }),
    [records],
  )
  const syncSummary = useMemo(() => summarizeSyncQueue(syncTasks), [syncTasks])
  const syncPlan = useMemo(() => buildSyncPlan(syncTasks), [syncTasks])
  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()

    return records.filter((record) => {
      const matchesText =
        !normalizedSearch ||
        record.customerName.toLowerCase().includes(normalizedSearch) ||
        record.serialNumber.toLowerCase().includes(normalizedSearch) ||
        record.returnLocation.toLowerCase().includes(normalizedSearch)
      const matchesStartDate = !startDateFilter || record.receivedDate >= startDateFilter
      const matchesEndDate = !endDateFilter || record.receivedDate <= endDateFilter
      const matchesCategory = !categoryFilter || record.faultCategory === categoryFilter
      const matchesStatus =
        (hasRecordSearch && !isStatusFilterExplicit) ||
        !recordStatusFilter ||
        (recordStatusFilter === 'active' ? !isRepairCompleted(record) : isRepairCompleted(record))

      return matchesText && matchesStartDate && matchesEndDate && matchesCategory && matchesStatus
    })
  }, [
    categoryFilter,
    endDateFilter,
    hasRecordSearch,
    isStatusFilterExplicit,
    recordStatusFilter,
    records,
    searchText,
    startDateFilter,
  ])

  useEffect(() => {
    let ignore = false

    async function loadRecords() {
      if (!user) {
        setRecords([])
        setIsLoadingRecords(false)
        return
      }

      setIsLoadingRecords(true)
      try {
        const cloudRecords = await repairRecordService.list()
        const localRecords = await localRepairRecordService.list()
        const recordsById = new Map(cloudRecords.map((record) => [record.id, record]))
        const queuedTasks = loadSyncQueue()

        localRecords.forEach((localRecord) => {
          const hasPendingTextSync = queuedTasks.some(
            (task) => task.kind === 'repair-text' && task.recordId === localRecord.id,
          )
          const hasPendingAttachmentSync = queuedTasks.some(
            (task) => task.kind === 'attachment' && task.recordId === localRecord.id,
          )
          const cloudRecord = recordsById.get(localRecord.id)

          if (hasPendingTextSync && (!cloudRecord || localRecord.updatedAt >= cloudRecord.updatedAt)) {
            recordsById.set(localRecord.id, localRecord)
            return
          }

          if (cloudRecord) {
            const localAttachments = new Map(localRecord.attachments.map((attachment) => [attachment.id, attachment]))

            recordsById.set(localRecord.id, {
              ...cloudRecord,
              attachments: cloudRecord.attachments.map((attachment) => ({
                ...attachment,
                previewUrl: localAttachments.get(attachment.id)?.previewUrl ?? attachment.previewUrl,
                syncStatus: hasPendingAttachmentSync
                  ? localAttachments.get(attachment.id)?.syncStatus ?? attachment.syncStatus
                  : attachment.syncStatus,
              })),
            })
          }
        })
        const nextRecords = Array.from(recordsById.values())
        const nextTasks = saveSyncQueue(queuedTasks.filter((task) => recordsById.has(task.recordId)))

        await localRepairRecordService.replaceAll(nextRecords)

        if (!ignore) {
          setRecords(nextRecords)
          setSyncTasks(nextTasks)
        }
      } catch (error) {
        if (!ignore) {
          setRecords(await localRepairRecordService.list())
          setMessage(error instanceof Error ? error.message : '資料載入失敗，請稍後再試。')
        }
      } finally {
        if (!ignore) {
          setIsLoadingRecords(false)
        }
      }
    }

    void loadRecords()

    return () => {
      ignore = true
    }
  }, [user])

  useEffect(() => {
    const retryWhenOnline = () => {
      if (syncTasks.length > 0) {
        void runSyncQueue()
      }
    }

    window.addEventListener('online', retryWhenOnline)

    return () => window.removeEventListener('online', retryWhenOnline)
    // 同步函式會隨目前佇列與資料重建，事件監聽也需同步採用最新閉包。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, syncTasks])

  useEffect(() => {
    if (user || !isGoogleAuthConfigured() || !googleButtonRef.current) {
      return
    }

    void renderGoogleSignInButton(
      appConfig.googleClientId,
      googleButtonRef.current,
      (signedInUser) => {
        setUser(signedInUser)
        setMessage('登入成功，可以開始建立維修紀錄。')
        setAuthMessage('Google 登入成功。')
      },
      setAuthMessage,
    )
  }, [user])

  function startNewRecord() {
    setMobileView('editor')
    setSelectedId(null)
    setForm(toRepairFormValues())
    setMessage('請先完成收到日期、回送地點、製造號碼等欄位後，即時儲存，如未儲存時執行其他動作，將移失尚未儲存資料。')
    setDraftAttachments([])
    setAttachmentMessage('可先加入照片，儲存維修單後會自動上傳。')
    setExportSelectionMode(null)
    setPreviewAttachment(null)
  }

  function editRecord(record: RepairRecord) {
    setMobileView('editor')
    setSelectedId(record.id)
    setForm(toRepairFormValues(record))
    setDraftAttachments([])
    setMessage(isRepairCompleted(record) ? '此案件已完成，依規則只能檢視。' : '正在編輯維修中案件。')
    setAttachmentMessage(
      isRepairCompleted(record) ? '此案件已完成，附件已鎖定。' : '可新增、更換或刪除最多五張圖片附件。',
    )
    setPreviewAttachment(null)
    setExportSelectionMode(null)
  }

  function updateForm<K extends keyof RepairFormValues>(key: K, value: RepairFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function selectRecordStatus(status: 'active' | 'completed') {
    setRecordStatusFilter((current) => (isStatusFilterExplicit && current === status ? '' : status))
    setIsStatusFilterExplicit(true)
  }

  function updatePartCharge(part: string, amount: number) {
    setForm((current) => ({
      ...current,
      partChargeAmounts: {
        ...current.partChargeAmounts,
        [part]: amount,
      },
    }))
  }

  function toggleFaultPart(part: string) {
    const nextParts = formFaultParts.includes(part)
      ? formFaultParts.filter((item) => item !== part)
      : [...formFaultParts, part]
    updateForm('faultPartsText', nextParts.join('，'))
  }

  function getAttachmentDescription(): string {
    return attachmentDescription === '其他' ? customAttachmentDescription.trim() || '其他' : attachmentDescription
  }

  async function saveRecord() {
    if (selectedRecord && isRepairCompleted(selectedRecord)) {
      setMessage('已完成案件不可修改，請建立新紀錄補充說明。')
      return
    }

    const errors = validateRepairForm(form)

    if (errors.length > 0) {
      setMessage(`請完成必填欄位後再儲存：${errors.join(' ')}`)
      return
    }

    if (hasOpenRepairWithSerial(records, form.serialNumber, selectedRecord?.id)) {
      setMessage('此製造號碼已有尚未完成的維修紀錄，請從左側列表前往編輯。')
      return
    }

    const builtRecord = buildRepairRecord(form, selectedRecord)
    const nextRecord = {
      ...builtRecord,
      attachments: selectedRecord?.attachments ?? draftAttachments,
    }
    try {
      await persistRecord(nextRecord, draftAttachments.map((attachment) => attachment.id))
      setDraftAttachments([])
      setAttachmentMessage(nextRecord.returnedDate ? '此案件已完成，附件已鎖定。' : '可新增、更換或刪除最多五張圖片附件。')

      if (nextRecord.returnedDate) {
        setRecordStatusFilter('completed')
        setIsStatusFilterExplicit(true)
        setMessage('案件已完成並儲存，已切換至已完成清單。')
      }
    } catch (error) {
      setMessage(error instanceof Error ? `儲存失敗：${error.message}` : '儲存失敗，請稍後再試。')
    }
  }

  async function addAttachment(files: FileList | null) {
    if (!files?.[0]) {
      return
    }

    if (selectedRecord && isRepairCompleted(selectedRecord)) {
      setAttachmentMessage('已完成案件不可異動附件。')
      return
    }

    const file = files[0]
    const validationError = validateAttachmentFile(file, attachmentList)

    if (validationError) {
      setAttachmentMessage(validationError)
      return
    }

    try {
      const attachment = await createAttachmentFromFile(file, getAttachmentDescription(), attachmentList.length)

      if (!selectedRecord) {
        setDraftAttachments((attachments) => [...attachments, attachment])
        setAttachmentMessage('照片已加入維修單草稿；儲存後會自動上傳。')
        return
      }

      const nextRecord = {
        ...selectedRecord,
        attachments: [...selectedRecord.attachments, attachment],
        updatedAt: new Date().toISOString(),
      }

      await persistRecord(nextRecord, [attachment.id])
      setAttachmentMessage(attachment.compressed ? '已自動壓縮照片，以符合系統限制。' : '附件已加入待同步清單。')
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : '附件處理失敗。')
    }
  }

  async function replaceAttachment(attachmentId: string, files: FileList | null) {
    if (!files?.[0]) {
      return
    }

    if (selectedRecord && isRepairCompleted(selectedRecord)) {
      setAttachmentMessage('已完成案件不可異動附件。')
      return
    }

    const file = files[0]
    const validationError = validateAttachmentFile(file, attachmentList, true)

    if (validationError) {
      setAttachmentMessage(validationError)
      return
    }

    try {
      const attachmentIndex = attachmentList.findIndex((attachment) => attachment.id === attachmentId)
      const attachment = await createAttachmentFromFile(file, getAttachmentDescription(), attachmentIndex)

      if (!selectedRecord) {
        setDraftAttachments((attachments) =>
          attachments.map((current) => (current.id === attachmentId ? { ...attachment, id: attachmentId } : current)),
        )
        setPreviewAttachment(null)
        setAttachmentMessage('草稿照片已更換，儲存後會自動上傳。')
        return
      }

      const nextRecord = {
        ...selectedRecord,
        attachments: selectedRecord.attachments.map((current) =>
          current.id === attachmentId ? { ...attachment, id: attachmentId } : current,
        ),
        updatedAt: new Date().toISOString(),
      }

      await persistRecord(nextRecord, [attachmentId])
      setPreviewAttachment(null)
      setAttachmentMessage(attachment.compressed ? '已自動壓縮照片，以符合系統限制。' : '附件已更換並列入待同步。')
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : '附件處理失敗。')
    }
  }

  function removeAttachment(attachmentId: string) {
    if (selectedRecord && isRepairCompleted(selectedRecord)) {
      setAttachmentMessage('已完成案件不可刪除附件。')
      return
    }

    if (!selectedRecord) {
      setDraftAttachments((attachments) => attachments.filter((attachment) => attachment.id !== attachmentId))
      setPreviewAttachment(null)
      setAttachmentMessage('草稿照片已刪除。')
      return
    }

    const nextRecord = {
      ...selectedRecord,
      attachments: relabelAttachments(
        selectedRecord.attachments.filter((attachment) => attachment.id !== attachmentId),
      ),
      updatedAt: new Date().toISOString(),
    }

    void persistRecord(nextRecord)
    setPreviewAttachment(null)
    setAttachmentMessage('附件已刪除。')
  }

  async function persistRecord(record: RepairRecord, attachmentIds: string[] = []) {
    const nextRecords = await localRepairRecordService.save(record)
    const nextTextTasks = enqueueRepairTextSync(syncTasks, record)
    const nextTasks = attachmentIds.reduce(
      (tasks, attachmentId) => enqueueAttachmentSync(tasks, record.id, attachmentId),
      nextTextTasks,
    )

    setRecords(nextRecords)
    setSyncTasks(nextTasks)
    setSelectedId(record.id)
    setForm(toRepairFormValues(record))
    setMessage('已儲存到本機，正在自動同步雲端。')
    await runSyncQueue(nextRecords, nextTasks, record.id)
  }

  async function runSyncQueue(recordsToSync = records, tasksToSync = syncTasks, recordId = selectedId) {
    if (tasksToSync.length === 0) {
      setSyncMessage('目前沒有待同步資料。')
      return
    }

    const result = await processSyncQueue(recordsToSync, tasksToSync, {
      environment: getSyncEnvironment(),
      repairRecordService,
      attachmentStorageService,
    })

    setRecords(result.records)
    setSyncTasks(result.tasks)
    setSyncMessage(result.message)
    await localRepairRecordService.replaceAll(result.records)

    if (recordId) {
      const nextSelectedRecord = result.records.find((record) => record.id === recordId)

      if (nextSelectedRecord) {
        setForm(toRepairFormValues(nextSelectedRecord))
      }
    }

    setMessage(
      result.tasks.length > 0
        ? `同步尚未完成，資料已保留在此設備。${result.message}`
        : '維修紀錄已儲存並自動同步至雲端。',
    )
  }

  async function exportRecordPdf(record: RepairRecord) {
    try {
      await browserExportService.exportRecordPdf(record)
      setExportMessage('已開啟列印視窗；請在「更多設定」取消勾選「頁首及頁尾」，再另存 PDF。')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'PDF 匯出失敗。')
    }
  }

  function exportSelectedRecordPdf() {
    if (selectedRecord) {
      void exportRecordPdf(selectedRecord)
      return
    }

    if (window.matchMedia('(max-width: 720px)').matches) {
      setExportSelectionMode((mode) => {
        const nextMode = mode === 'pdf' ? null : 'pdf'
        setExportMessage(nextMode ? '請點選上方要匯出 PDF 的維修單。' : '已取消選擇匯出維修單。')
        return nextMode
      })
      return
    }

    setExportMessage('請先選擇一筆維修紀錄。')
  }

  async function exportAllRecordsExcel() {
    if (filteredRecords.length === 0) {
      setExportMessage('目前搜尋條件沒有可匯出的維修紀錄。')
      return
    }

    try {
      const result = await browserExportService.exportRecordsExcel(filteredRecords)
      setExportMessage(
        result === 'saved'
          ? '已選擇儲存位置並匯出 .xlsx。'
          : result === 'cancelled'
            ? '已取消匯出 .xlsx。'
            : '此瀏覽器不支援選擇儲存位置，已下載 .xlsx。',
      )
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Excel 匯出失敗。')
    }
  }

  async function handleLogin() {
    try {
      setAuthMessage('正在啟動 Google 登入...')
      const signedInUser = await signInWithGoogle(appConfig.googleClientId)
      setUser(signedInUser)
      setMessage('登入成功，可以開始建立維修紀錄。')
      setAuthMessage(isGoogleAuthConfigured() ? 'Google 登入成功。' : '本機開發登入成功。')
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Google 登入失敗。')
    }
  }

  function handleLogout() {
    clearStoredAuthUser()
    setUser(null)
    setAuthMessage(
      isGoogleAuthConfigured() ? '已登出，請重新使用 Google 登入。' : '已登出，本機開發模式可再次登入。',
    )
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <p className="eyebrow">Repair Record System</p>
          <h1>開心農場維修紀錄系統</h1>
          <p className="auth-hint">{authMessage}</p>
          {isGoogleAuthConfigured() ? (
            <div className="google-button-wrap" ref={googleButtonRef} />
          ) : (
            <button type="button" className="primary-action" onClick={handleLogin}>
              使用本機開發登入
            </button>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="menu-action"
          aria-label="開啟功能選單"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          ☰
        </button>
        <div className="header-title">
          <h1>維修紀錄工作台</h1>
          {isLoadingRecords ? <span className="loading-status">載入中</span> : null}
        </div>
        <div className="header-actions">
          {user.picture ? <img className="avatar" src={user.picture} alt="" /> : null}
          <button type="button" className="ghost-action" onClick={handleLogout}>
            登出
          </button>
        </div>
      </header>

      {isMobileMenuOpen ? <button type="button" className="mobile-menu-backdrop" aria-label="關閉功能選單" onClick={() => setIsMobileMenuOpen(false)} /> : null}
      <nav className={isMobileMenuOpen ? 'mobile-menu open' : 'mobile-menu'} aria-label="功能選單">
        <div className="mobile-menu-heading">功能選單</div>
        <button type="button" onClick={() => { startNewRecord(); setIsMobileMenuOpen(false) }}>
          新增維修紀錄
        </button>
        <button type="button" onClick={() => { setMobileView('records'); setIsMobileMenuOpen(false) }}>
          維修紀錄
        </button>
        <button type="button" onClick={() => { setMobileView('details'); setIsMobileMenuOpen(false) }}>
          其他功能
        </button>
      </nav>

      <div className="workspace-grid">
        <aside className={mobileView === 'records' ? 'record-list mobile-panel mobile-active' : 'record-list mobile-panel'} aria-label="維修紀錄列表">
          <section className="record-statistics" aria-label="維修紀錄統計">
            <h2>維修紀錄統計</h2>
            <div className="stats-row">
              <button
                type="button"
                className={(!hasRecordSearch || isStatusFilterExplicit) && recordStatusFilter === 'active' ? 'stat-filter active' : 'stat-filter'}
                aria-pressed={(!hasRecordSearch || isStatusFilterExplicit) && recordStatusFilter === 'active'}
                onClick={() => selectRecordStatus('active')}
              >
                <span>{stats.active}</span>
                <p>維修中</p>
              </button>
              <button
                type="button"
                className={(!hasRecordSearch || isStatusFilterExplicit) && recordStatusFilter === 'completed' ? 'stat-filter active' : 'stat-filter'}
                aria-pressed={(!hasRecordSearch || isStatusFilterExplicit) && recordStatusFilter === 'completed'}
                onClick={() => selectRecordStatus('completed')}
              >
                <span>{stats.completed}</span>
                <p>已完成</p>
              </button>
            </div>
          </section>
          <div className="list-title">
            <h2>維修紀錄查詢</h2>
          </div>
          <div className="search-panel">
            <label>
              關鍵字
              <input
                value={searchText}
                placeholder="姓名、製造號碼、回送地點"
                onChange={(event) => {
                  setSearchText(event.target.value)
                  setIsStatusFilterExplicit(false)
                }}
              />
            </label>
            <label>
              開始日期
              <input
                type="date"
                value={startDateFilter}
                onChange={(event) => {
                  setStartDateFilter(event.target.value)
                  setIsStatusFilterExplicit(false)
                }}
              />
            </label>
            <label>
              結束日期
              <input
                type="date"
                value={endDateFilter}
                onChange={(event) => {
                  setEndDateFilter(event.target.value)
                  setIsStatusFilterExplicit(false)
                }}
              />
            </label>
            <label>
              故障分類
              <select
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.target.value)
                  setIsStatusFilterExplicit(false)
                }}
              >
                <option value="">全部</option>
                {DEFAULT_FAULT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {records.length === 0 ? (
            <p className="empty-state">尚無資料，建立第一筆維修紀錄。</p>
          ) : filteredRecords.length === 0 ? (
            <p className="empty-state">沒有符合條件的維修紀錄。</p>
          ) : (
            <ul>
              {filteredRecords.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    className={record.id === selectedId ? 'record-item active' : 'record-item'}
                    onClick={() => {
                      if (exportSelectionMode === 'pdf') {
                        setSelectedId(record.id)
                        setExportSelectionMode(null)
                        void exportRecordPdf(record)
                        return
                      }

                      editRecord(record)
                    }}
                  >
                    <strong>{record.serialNumber}</strong>
                    <span>
                      {record.returnLocation || '未填寫'}／{record.customerName || '未填寫'}／{getPurchaseTypeLabel(record.purchaseType)}
                    </span>
                    <small>
                      {record.receivedDate} · {getRepairStatusLabel(record)}{record.attachments.length > 0 ? '（有附件）' : ''}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <section className="export-section">
            <h2>匯出</h2>
            <p className="mini-notice">{exportMessage}</p>
            <div className="export-actions">
              <button type="button" className="secondary-action" onClick={exportSelectedRecordPdf}>
                {exportSelectionMode === 'pdf' ? '取消選擇匯出單' : '匯出單筆 PDF'}
              </button>
              <button type="button" className="secondary-action" onClick={() => void exportAllRecordsExcel()}>
                依搜尋條件結果匯出 Excel
              </button>
            </div>
          </section>
          <section className="mobile-history-section">
            <h2>維修歷史</h2>
            {selectedRecord && serialHistory.length > 0 ? (
              <ul className="history-list">
                {serialHistory.map((record) => (
                  <li key={record.id}>
                    <strong>送回日期：{record.returnedDate || '尚未送回'}</strong>
                    <span>收費項目：{getHistoryChargeSummary(record)}</span>
                    <span>收費總額：{sumCharges(record.charges).toLocaleString()} 元</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">新維修表單輸入製造號碼並儲存後，會顯示相同設備的歷史維修摘要。</p>
            )}
          </section>
        </aside>

        <section className={mobileView === 'editor' ? 'editor-panel mobile-panel mobile-active' : 'editor-panel mobile-panel'}>
          <div className="panel-heading">
            <div>
              {selectedRecord ? <p className="eyebrow">{getRepairStatusLabel(selectedRecord)}</p> : null}
              <h2>{selectedRecord?.serialNumber || '新增維修紀錄'}</h2>
            </div>
            <div className="editor-actions">
              <button type="button" className="ghost-action" onClick={startNewRecord}>
                新增
              </button>
              <button type="button" className="primary-action" onClick={() => void saveRecord()} disabled={completed}>
                儲存
              </button>
            </div>
          </div>

          <p className={message.includes('不可') || message.includes('請完成') || message.includes('尚未儲存') ? 'notice warning' : 'notice'}>
            {message}
          </p>

          <form className="repair-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              收到日期 *
              <DateField
                value={form.receivedDate}
                disabled={completed}
                onChange={(value) => updateForm('receivedDate', value)}
              />
            </label>
            <label>
              回送地點 *
              <input
                value={form.returnLocation}
                disabled={completed}
                onChange={(event) => updateForm('returnLocation', event.target.value)}
              />
            </label>
            <label>
              製造號碼 *
              <input
                value={form.serialNumber}
                disabled={completed}
                maxLength={16}
                inputMode="text"
                autoCapitalize="characters"
                aria-invalid={Boolean(serialNumberError)}
                onChange={(event) => updateForm('serialNumber', event.target.value.toUpperCase())}
                onBlur={() => {
                  if (serialNumberError) {
                    setMessage(serialNumberError)
                  }
                }}
              />
            </label>
            <label>
              客戶姓名
              <input
                value={form.customerName}
                disabled={completed}
                onChange={(event) => updateForm('customerName', event.target.value)}
              />
            </label>
            <label>
              出貨日期
              <DateField
                value={form.shippedDate}
                disabled={completed}
                onChange={(value) => updateForm('shippedDate', value)}
              />
            </label>
            <label>
              機器屬性
              <select
                value={form.purchaseType}
                disabled={completed}
                onChange={(event) => updateForm('purchaseType', event.target.value as PurchaseType)}
              >
                <option value="">未選擇</option>
                <option value="customer">門市客人</option>
                <option value="online">網購</option>
                <option value="demo">展示機</option>
              </select>
            </label>
            <label>
              維修日期
              <DateField
                value={form.repairDate}
                disabled={completed}
                onChange={(value) => updateForm('repairDate', value)}
              />
            </label>
            <label>
              故障分類
              <select
                value={form.faultCategory}
                disabled={completed}
                onChange={(event) => updateForm('faultCategory', event.target.value)}
              >
                <option value="">未選擇</option>
                {DEFAULT_FAULT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              保固期判斷
              <input
                value={getWarrantyStatus(form.receivedDate, form.shippedDate)}
                disabled
                readOnly
              />
            </label>
            <fieldset className="wide-field option-fieldset" disabled={completed}>
              故障零件
              <div className="option-grid">
                {availableFaultParts.map((part) => (
                  <label key={part}>
                    <input
                      type="checkbox"
                      checked={formFaultParts.includes(part)}
                      onChange={() => toggleFaultPart(part)}
                    />
                    {part}
                  </label>
                ))}
              </div>
            </fieldset>
            {formFaultParts.length > 0 ? (
              <fieldset className="wide-field part-charge-grid" disabled={completed}>
                <legend>零件收費</legend>
                {formFaultParts.map((part) => (
                  <label key={part}>
                    {part}
                    <input
                      type="number"
                      min="0"
                      value={form.partChargeAmounts[part] ?? 0}
                      onFocus={(event) => {
                        if (event.currentTarget.value === '0') {
                          event.currentTarget.select()
                        }
                      }}
                      onChange={(event) => updatePartCharge(part, Number(event.target.value))}
                    />
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label>
              檢修測試費
              <input
                type="number"
                min="0"
                value={form.inspectionFee}
                disabled={completed}
                onFocus={(event) => {
                  if (event.currentTarget.value === '0') {
                    event.currentTarget.select()
                  }
                }}
                onChange={(event) => updateForm('inspectionFee', Number(event.target.value))}
              />
            </label>
            <label>
              運費
              <input
                type="number"
                min="0"
                value={form.shippingFee}
                disabled={completed}
                onFocus={(event) => {
                  if (event.currentTarget.value === '0') {
                    event.currentTarget.select()
                  }
                }}
                onChange={(event) => updateForm('shippingFee', Number(event.target.value))}
              />
            </label>
            <label>
              送回日期
              <input
                type="date"
                value={form.returnedDate}
                disabled={completed}
                onChange={(event) => updateForm('returnedDate', event.target.value)}
              />
            </label>
            <p className="completion-warning wide-field">
              注意：如輸入送回日期並儲存後，此維修單將鎖定，不提供再次編輯以及刪除之功能。
            </p>
            <label className="wide-field">
              維修內容
              <textarea
                rows={4}
                value={form.repairContent}
                disabled={completed}
                onChange={(event) => updateForm('repairContent', event.target.value)}
              />
            </label>
            <label className="wide-field">
              備註
              <textarea
                rows={3}
                value={form.note}
                disabled={completed}
                onChange={(event) => updateForm('note', event.target.value)}
              />
            </label>
          </form>
          <section className="attachment-section">
            <h2>附件</h2>
            <p className={attachmentMessage.includes('不可') || attachmentMessage.includes('僅支援') ? 'mini-notice warning' : 'mini-notice'}>
              {attachmentMessage}
            </p>
            <fieldset className="attachment-description" disabled={completed}>
              <legend>照片說明</legend>
              <div className="option-grid">
                {ATTACHMENT_DESCRIPTIONS.map((description) => (
                  <label key={description}>
                    <input
                      type="radio"
                      name="attachment-description"
                      value={description}
                      checked={attachmentDescription === description}
                      onChange={() => setAttachmentDescription(description)}
                    />
                    {description}
                  </label>
                ))}
              </div>
              {attachmentDescription === '其他' ? (
                <input
                  value={customAttachmentDescription}
                  placeholder="輸入照片說明"
                  onChange={(event) => setCustomAttachmentDescription(event.target.value)}
                />
              ) : null}
            </fieldset>
            <div className="attachment-file-actions">
              <label className={completed || attachmentList.length >= 5 ? 'file-action disabled' : 'file-action'}>
                拍照新增
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={completed || attachmentList.length >= 5}
                  onChange={(event) => {
                    void addAttachment(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              <label className={completed || attachmentList.length >= 5 ? 'file-action disabled' : 'file-action'}>
                從裝置選擇
                <input
                  type="file"
                  accept="image/*"
                  disabled={completed || attachmentList.length >= 5}
                  onChange={(event) => {
                    void addAttachment(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
            {attachmentList.length > 0 ? (
              <ul className="attachment-list">
                {attachmentList.map((attachment, index) => (
                  <li key={attachment.id}>
                    <button type="button" className="attachment-preview" onClick={() => setPreviewAttachment(attachment)}>
                      {getAttachmentPreviewUrl(attachment) ? (
                        <img src={getAttachmentPreviewUrl(attachment)} alt={attachment.label} />
                      ) : null}
                      <span>{attachment.label || getAttachmentLabel(index)}</span>
                    </button>
                    <small>
                      {(attachment.size / 1024).toFixed(0)} KB · {attachment.syncStatus}
                    </small>
                    <div className="attachment-actions">
                      <label className={completed ? 'text-action disabled' : 'text-action'}>
                        拍照更換
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={completed}
                          onChange={(event) => {
                            void replaceAttachment(attachment.id, event.target.files)
                            event.currentTarget.value = ''
                          }}
                        />
                      </label>
                      <label className={completed ? 'text-action disabled' : 'text-action'}>
                        選擇更換
                        <input
                          type="file"
                          accept="image/*"
                          disabled={completed}
                          onChange={(event) => {
                            void replaceAttachment(attachment.id, event.target.files)
                            event.currentTarget.value = ''
                          }}
                        />
                      </label>
                      <button type="button" className="text-action danger" disabled={completed} onClick={() => removeAttachment(attachment.id)}>
                        刪除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">尚未加入照片，可新增最多五張圖片。</p>
            )}
            <section className="charge-summary mobile-charge-summary">
              <h2>收費摘要</h2>
              {selectedRecord ? (
                <>
                  <ul className="charge-list">
                    {selectedRecord.charges.map((charge) => (
                      <li key={charge.id}>
                        <span>{charge.label}</span>
                        <strong>{charge.amount.toLocaleString()} 元</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="total-row">
                    <span>維修總金額</span>
                    <strong>{sumCharges(selectedRecord.charges).toLocaleString()} 元</strong>
                  </div>
                </>
              ) : (
                <p className="empty-state">儲存後會產生檢修測試費、運費與零件費用。</p>
              )}
            </section>
          </section>
        </section>

        <aside className={mobileView === 'details' ? 'side-panel mobile-panel mobile-active' : 'side-panel mobile-panel'}>
          <section className="charge-summary desktop-charge-summary">
            <h2>收費摘要</h2>
            {selectedRecord ? (
              <>
                <ul className="charge-list">
                  {selectedRecord.charges.map((charge) => (
                    <li key={charge.id}>
                      <span>{charge.label}</span>
                      <strong>{charge.amount.toLocaleString()} 元</strong>
                    </li>
                  ))}
                </ul>
                <div className="total-row">
                  <span>維修總金額</span>
                  <strong>{sumCharges(selectedRecord.charges).toLocaleString()} 元</strong>
                </div>
              </>
            ) : (
              <p className="empty-state">儲存後會產生檢修測試費、運費與零件費用。</p>
            )}
          </section>

          <section className="sync-section">
            <h2>同步規劃</h2>
            <p className="empty-state">
              待同步 {syncSummary.pending} 筆；失敗 {syncSummary.failed} 筆。
            </p>
            <p className={syncSummary.failed > 0 ? 'mini-notice warning' : 'mini-notice'}>{syncMessage}</p>
            {syncSummary.failed > 0 ? (
              <p className="mini-notice warning">同步未完成，請確認提示內容後再次同步。</p>
            ) : null}
            <button type="button" className="secondary-action" onClick={() => void runSyncQueue()}>
              {syncSummary.failed > 0 ? '再次同步' : '立即同步'}
            </button>
            <ul className="sync-list">
              {syncPlan.map((item) => (
                <li key={item.target}>
                  <span>{item.title}</span>
                  <small>{getSyncStatusLabel(item.status)}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className="desktop-history-section">
            <h2>維修歷史</h2>
            {selectedRecord && serialHistory.length > 0 ? (
              <ul className="history-list">
                {serialHistory.map((record) => (
                  <li key={record.id}>
                    <strong>送回日期：{record.returnedDate || '尚未送回'}</strong>
                    <span>收費項目：{getHistoryChargeSummary(record)}</span>
                    <span>收費總額：{sumCharges(record.charges).toLocaleString()} 元</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">新維修表單輸入製造號碼並儲存後，會顯示相同設備的歷史維修摘要。</p>
            )}
          </section>

        </aside>
      </div>
      {previewAttachment && getAttachmentPreviewUrl(previewAttachment) ? (
        <div className="preview-dialog" role="dialog" aria-modal="true" aria-label="附件預覽">
          <button type="button" className="preview-backdrop" onClick={() => setPreviewAttachment(null)} aria-label="關閉預覽" />
          <div className="preview-content">
            <div className="preview-header">
              <strong>{previewAttachment.label}</strong>
              <button type="button" className="ghost-action" onClick={() => setPreviewAttachment(null)}>
                關閉
              </button>
            </div>
            <img src={getAttachmentPreviewUrl(previewAttachment)} alt={previewAttachment.label} />
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
