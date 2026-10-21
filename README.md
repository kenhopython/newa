# World Signal

一個聚焦人工智能、科技、金融與社會動盪的全球新聞網站。新聞列表透過 [GDELT](https://www.gdeltproject.org/) 的 DOC API 查找最近七日的報導，點擊標題可閱讀原始來源。網站不儲存或改寫新聞全文。

## 本機執行

需要 Node.js 24 或更新版本（使用內建代理支援）。專案沒有第三方套件，因此不需要執行 `npm install`。

```sh
cd /workspace/newa
npm start
```

在瀏覽器開啟 `http://localhost:3000`。可用 `PORT` 指定其他連接埠。開發時可使用 `npm run dev`，驗證可使用 `npm test`。

伺服器需要能連接 `https://api.gdeltproject.org`，否則網站會讀取 `public/news.json` 的最近新聞快照。啟動命令使用 Node.js 的 `--use-env-proxy`，讓雲端環境的 HTTPS 代理設定生效。API 以十分鐘快取降低請求量；來源短暫失敗時會展示最後成功取得的資料。

## GitHub Pages 發布

`.github/workflows/pages.yml` 在推送到 `main`、手動執行，或每三小時的排程觸發時執行：驗證程式、由 GDELT 更新 `public/news.json`，再將 `public/` 發布到 GitHub Pages。這不需要在 GitHub Pages 上執行 Node 伺服器。

儲存庫的 **Settings → Pages → Build and deployment → Source** 須設定為 **GitHub Actions**。首次執行需要 GDELT 可從 GitHub Actions 連線；若任何主題首次抓取失敗，部署會停止，避免發布空白新聞。之後某一主題短暫失敗時，會保留該主題上一次成功的報導並在頁面提示。網站上的搜尋與來源地區篩選會在已下載的快照內進行。

## 資料說明

- 本機 Node 伺服器會向 GDELT 即時查詢；GitHub Pages 使用定期建立的新聞快照。來源地區指媒體所在國家，不代表事件發生地。
- 「最新」是 GDELT 最近七日收錄的報導，頁面顯示收錄時間，並非發布時間。
- 新聞以原文標題呈現，部分報導可能有重複或分類誤差。
- 網站所列新聞及金融內容不構成投資建議。
