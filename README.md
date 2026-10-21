# World Signal

一個聚焦人工智能、科技、金融與社會動盪的全球新聞網站。新聞列表透過 [GDELT](https://www.gdeltproject.org/) 的 DOC API 查找最近七日的報導，點擊標題可閱讀原始來源。網站不儲存或改寫新聞全文。

## 主頁

主頁採用深色新聞終端版面，同時展示四個主題的最新焦點、各主題五則報導、時間排序快訊及完整新聞列表。可依關鍵字、主題與來源地區篩選，列表每次顯示四十則。主頁數量與小圖表由已載入的新聞計算，不代表股價或市場行情。

## 本機執行

需要 Node.js 24 或更新版本（使用內建代理支援）。專案沒有第三方套件，因此不需要執行 `npm install`。

```sh
cd /workspace/newa
npm start
```

在瀏覽器開啟 `http://localhost:3000`。可用 `PORT` 指定其他連接埠。開發時可使用 `npm run dev`，驗證可使用 `npm test`。

伺服器需要能連接 `https://api.gdeltproject.org`，否則網站會讀取 `public/news.json` 的最近新聞快照。啟動命令使用 Node.js 的 `--use-env-proxy`，讓雲端環境的 HTTPS 代理設定生效。API 以十分鐘快取降低請求量；來源短暫失敗時會展示最後成功取得的資料。

## GitHub Pages 發布

`.github/workflows/pages.yml` 在推送到 `main`、手動執行，或每三小時的排程觸發時執行：驗證程式、更新 `public/news.json`，再將 `public/` 發布到 GitHub Pages。新聞優先由 GDELT 取得；若無法連線，會嘗試 Google News RSS。這不需要在 GitHub Pages 上執行 Node 伺服器。

儲存庫的 **Settings → Pages → Build and deployment → Source** 須設定為 **GitHub Actions**。若任何主題首次從兩個來源抓取均失敗，部署會停止，避免發布空白新聞。之後某一主題短暫失敗時，會保留該主題上一次成功的報導並在頁面提示。網站上的搜尋與來源地區篩選會在已下載的快照內進行；若快照只有 RSS 報導，由於缺少可靠的媒體所在國家資料，地區篩選會暫時停用。

## 資料說明

- 本機 Node 伺服器會向 GDELT 即時查詢；GitHub Pages 使用定期建立的新聞快照。來源地區指媒體所在國家，不代表事件發生地。
- 「最新」是 GDELT 最近七日收錄的報導，頁面顯示收錄時間，並非發布時間。
- 新聞以原文標題呈現，部分報導可能有重複或分類誤差。
- 網站所列新聞及金融內容不構成投資建議。

### 中英標題與圖片
發布流程會將每則標題轉為繁體中文及英文，使用 Google Translate 公開端點（非保證可用的正式 API），並透過 GitHub Actions cache 重用上一版譯文。翻譯失敗會中止發布，保留線上上一版，避免發布缺少對照的新聞。譯文僅供參考，原始標題與原文連結仍保留。搜尋支援兩種語言。

圖片優先採用 GDELT socialimage 或 RSS media/enclosure；缺圖或圖片失效時顯示標註「主題示意圖」的圖案，並非現場照片。首次本機開發請先執行 `node scripts/build-news.js` 取得完整雙語快照；即時 API 的未翻譯資料會顯示翻譯未提供提示。

### World Monitor 地圖
首頁嵌入 [World Monitor 的官方免費 Live Map](https://www.worldmonitor.app/docs/embed-live-map)，顯示衝突、地震、天氣三個圖層。免費嵌入不需金鑰，每小時更新；額外提供 World Monitor 科技與金融看板連結。地圖由 World Monitor 自行託管，與本站的 GDELT / RSS 新聞資料沒有逐篇地理關聯。若第三方地圖不可用，讀者可透過地圖下方連結直接開啟完整看板。本站沒有複製 World Monitor 的 AGPL 原始碼或透過其付費 API 抓取內容。
