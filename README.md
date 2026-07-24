# 維修紀錄系統

一套依 `docs` 規格開發的維修紀錄 PWA，目標是集中管理維修案件、照片附件、費用、歷史紀錄、同步與匯出。

## 目前進度

- Phase 1 基礎骨架已建立：登入入口、首頁工作台、維修紀錄列表、新增與編輯畫面。
- Google OAuth 前端接線已建立，可透過 `VITE_GOOGLE_CLIENT_ID` 啟用；未設定時會使用本機開發登入。
- 維修紀錄核心規則已落地：必填欄位、完成後鎖定、同製造號碼不可重複建立未完成案件、保固提示。
- Phase 2 部分能力已補上：故障零件自動產生零件收費欄位、同製造號碼歷史維修摘要。
- Phase 3 本機附件管理已補上：最多五張圖片、超過 1.5 MB 自動壓縮、預覽、更換、刪除、完成後鎖定。
- Phase 5 查詢已補上：姓名、製造號碼、回送地點、收到日期區間與故障分類即時篩選；輸入查詢條件時顯示全部狀態，統計卡可明確切換維修中／已完成。
- Phase 6 匯出已補上：單筆 PDF 在電腦維持瀏覽器列印另存；手機／平板以逐頁 Canvas 產生 A4 實際 PDF 後開啟系統 App 選擇面板，交由 PDF 閱讀器、檔案管理或雲端 App 預覽與儲存，可避免長內容產生空白 PDF。檔名為 `維修報告_YYYYMMDD_客戶名稱.pdf`；手機匯出時會保留完整的置中公司名稱，附件清單會另起一張 A4 頁，且照片與說明不會跨頁切割。無附件時略過附件清單頁；全部資料可匯出含「維修紀錄／收費明細」兩張工作表的 `.xlsx`。
- 已建立 Vitest 自動化測試基礎，涵蓋製造號碼、完成判定、Excel 匯出資料與列印附件頁判定；持續擴充同步與資料服務測試。
- 可替換式服務架構已補上：維修資料、附件儲存、匯出、同步佇列與同步 processor 皆有獨立介面或模組。
- Firebase / Firestore 維修文字資料同步已串接，Google 登入、雲端寫入與跨電腦讀取已完成實機驗證。
- Drive 附件代理與草稿照片、照片說明、拍照入口、預覽、故障選項及同步提示已實作；重新載入時會保留本機預覽，並以 Drive 縮圖作為既有附件備援。Google Drive 照片預覽仍待實機複驗，詳見 `docs/05_交接紀錄.md`。
- 製造號碼會自動轉為大寫，格式固定為 `NIS-` 加 12 碼英數字（共 16 碼）。送回日期儲存後會鎖定案件，並切換到已完成清單。
- 響應式工作台已調整：窄版收費摘要位於附件下方，歷史維修位於維修紀錄列表最下方；寬版維持右側資訊欄。
- PWA 基礎已建立：`manifest.webmanifest` 與 service worker。
- PWA / 網頁圖示已由 `public/repair-system-icon-sheet.png` 裁切產生，包含 favicon、Apple touch icon、192/512 PWA icon 與分享縮圖。

## 開發啟動

```powershell
npm install
& 'C:\Program Files\nodejs\npm.cmd' run dev -- --host 127.0.0.1 --port 5173
```

開啟：

```text
http://127.0.0.1:5173/Repair-Record-System/
```

## 環境變數

請複製 `.env.example` 建立 `.env`，並填入 Google OAuth Client ID：

```env
# Google OAuth Web Client
VITE_GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com

# Firebase / Firestore
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=

# Google Drive attachments
VITE_GOOGLE_DRIVE_FOLDER_ID=
VITE_GOOGLE_DRIVE_SCOPE=https://www.googleapis.com/auth/drive.file
```

`VITE_GOOGLE_CLIENT_ID` 不是 Email，必須是 Google Cloud Console 建立的 OAuth 2.0 Client ID。

本機開發時需在 Google OAuth 的 Authorized JavaScript origins 加入：

```text
http://127.0.0.1:5173
http://localhost:5173
```

GitHub Pages 專案頁部署時，Google OAuth 的 Authorized JavaScript origins 需加入帳號網域，不包含 repo 路徑：

```text
https://你的GitHub帳號.github.io
```

本專案固定部署到 GitHub Pages 專案頁，因此 `vite.config.ts` 已設定：

```ts
base: '/Repair-Record-System/'
```

這是專案設定，不需要每次部署手動設定。

## 常用指令

```powershell
npm run lint
npm run build
npm run deploy:check
```

GitHub Pages 部署由 `.github/workflows/deploy-pages.yml` 負責。push 到 `main` 後會自動 lint、build 並部署 `dist`。

## 文件索引

- `docs/01_需求分析.md`：系統需求與核心業務規則。
- `docs/02_系統架構.md`：PWA、Google OAuth、Firestore、Drive 與模組架構。
- `docs/03_開發 Roadmap.md`：Phase 1 到 Phase 7 開發順序。
- `docs/04_工作規範.md`：後續開發規範。
- `docs/05_交接紀錄.md`：目前進度、未完成事項與下一步。
- `docs/06_外部資源連結設定.md`：Google OAuth、GitHub Pages、Firestore、Google Drive 與部署資源設定。
- `docs/07_專案現況.md`：僅記錄目前已完成能力與後續待辦的最新快照。
- `src/agent.ts`：給後續 agent/開發者快速掌握專案規則的入口。

## 下一步

1. 實機驗證 Drive 已同步照片的預覽與重新載入後顯示。
2. 驗證完成案件儲存、統計卡篩選與手機窄版版面。
3. 補上同步、Firestore fallback 與附件預覽的自動化測試。
