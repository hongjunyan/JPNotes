# JPNotes — 日文學習網站設計文件

> 個人用的日文學習系統：寫筆記（含振り仮名與插圖）、從筆記收集單字/文法卡、用間隔重複（SRS）背誦、並做自我測驗。

---

## 1. 定位與技術棧

| 項目 | 決定 |
| --- | --- |
| 使用模式 | **單人 / 個人工具**。無註冊、無登入、無 `user_id`。 |
| 前端 | Vite + React + TypeScript |
| 後端 | Python FastAPI + SQLModel（SQLAlchemy 之上） |
| 資料庫 | SQLite（含 FTS5 全文索引） |
| 部署 | docker-compose：`frontend`（nginx）+ `backend`（uvicorn），設定走 `.env` |
| 開發 | 本機直跑（Vite HMR + `uvicorn --reload`）；docker 只用於正式 |

### 關鍵第三方套件

| 用途 | 套件 |
| --- | --- |
| 日文分詞 / 讀音 | `fugashi` + `unidic-lite` |
| 離線字典 + 漢字資訊 | `jamdict`（內含 JMdict + KanjiDic2 的 SQLite 資料） |
| Markdown 渲染 | `markdown-it` + 自訂 ruby rule |
| 程式碼高亮 | `highlight.js`（或 Shiki） |
| 原始碼編輯器 | CodeMirror 6 |
| 字型 | Noto Serif JP（內文閱讀）、Noto Sans JP（UI/標題） |
| 發音 | 瀏覽器 Web Speech API（前端，免後端） |

---

## 2. 目錄結構

```
JPNotes/
├── .env.example              # 設定範本（實際 .env 不進版控）
├── docker-compose.yml        # 正式部署
├── DESIGN.md
├── frontend/
│   ├── Dockerfile            # multi-stage: build → nginx
│   ├── nginx.conf            # 提供靜態檔 + 反向代理 /api → backend
│   ├── package.json
│   ├── vite.config.ts        # dev proxy /api → localhost:8000
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/              # API client（fetch 封裝）
│       ├── components/       # 共用元件（Ruby、CardEditor、TagPicker…）
│       ├── features/
│       │   ├── notes/        # 筆記編輯 / 瀏覽 / 搜尋
│       │   ├── cards/        # 卡片瀏覽 / 搜尋 / 加入
│       │   ├── review/       # SRS 每日複習（Anki 式翻卡）
│       │   ├── exam/         # 自由測驗（選擇題）
│       │   └── dashboard/    # 儀表板 / streak / 熱力圖
│       ├── lib/
│       │   ├── markdown.ts   # markdown-it 實例 + ruby plugin
│       │   └── tts.ts        # Web Speech API 封裝
│       └── styles/           # 主題（深/淺色）、閱讀排版
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py           # FastAPI app、CORS、路由掛載
│   │   ├── config.py         # 讀 .env（pydantic-settings）
│   │   ├── db.py             # engine / session / 建表 / FTS 觸發器
│   │   ├── models.py         # SQLModel 資料表
│   │   ├── schemas.py        # request/response Pydantic 模型
│   │   ├── routers/
│   │   │   ├── notes.py
│   │   │   ├── cards.py
│   │   │   ├── tags.py
│   │   │   ├── review.py
│   │   │   ├── exam.py
│   │   │   ├── images.py
│   │   │   ├── dict.py       # 讀音建議 / JMdict 查詢 / 漢字資訊
│   │   │   └── stats.py
│   │   └── services/
│   │       ├── furigana.py   # fugashi：文字 → 讀音
│   │       ├── dictionary.py # jamdict：JMdict 查詢
│   │       ├── kanji.py      # jamdict：KanjiDic 漢字資訊
│   │       └── srs.py        # SM-2 排程演算法
│   └── data/                 # 執行期資料（掛 volume；不進版控）
│       ├── jpnotes.db
│       └── images/
└── (docker volumes)          # db_data、image_data
```

---

## 3. 資料模型（SQLite schema）

### 3.1 `notes`

```sql
CREATE TABLE notes (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',   -- markdown 原始碼，含 {漢字|かんじ} 語法
    created_at  TEXT NOT NULL,              -- ISO8601
    updated_at  TEXT NOT NULL
);
```

### 3.2 `cards`（單字卡 + 文法卡，平行型別）

```sql
CREATE TABLE cards (
    id            INTEGER PRIMARY KEY,
    type          TEXT NOT NULL CHECK (type IN ('vocab', 'grammar')),
    word          TEXT NOT NULL,            -- 單字表記 / 文法句型
    reading       TEXT,                     -- 假名讀音（vocab 常用；grammar 可空）
    meaning_en    TEXT,                     -- JMdict 自動帶入
    meaning_zh    TEXT,                     -- 手動補中文
    pos           TEXT,                     -- 詞性（part of speech）
    example       TEXT,                     -- 例句（加入時擷取的整句）

    source_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,

    -- SRS（SM-2）欄位
    due_date      TEXT NOT NULL,            -- 下次到期（ISO8601 date）
    interval      INTEGER NOT NULL DEFAULT 0,   -- 天
    ease_factor   REAL    NOT NULL DEFAULT 2.5,
    repetitions   INTEGER NOT NULL DEFAULT 0,
    lapses        INTEGER NOT NULL DEFAULT 0,
    last_reviewed TEXT,

    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX idx_cards_due ON cards(due_date);
CREATE INDEX idx_cards_type ON cards(type);
```

### 3.3 標籤（全域 tag 池，notes 與 cards 共用）

```sql
CREATE TABLE tags (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE            -- 例：N4、N3、旅遊
);

CREATE TABLE note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE card_tags (
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (card_id, tag_id)
);
```

### 3.4 圖片

```sql
CREATE TABLE images (
    id          TEXT PRIMARY KEY,          -- uuid，作為檔名
    filename    TEXT NOT NULL,             -- 原始檔名
    mime        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
-- 實體檔存於 backend/data/images/<id>，透過 GET /api/images/<id> 提供
```

### 3.5 複習紀錄（供儀表板 / streak / 熱力圖）

```sql
CREATE TABLE review_logs (
    id          INTEGER PRIMARY KEY,
    card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    rating      INTEGER NOT NULL,          -- 1=Again 2=Hard 3=Good 4=Easy
    reviewed_at TEXT NOT NULL              -- ISO8601 datetime
);
CREATE INDEX idx_review_logs_date ON review_logs(reviewed_at);
```

### 3.6 全文搜尋（FTS5 trigram）

```sql
-- 筆記全文索引
CREATE VIRTUAL TABLE notes_fts USING fts5(
    title, content,
    content='notes', content_rowid='id',
    tokenize='trigram'
);

-- 卡片全文索引（單字 / 讀音 / 釋義）
CREATE VIRTUAL TABLE cards_fts USING fts5(
    word, reading, meaning_en, meaning_zh, example,
    content='cards', content_rowid='id',
    tokenize='trigram'
);
```
> 以 AFTER INSERT/UPDATE/DELETE 觸發器保持 FTS 與主表同步（`db.py` 建立）。
> trigram 支援中/日/英子字串搜尋；因筆記原始碼保留 `{漢字|かんじ}`，搜「かんじ」也能命中。

---

## 4. 振り仮名語法規格

- 語法：`{漢字|かんじ}` — 單一 pipe，前為表記、後為讀音。
- 渲染：`<ruby>漢字<rt>かんじ</rt></ruby>`。
- 編輯器輔助流程：
  1. 在 CodeMirror 選取漢字文字。
  2. 按快捷鍵 `Ctrl+Shift+F`（或 `Alt+R`）或工具列「振り仮名」鈕。
     以 window capture + `event.code` 比對實體按鍵：IME 啟用時 `event.key` 會變成
     `Process`，且 Windows 上 `Alt+Shift` 是輸入法切換鍵，故不用 `Alt+Shift+R`。
  3. 前端呼叫 `POST /api/dict/furigana`，後端用 `fugashi` 回傳讀音建議。
  4. 於編輯器就地把選取內容替換為 `{選取|建議讀音}`。
- `markdown.ts` 內以 markdown-it inline rule 解析此語法；rule 在程式碼區塊與行內程式碼中不作用。

### 畫重點（螢光筆）語法

- 語法：`==重點==`（預設黃色）；指定顏色 `=={green}重點==`，支援 `yellow / green / blue / pink`。
- 渲染：`<mark class="hl hl-{color}">`，以 CSS 漸層只覆蓋文字下半部（螢光筆效果），振り仮名不被蓋到；mark 內容仍走 inline 解析，可與 ruby 併用。
- 編輯器：工具列四個色點按鈕，或 `Ctrl+Shift+H`（黃色）。同色再按一次取消、不同色直接換色。
- 其他快捷鍵：`Ctrl+S` 儲存（停留在編輯頁）。

---

## 5. API 端點

所有端點前綴 `/api`。

### Notes
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/notes` | 列表（支援 `?q=`、`?tag=`、分頁） |
| POST | `/notes` | 建立 |
| GET | `/notes/{id}` | 取得單篇 |
| PUT | `/notes/{id}` | 更新 |
| DELETE | `/notes/{id}` | 刪除 |
| GET | `/notes/search?q=` | FTS 全文搜尋 |

### Cards
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/cards` | 列表（`?type=`、`?tag=`、`?q=`、分頁） |
| POST | `/cards` | 建立（可帶 `source_note_id`、`example`） |
| GET | `/cards/{id}` | 取得 |
| PUT | `/cards/{id}` | 更新 |
| DELETE | `/cards/{id}` | 刪除 |
| GET | `/cards/search?q=` | FTS 全文搜尋 |

### Tags
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/tags` | 全部標籤（含使用次數） |
| POST | `/tags` | 新增標籤 |
| DELETE | `/tags/{id}` | 刪除標籤 |

### 字典 / 漢字（jamdict + fugashi）
| Method | Path | 說明 |
| --- | --- | --- |
| POST | `/dict/furigana` | body `{text}` → 讀音建議 |
| GET | `/dict/lookup?word=` | JMdict 查詢（讀音、英文釋義、詞性）供加入卡片預填 |
| GET | `/dict/kanji/{char}` | 單一漢字資訊（部首、筆畫、音訓讀，KanjiDic） |

### 圖片
| Method | Path | 說明 |
| --- | --- | --- |
| POST | `/images` | 上傳（multipart）→ 回傳 `{id, url}` |
| GET | `/images/{id}` | 取得圖片檔 |

### SRS 複習
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/review/queue` | 今日到期卡片佇列（可 `?type=`、`?tag=`） |
| POST | `/review/{card_id}` | body `{rating: 1..4}` → SM-2 更新排程並寫 review_logs |

### 考試（選擇題）
| Method | Path | 說明 |
| --- | --- | --- |
| POST | `/exam/generate` | body `{type, tags?, level?, count}` → 產生一份選擇題（含自動干擾選項） |
| POST | `/exam/submit` | body `{answers}` → 回傳分數與逐題對錯（**不影響 SRS 排程**） |

### 統計 / 儀表板
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/stats/overview` | 今日到期數、總卡數、streak、保持率 |
| GET | `/stats/heatmap?days=` | 每日複習量（熱力圖用） |

---

## 6. SRS 演算法（SM-2）

- 評分：`1=Again, 2=Hard, 3=Good, 4=Easy`。
- 規則（每次複習）：
  - 若 `rating == 1`（Again）：`repetitions=0`、`interval=0`（當日/隔日再現）、`lapses+=1`，`ease_factor` 下修（下限 1.3）。
  - 否則：`repetitions += 1`；
    - `repetitions == 1` → `interval = 1`
    - `repetitions == 2` → `interval = 6`
    - 之後 → `interval = round(interval * ease_factor)`
  - `ease_factor` 依 SM-2 公式微調（Hard 下修、Easy 上修，下限 1.3）。
  - `due_date = today + interval`，寫入 `review_logs`。
- 演算法集中於 `services/srs.py`，純函式（input：目前卡片 SRS 狀態 + rating，output：新狀態），方便單元測試。

---

## 7. Docker / .env

### `docker-compose.yml`（正式）

```yaml
services:
  backend:
    build: ./backend
    env_file: .env
    volumes:
      - db_data:/app/data          # 內含 jpnotes.db
      - image_data:/app/data/images
    expose:
      - "8000"                     # 僅供內網，由 frontend 反代

  frontend:
    build: ./frontend
    env_file: .env
    ports:
      - "${APP_PORT}:80"           # 對外唯一入口
    depends_on:
      - backend

volumes:
  db_data:
  image_data:
```

- `frontend/nginx.conf`：`/` 提供 React 靜態檔；`location /api/ { proxy_pass http://backend:8000; }`（同源，無 CORS 問題）。

### `.env.example`

```dotenv
# 對外埠號
APP_PORT=8080

# 後端
DATABASE_URL=sqlite:////app/data/jpnotes.db
IMAGE_DIR=/app/data/images
MAX_UPLOAD_MB=10

# 前端 build 期（若需要）
VITE_API_BASE=/api
```

### 開發模式
- 後端：`cd backend && uvicorn app.main:app --reload`（DB/圖片走本機 `backend/data/`）。
- 前端：`cd frontend && npm run dev`，`vite.config.ts` 設 proxy `/api → http://localhost:8000`。

---

## 8. UI 分頁

1. **筆記**：清單 + 搜尋 + tag 篩選；編輯採雙欄（左 CodeMirror 原始碼、右即時預覽）；瀏覽採精美渲染（Noto Serif JP、深/淺色、程式碼高亮）。渲染頁選字可「加入卡片」。
2. **卡片**：單字/文法切換、tag 篩選、搜尋；卡片詳情含來源筆記連結、例句、TTS 發音、漢字資訊。
3. **複習**：SRS 今日佇列，Anki 式翻卡自評（Again/Hard/Good/Easy）。
4. **考試**：選範圍（type / tag / 等級 / 題數）→ 選擇題作答 → 計分與檢討（不影響 SRS）。
5. **儀表板**：今日到期、streak、複習熱力圖、保持率。

---

## 9. 額外學習機制

- **TTS 發音**：卡片與例句旁的喇叭鈕，Web Speech API 唸日文（`lib/tts.ts`）。
- **漢字資訊卡**：渲染頁/卡片頁點漢字，彈出部首、筆畫、音訓讀（`/dict/kanji/{char}`）。
- **來源回溯**：卡片記 `source_note_id` 與例句，可一鍵跳回原筆記、在情境中複習。
- **儀表板 + streak**：強化每日複習習慣。
- （Stretch）Anki / JSON 匯出；DB 已在 volume 上，可直接手動備份。

---

## 10. 建置順序（三階段遞增）

| 階段 | 範圍 |
| --- | --- |
| **P1** | Notes CRUD + 雙欄編輯 + 振り仮名（選取快捷鍵 + fugashi）+ 精美渲染 + 圖片上傳 + FTS 搜尋 + docker/.env 骨架 |
| **P2** | 卡片（從筆記選字加入 + JMdict/漢字資訊 + tag + 瀏覽/搜尋）+ SRS 複習（SM-2、Anki 式翻卡） |
| **P3** | 考試（選擇題 + 自動干擾）+ 儀表板/streak/熱力圖 + TTS + 漢字資訊卡 |

---

## 附錄：已定的關鍵決策

- 單人工具，無 auth。
- 振り仮名語法：`{漢字|かんじ}`。
- SRS 演算法：**SM-2**（非 FSRS）。
- 釋義：JMdict 英文為底，可手動補中文。
- 全域共用 tag 池。
- 搜尋：FTS5 trigram。
- 部署：nginx 反向代理 `/api`；本機開發、docker 只管正式。
- 閱讀主題：深/淺色，內文用 Noto Serif JP 輔體。
