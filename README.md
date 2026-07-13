# 維修紀錄系統

一套依 `docs` 規格開發的維修紀錄 PWA，目標是集中管理維修案件、照片附件、費用、歷史紀錄、同步與匯出。

## 目前進度

- Phase 1 基礎骨架已建立：登入入口、首頁工作台、維修紀錄列表、新增與編輯畫面。
- Google OAuth 前端接線已建立，可透過 `VITE_GOOGLE_CLIENT_ID` 啟用；未設定時會使用本機開發登入。
- 維修紀錄核心規則已落地：必填欄位、完成後鎖定、同製造號碼不可重複建立未完成案件、保固提示。
- Phase 2 部分能力已補上：故障零件自動產生零件收費欄位、同製造號碼歷史維修摘要。
- Phase 3 本機附件管理已補上：最多五張圖片、超過 1.5 MB 自動壓縮、預覽、更換、刪除、完成後鎖定。
- Phase 5 本機搜尋已補上：姓名、製造號碼、回送地點、年月與故障分類即時篩選。
- Phase 6 瀏覽器匯出已補上：單筆列印頁面可另存 PDF、全部資料 CSV 可用 Excel 開啟。
- 可替換式服務架構已補上：維修資料、附件儲存、匯出、同步佇列與同步 processor 皆有獨立介面或模組。
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
VITE_GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
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
- `src/agent.ts`：給後續 agent/開發者快速掌握專案規則的入口。

## 下一步

1. 以正式 `VITE_GOOGLE_CLIENT_ID` 驗證 Google OAuth 登入流程。
2. push 到 `main`，驗證 GitHub Pages Actions 部署。
3. 建立 Firestore repository，替換目前 `localStorage` 儲存。
4. 建立 Google Drive 附件上傳流程，替換目前本機附件暫存。
5. 將瀏覽器列印/CSV 匯出替換或擴充為正式 PDF 與 `.xlsx` 產出。
6. 補維修紀錄、附件、同步與搜尋規則測試。
