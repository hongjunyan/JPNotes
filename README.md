# JPNotes 日本語ノート

個人用日文學習網站：Markdown 筆記（含振り仮名注音、插圖）、全文搜尋。設計細節見 [DESIGN.md](DESIGN.md)。

## 本機開發

```powershell
# 後端（第一次先建 venv 並安裝）
python -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -e ./backend
# 字典資料（下載一次即可，本機與 docker 共用 ./db_data/jamdict/jamdict.db）
backend\.venv\Scripts\python backend\scripts\fetch_jamdict_db.py
cd backend
.venv\Scripts\uvicorn app.main:app --reload   # http://localhost:8000

# 前端（另一個終端）
cd frontend
npm install
npm run dev                                    # http://localhost:5173（/api 已 proxy 到 8000）
```

## 正式部署（docker-compose）

```bash
cp .env.example .env   # 視需要調整 APP_PORT
python backend/scripts/fetch_jamdict_db.py   # 第一次：下載字典到 ./db_data/jamdict/
docker compose up -d --build
# 瀏覽 http://localhost:8080
```

所有資料（SQLite、圖片、jamdict 字典）集中在 `./db_data/`（bind mount 進容器的 `/app/data`），容器重建不會遺失；備份整個 `db_data` 資料夾即可。

## 使用方式

- **振り仮名**：編輯器中選取漢字，按 `Alt+Shift+R` 或工具列「ふりがな」，自動標注讀音（語法：`{漢字|かんじ}`）。
- **插圖**：直接在編輯器貼上或拖曳圖片。
- **搜尋**：支援標題、內文、假名讀音（FTS5 trigram，2 字以下自動退回模糊比對）。
- **標籤**：筆記可加標籤（如 N4、旅遊），列表頁可依標籤篩選。
- **自動清理**：刪除筆記時，只有該筆記引用的圖片會一併刪除（多篇共用的會保留），不再被任何筆記或卡片使用的標籤也會移除；另有 `POST /api/images/gc` 可全域回收孤兒圖片（上傳未滿 24 小時者受保護不回收）。
- **加入卡片**：筆記閱讀頁選取單字 → 浮動按鈕「＋ 加入卡片」→ 自動帶入讀音（MeCab）、英文釋義與詞性（JMdict 離線字典）、整句例句與來源筆記，可補中文意思與標籤。卡片分「單字」與「文法」兩種。
- **卡片頁**：瀏覽、搜尋（單字/讀音/意思/例句）、依類型與標籤篩選；點卡片可編輯或刪除。
- **複習（SRS）**：到期卡片自動排入每日佇列，Anki 式翻卡自評（忘記/困難/記得/簡單，SM-2 間隔重複）。鍵盤：空白鍵翻面、1–4 評分。
- **考試**：自選範圍（單字/文法、標籤、題數）出選擇題，干擾選項從其他卡片自動抽；即時對錯回饋、成績與答錯檢討。不影響 SRS 排程。鍵盤：1–4 作答、Enter 下一題。
- **儀表板**（首頁）：今日待複習、連續學習天數（streak）、30 天保持率、複習熱力圖（近半年）。
- **TTS 發音**：卡片與複習頁的 🔊 用瀏覽器語音唸日文（單字與例句）。
- **漢字資訊**：複習卡背面點漢字、或筆記閱讀頁選取單一漢字，查看筆畫、JLPT 等級、音訓讀與字義（KanjiDic2）。
