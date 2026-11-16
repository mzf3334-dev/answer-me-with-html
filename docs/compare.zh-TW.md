# 和同類工具的對比

[English](compare.md)

把 Agent 的輸出變成可視內容的工具不止這一個。最常被拿來比較的有兩個：[Archify](https://github.com/tt-a1i/archify)，以及 DeepSeek Harness 上的 GenUI 外掛，比如 [dsh-genui](https://github.com/omdsh-dev/dsh-genui)。三者做的是不同的事。

| | Answer me with HTML | Archify | dsh-genui |
| :--- | :--- | :--- | :--- |
| 模型寫什麼 | 一份 Markdown 稿件 | 一份帶型別的 JSON 規格 | `dsh-ui` 圍欄裡的 JSON |
| 得到什麼 | 一頁回答整個問題的頁面 | 一張可交互的圖 | 聊天回覆裡的元件 |
| 能放什麼 | 正文、表格、引用自你檔案的真實程式碼、12 種元件（flow、er、sequence、tree、timeline 等） | 5 種圖：架構、工作流、時序、資料流、生命週期 | 30 多種元件：卡片、表格、圖表、表單、測驗、3D 場景 |
| 在哪能用 | 任何能執行 shell 命令的 Agent：Claude Code、Codex、Cursor、OpenCode、Pi | Claude Code、Codex、opencode、Cursor；Claude.ai 需上傳 | DeepSeek Harness 的 Web 介面 |
| 產物 | 單個 `.html` 檔案，沒有 CDN 和網路字體，離線能打開 | 單個 `.html` 檔案 | 顯示在聊天裡；渲染完成的塊可匯出為 HTML |
| 交互 | 在頁面上評論、做決定；一鍵彙總成一條訊息貼回給 Agent | 聚焦、路徑追蹤、搜尋、示範模式，匯出 PNG / SVG / WebM | 按鈕、表單、測驗把事件發回給模型；模型邊寫邊渲染 |
| 檢查 | 稿件出錯時返回行號和改法；ASD-STE100 寫作檢查 | 交付前檢查規格、版面和連線 | 規格守衛丟掉不合法的節點 |
| 影片 | `am video`：帶旁白的 3Blue1Brown 風格 | 匯出帶動畫的圖 | 無 |

## 按要做的事選

- **Archify**：你要一張系統圖，用來探索、示範，或匯出成圖片和影片。它在圖上的功能比我們多。
- **dsh-genui**：你在 DeepSeek Harness 的 Web 介面裡工作，想在聊天裡得到一個能操作的工具，比如表單、測驗，點選後會回到模型。
- **Answer me with HTML**：你在終端 Agent 裡工作，想把整個回答變成一頁，裡面有解釋、對比、程式碼和圖。這一頁可以讀、可以留著，也可以發給別人。

## 這個 skill 的不同之處

- **一整頁，不只是一張圖。** 難的問題除了圖，旁邊還需要文字和表格。Agent 按回答的結構挑元件。
- **模型只寫內容。** 版面、顏色和所有座標都由 CLI 來算。在我們的[基準測試](../bench/README.md)裡，一頁稿件約 600 個 token，同一個問題直接手寫 HTML 約 4,900 個。我們沒有測過 Archify 和 dsh-genui。
- **不依賴宿主。** Agent 執行一條 shell 命令就行，不需要聊天應用來渲染。
- **內容可信。** 程式碼塊引用你的真實檔案，寫作檢查讓句子保持簡短、直白。

關於 Archify 和 dsh-genui 的資訊來自它們的 README，核對於 2026-10-07。如果這裡有過時的內容，歡迎[提 issue](https://github.com/mzf3334-dev/answer-me-with-html/issues)。
