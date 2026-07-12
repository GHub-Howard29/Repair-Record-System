export const agentHandbook = {
  project: '維修紀錄系統',
  currentPhase: 'Phase 1：專案初始化',
  sourceDocs: [
    'docs/01_需求分析.md',
    'docs/02_系統架構.md',
    'docs/03_開發 Roadmap.md',
  ],
  nonNegotiableRules: [
    '維修紀錄建立後不得刪除。',
    '送回日期填寫後，案件與附件皆進入唯讀鎖定。',
    '同一製造號碼不得同時存在兩筆未完成維修紀錄。',
    '文字資料優先同步；附件獨立同步並支援離線暫存。',
  ],
  moduleMap: {
    auth: 'Google OAuth 登入、登出、登入狀態',
    repair: '維修案件建立、編輯、完成與鎖定規則',
    attachment: '照片壓縮、預覽、上傳與附件鎖定',
    search: '關鍵字、日期、故障分類與歷史維修查詢',
    warranty: '出貨日期 + 1 年 + 30 天保固判斷',
    export: 'PDF 與 Excel 匯出',
    sync: 'Firestore/Drive 同步、離線暫存與待同步管理',
  },
  handoffDocs: ['docs/04_工作規範.md', 'docs/05_交接紀錄.md'],
} as const

