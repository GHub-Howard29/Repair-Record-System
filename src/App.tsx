import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  clearStoredAuthUser,
  getStoredAuthUser,
  renderGoogleSignInButton,
  signInWithGoogle,
  type AuthUser,
} from './auth/googleAuth'
import { appConfig, isFirebaseConfigured, isGoogleAuthConfigured } from './config/appConfig'
import { buildSyncPlan } from './features/sync/syncPlan'
import { getSyncEnvironment } from './features/sync/syncEnvironment'
import { processSyncQueue } from './features/sync/syncProcessor'
import {
  enqueueAttachmentSync,
  enqueueRepairTextSync,
  loadSyncQueue,
  summarizeSyncQueue,
  type SyncTask,
} from './features/sync/syncQueue'
import {
  buildRepairRecord,
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
import { localAttachmentStorageService } from './services/attachmentStorageService'
import { browserExportService } from './services/exportService'
import { getFirebaseAuth } from './services/firebaseClient'
import { firestoreRepairRecordService } from './services/firestoreRepairRecordService'
import { localRepairRecordService } from './storage/repairRepository'
import type { PurchaseType, RepairAttachment, RepairFormValues, RepairRecord } from './types/repair'

const repairRecordService = isFirebaseConfigured() ? firestoreRepairRecordService : localRepairRecordService

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuthUser())
  const [records, setRecords] = useState<RepairRecord[]>([])
  const [syncTasks, setSyncTasks] = useState<SyncTask[]>(() => loadSyncQueue())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedRecord = records.find((record) => record.id === selectedId)
  const [form, setForm] = useState<RepairFormValues>(() => toRepairFormValues())
  const [searchText, setSearchText] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [allowMobileAttachmentSync, setAllowMobileAttachmentSync] = useState(false)
  const [message, setMessage] = useState(
    isGoogleAuthConfigured() ? '請先以 Google 登入開始作業。' : '尚未設定 Google Client ID，目前使用本機開發登入。',
  )
  const [attachmentMessage, setAttachmentMessage] = useState('請先儲存維修紀錄，再新增附件。')
  const [syncMessage, setSyncMessage] = useState('同步佇列會保留文字與附件待同步資料。')
  const [exportMessage, setExportMessage] = useState('可匯出單筆維修紀錄或全部資料。')
  const [previewAttachment, setPreviewAttachment] = useState<RepairAttachment | null>(null)
  const [authMessage, setAuthMessage] = useState(
    isGoogleAuthConfigured() ? '正式 Google OAuth 已設定。' : '請在 .env 設定 VITE_GOOGLE_CLIENT_ID 啟用正式登入。',
  )
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const completed = selectedRecord ? isRepairCompleted(selectedRecord) : false
  const formFaultParts = useMemo(() => parseFaultParts(form.faultPartsText), [form.faultPartsText])
  const serialHistory = useMemo(
    () =>
      records.filter(
        (record) =>
          record.id !== selectedRecord?.id &&
          record.serialNumber.trim().toLowerCase() === form.serialNumber.trim().toLowerCase(),
      ),
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
  const faultCategories = useMemo(
    () =>
      Array.from(new Set(records.map((record) => record.faultCategory).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [records],
  )
  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()

    return records.filter((record) => {
      const matchesText =
        !normalizedSearch ||
        record.customerName.toLowerCase().includes(normalizedSearch) ||
        record.serialNumber.toLowerCase().includes(normalizedSearch) ||
        record.returnLocation.toLowerCase().includes(normalizedSearch)
      const matchesDate = !dateFilter || record.receivedDate.startsWith(dateFilter)
      const matchesCategory = !categoryFilter || record.faultCategory === categoryFilter

      return matchesText && matchesDate && matchesCategory
    })
  }, [categoryFilter, dateFilter, records, searchText])

  useEffect(() => {
    let ignore = false

    async function loadRecords() {
      if (!user) {
        setRecords([])
        return
      }

      try {
        const nextRecords = await repairRecordService.list()

        if (!ignore) {
          setRecords(nextRecords)
        }
      } catch (error) {
        if (!ignore) {
          setMessage(error instanceof Error ? error.message : '資料載入失敗，請稍後再試。')
        }
      }
    }

    void loadRecords()

    return () => {
      ignore = true
    }
  }, [user])

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
    setSelectedId(null)
    setForm(toRepairFormValues())
    setMessage('新增維修紀錄：請完成收到日期、回送地點、製造號碼。')
    setAttachmentMessage('請先儲存維修紀錄，再新增附件。')
    setPreviewAttachment(null)
  }

  function editRecord(record: RepairRecord) {
    setSelectedId(record.id)
    setForm(toRepairFormValues(record))
    setMessage(isRepairCompleted(record) ? '此案件已完成，依規則只能檢視。' : '正在編輯維修中案件。')
    setAttachmentMessage(
      isRepairCompleted(record) ? '此案件已完成，附件已鎖定。' : '可新增、更換或刪除最多五張圖片附件。',
    )
    setPreviewAttachment(null)
  }

  function updateForm<K extends keyof RepairFormValues>(key: K, value: RepairFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
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

    try {
      const nextRecord = buildRepairRecord(form, selectedRecord)
      const nextRecords = await repairRecordService.save(nextRecord)
      const nextTasks = enqueueRepairTextSync(syncTasks, nextRecord)
      setRecords(nextRecords)
      setSyncTasks(nextTasks)
      setSelectedId(nextRecord.id)
      setForm(toRepairFormValues(nextRecord))
      setMessage(nextRecord.returnedDate ? '案件已完成並鎖定。' : '維修紀錄已儲存，文字資料列入待同步。')
      setAttachmentMessage(nextRecord.returnedDate ? '此案件已完成，附件已鎖定。' : '可新增、更換或刪除最多五張圖片附件。')
    } catch (error) {
      setMessage(buildSaveErrorMessage(error))
    }
  }

  async function addAttachment(files: FileList | null) {
    if (!selectedRecord || !files?.[0]) {
      return
    }

    if (isRepairCompleted(selectedRecord)) {
      setAttachmentMessage('已完成案件不可異動附件。')
      return
    }

    const file = files[0]
    const validationError = validateAttachmentFile(file, selectedRecord.attachments)

    if (validationError) {
      setAttachmentMessage(validationError)
      return
    }

    try {
      const attachment = await createAttachmentFromFile(file, selectedRecord.attachments.length)
      const nextRecord = {
        ...selectedRecord,
        attachments: [...selectedRecord.attachments, attachment],
        updatedAt: new Date().toISOString(),
      }

      await persistRecord(nextRecord, attachment.id)
      setAttachmentMessage(attachment.compressed ? '已自動壓縮照片，以符合系統限制。' : '附件已加入待同步清單。')
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : '附件處理失敗。')
    }
  }

  async function replaceAttachment(attachmentId: string, files: FileList | null) {
    if (!selectedRecord || !files?.[0]) {
      return
    }

    if (isRepairCompleted(selectedRecord)) {
      setAttachmentMessage('已完成案件不可異動附件。')
      return
    }

    const file = files[0]
    const validationError = validateAttachmentFile(file, selectedRecord.attachments, true)

    if (validationError) {
      setAttachmentMessage(validationError)
      return
    }

    try {
      const attachmentIndex = selectedRecord.attachments.findIndex((attachment) => attachment.id === attachmentId)
      const attachment = await createAttachmentFromFile(file, attachmentIndex)
      const nextRecord = {
        ...selectedRecord,
        attachments: selectedRecord.attachments.map((current) =>
          current.id === attachmentId ? { ...attachment, id: attachmentId } : current,
        ),
        updatedAt: new Date().toISOString(),
      }

      await persistRecord(nextRecord, attachmentId)
      setPreviewAttachment(null)
      setAttachmentMessage(attachment.compressed ? '已自動壓縮照片，以符合系統限制。' : '附件已更換並列入待同步。')
    } catch (error) {
      setAttachmentMessage(error instanceof Error ? error.message : '附件處理失敗。')
    }
  }

  function removeAttachment(attachmentId: string) {
    if (!selectedRecord) {
      return
    }

    if (isRepairCompleted(selectedRecord)) {
      setAttachmentMessage('已完成案件不可刪除附件。')
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

  async function persistRecord(record: RepairRecord, attachmentId?: string) {
    try {
      const nextRecords = await repairRecordService.save(record)
      const nextTextTasks = enqueueRepairTextSync(syncTasks, record)
      const nextTasks = attachmentId ? enqueueAttachmentSync(nextTextTasks, record.id, attachmentId) : nextTextTasks

      setRecords(nextRecords)
      setSyncTasks(nextTasks)
      setSelectedId(record.id)
      setForm(toRepairFormValues(record))
    } catch (error) {
      setMessage(buildSaveErrorMessage(error))
    }
  }

  async function runSyncQueue() {
    if (syncTasks.length === 0) {
      setSyncMessage('目前沒有待同步資料。')
      return
    }

    const result = await processSyncQueue(records, syncTasks, {
      allowMobileAttachmentSync,
      environment: getSyncEnvironment(),
      repairRecordService,
      attachmentStorageService: localAttachmentStorageService,
    })

    setRecords(result.records)
    setSyncTasks(result.tasks)
    setSyncMessage(result.message)

    if (selectedId) {
      const nextSelectedRecord = result.records.find((record) => record.id === selectedId)

      if (nextSelectedRecord) {
        setForm(toRepairFormValues(nextSelectedRecord))
      }
    }
  }

  async function exportSelectedRecordPdf() {
    if (!selectedRecord) {
      setExportMessage('請先選擇一筆維修紀錄。')
      return
    }

    try {
      await browserExportService.exportRecordPdf(selectedRecord)
      setExportMessage('已建立列印頁面，可使用瀏覽器另存 PDF。')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'PDF 匯出失敗。')
    }
  }

  async function exportAllRecordsExcel() {
    if (records.length === 0) {
      setExportMessage('目前沒有可匯出的維修紀錄。')
      return
    }

    try {
      await browserExportService.exportRecordsExcel(records)
      setExportMessage('已匯出 CSV，可使用 Excel 開啟。')
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
          <h1>維修紀錄系統</h1>
          <p className="login-copy">依文件規劃建立的 Phase 1 基礎：登入、列表、建立與編輯維修紀錄。</p>
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
        <div>
          <p className="eyebrow">Phase 1</p>
          <h1>維修紀錄工作台</h1>
        </div>
        <div className="header-actions">
          {user.picture ? <img className="avatar" src={user.picture} alt="" /> : null}
          <span>{user.name}</span>
          <button type="button" className="ghost-action" onClick={handleLogout}>
            登出
          </button>
        </div>
      </header>

      <section className="stats-row" aria-label="維修紀錄統計">
        <div>
          <span>{stats.total}</span>
          <p>全部紀錄</p>
        </div>
        <div>
          <span>{stats.active}</span>
          <p>維修中</p>
        </div>
        <div>
          <span>{stats.completed}</span>
          <p>已完成</p>
        </div>
        <div>
          <span>{stats.pendingSync}</span>
          <p>待同步</p>
        </div>
      </section>

      <div className="workspace-grid">
        <aside className="record-list" aria-label="維修紀錄列表">
          <div className="list-title">
            <h2>維修紀錄</h2>
            <button type="button" className="icon-action" onClick={startNewRecord} title="新增維修紀錄">
              +
            </button>
          </div>
          <div className="search-panel">
            <label>
              關鍵字
              <input
                value={searchText}
                placeholder="姓名、製造號碼、回送地點"
                onChange={(event) => setSearchText(event.target.value)}
              />
            </label>
            <label>
              年月
              <input type="month" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </label>
            <label>
              故障分類
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">全部</option>
                {faultCategories.map((category) => (
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
                    onClick={() => editRecord(record)}
                  >
                    <strong>{record.serialNumber}</strong>
                    <span>{record.customerName || record.returnLocation}</span>
                    <small>
                      {record.receivedDate} · {getRepairStatusLabel(record)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="editor-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{selectedRecord ? getRepairStatusLabel(selectedRecord) : '新增案件'}</p>
              <h2>{selectedRecord?.serialNumber || '建立維修紀錄'}</h2>
            </div>
            <button type="button" className="primary-action" onClick={() => void saveRecord()} disabled={completed}>
              儲存
            </button>
          </div>

          <p className={message.includes('不可') || message.includes('請完成') ? 'notice warning' : 'notice'}>
            {message}
          </p>

          <form className="repair-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              收到日期 *
              <input
                type="date"
                value={form.receivedDate}
                disabled={completed}
                onChange={(event) => updateForm('receivedDate', event.target.value)}
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
                onChange={(event) => updateForm('serialNumber', event.target.value)}
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
              <input
                type="date"
                value={form.shippedDate}
                disabled={completed}
                onChange={(event) => updateForm('shippedDate', event.target.value)}
              />
            </label>
            <label>
              購買屬性
              <select
                value={form.purchaseType}
                disabled={completed}
                onChange={(event) => updateForm('purchaseType', event.target.value as PurchaseType)}
              >
                <option value="">未選擇</option>
                <option value="customer">客人</option>
                <option value="online">網購</option>
                <option value="demo">展示機</option>
              </select>
            </label>
            <label>
              維修日期
              <input
                type="date"
                value={form.repairDate}
                disabled={completed}
                onChange={(event) => updateForm('repairDate', event.target.value)}
              />
            </label>
            <label>
              故障分類
              <input
                value={form.faultCategory}
                disabled={completed}
                onChange={(event) => updateForm('faultCategory', event.target.value)}
              />
            </label>
            <label className="wide-field">
              故障零件
              <input
                value={form.faultPartsText}
                disabled={completed}
                placeholder="以逗號或換行分隔"
                onChange={(event) => updateForm('faultPartsText', event.target.value)}
              />
            </label>
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
        </section>

        <aside className="side-panel">
          <section>
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
                  <span>總金額</span>
                  <strong>{sumCharges(selectedRecord.charges).toLocaleString()} 元</strong>
                </div>
              </>
            ) : (
              <p className="empty-state">儲存後會產生檢修測試費、運費與零件費用。</p>
            )}
          </section>

          <section>
            <h2>同步規劃</h2>
            <p className="empty-state">
              待同步 {syncSummary.pending} 筆；失敗 {syncSummary.failed} 筆。
            </p>
            <p className="mini-notice">{syncMessage}</p>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={allowMobileAttachmentSync}
                onChange={(event) => setAllowMobileAttachmentSync(event.target.checked)}
              />
              允許行動網路同步附件
            </label>
            <button type="button" className="secondary-action" onClick={() => void runSyncQueue()}>
              立即同步
            </button>
            <ul className="sync-list">
              {syncPlan.map((item) => (
                <li key={item.target}>
                  <span>{item.title}</span>
                  <small>{item.status}</small>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>附件</h2>
            <p className={attachmentMessage.includes('不可') || attachmentMessage.includes('僅支援') ? 'mini-notice warning' : 'mini-notice'}>
              {attachmentMessage}
            </p>
            {selectedRecord ? (
              <>
                <label className={completed || selectedRecord.attachments.length >= 5 ? 'file-action disabled' : 'file-action'}>
                  新增照片
                  <input
                    type="file"
                    accept="image/*"
                    disabled={completed || selectedRecord.attachments.length >= 5}
                    onChange={(event) => {
                      void addAttachment(event.target.files)
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
                {selectedRecord.attachments.length > 0 ? (
                  <ul className="attachment-list">
                    {selectedRecord.attachments.map((attachment, index) => (
                      <li key={attachment.id}>
                        <button type="button" className="attachment-preview" onClick={() => setPreviewAttachment(attachment)}>
                          {attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.label} /> : null}
                          <span>{attachment.label || getAttachmentLabel(index)}</span>
                        </button>
                        <small>
                          {(attachment.size / 1024).toFixed(0)} KB · {attachment.syncStatus}
                        </small>
                        <div className="attachment-actions">
                          <label className={completed ? 'text-action disabled' : 'text-action'}>
                            更換
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
                  <p className="empty-state">尚無附件，可新增最多五張圖片。</p>
                )}
              </>
            ) : (
              <p className="empty-state">請先儲存維修紀錄，再新增附件。</p>
            )}
          </section>

          <section>
            <h2>歷史維修</h2>
            {form.serialNumber && serialHistory.length > 0 ? (
              <ul className="history-list">
                {serialHistory.map((record) => (
                  <li key={record.id}>
                    <strong>{record.repairDate || record.receivedDate}</strong>
                    <span>{record.faultParts.length > 0 ? record.faultParts.join('、') : '未填寫故障零件'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">輸入製造號碼後，會顯示相同設備的維修摘要。</p>
            )}
          </section>

          <section>
            <h2>匯出</h2>
            <p className="mini-notice">{exportMessage}</p>
            <div className="export-actions">
              <button type="button" className="secondary-action" onClick={() => void exportSelectedRecordPdf()}>
                匯出單筆 PDF
              </button>
              <button type="button" className="secondary-action" onClick={() => void exportAllRecordsExcel()}>
                匯出全部 Excel
              </button>
            </div>
          </section>
        </aside>
      </div>
      {previewAttachment?.previewUrl ? (
        <div className="preview-dialog" role="dialog" aria-modal="true" aria-label="附件預覽">
          <button type="button" className="preview-backdrop" onClick={() => setPreviewAttachment(null)} aria-label="關閉預覽" />
          <div className="preview-content">
            <div className="preview-header">
              <strong>{previewAttachment.label}</strong>
              <button type="button" className="ghost-action" onClick={() => setPreviewAttachment(null)}>
                關閉
              </button>
            </div>
            <img src={previewAttachment.previewUrl} alt={previewAttachment.label} />
          </div>
        </div>
      ) : null}
    </main>
  )
}

function buildSaveErrorMessage(error: unknown): string {
  const baseMessage = error instanceof Error ? error.message : '請確認 Firestore 設定。'

  if (!isFirebaseConfigured()) {
    return `儲存失敗：${baseMessage}`
  }

  const currentUser = getFirebaseAuth().currentUser
  const email = currentUser?.email ?? '未取得 Firebase Auth email'

  return `儲存失敗：${baseMessage}｜Firebase email: ${email}｜project: ${appConfig.firebase.projectId}`
}

export default App
