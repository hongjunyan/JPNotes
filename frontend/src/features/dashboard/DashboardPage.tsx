import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeatmapDay, StatsOverview, api } from '../../api/client'

const HEATMAP_DAYS = 182 // ~26 weeks

/** Sequential steps (one hue, light→dark per theme) — index by activity level. */
const LEVELS = 5

function levelOf(count: number, max: number): number {
  if (count <= 0) return 0
  if (max <= 1) return 2
  const step = Math.ceil((count / max) * (LEVELS - 1))
  return Math.min(LEVELS - 1, Math.max(1, step))
}

interface Week {
  days: { date: string; count: number; level: number }[]
}

function buildWeeks(data: HeatmapDay[]): { weeks: Week[]; monthLabels: { index: number; label: string }[] } {
  const byDate = new Map(data.map((d) => [d.date, d.count]))
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - (HEATMAP_DAYS - 1))
  // align to the Sunday on/before start
  start.setDate(start.getDate() - start.getDay())

  const weeks: Week[] = []
  const monthLabels: { index: number; label: string }[] = []
  const max = Math.max(0, ...data.map((d) => d.count))
  let lastMonth = -1

  const cursor = new Date(start)
  while (cursor <= today) {
    const week: Week = { days: [] }
    for (let i = 0; i < 7 && cursor <= today; i++) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
        cursor.getDate(),
      ).padStart(2, '0')}`
      const count = byDate.get(iso) ?? 0
      week.days.push({ date: iso, count, level: levelOf(count, max) })
      cursor.setDate(cursor.getDate() + 1)
    }
    if (week.days.length > 0) {
      const month = new Date(week.days[0].date).getMonth()
      if (month !== lastMonth) {
        monthLabels.push({ index: weeks.length, label: `${month + 1}月` })
        lastMonth = month
      }
      weeks.push(week)
    }
  }
  return { weeks, monthLabels }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [heatData, setHeatData] = useState<HeatmapDay[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.statsOverview(), api.statsHeatmap(HEATMAP_DAYS)])
      .then(([s, h]) => {
        setStats(s)
        setHeatData(h)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const { weeks, monthLabels } = useMemo(() => buildWeeks(heatData), [heatData])

  if (error) return <div className="page"><p className="status-msg">{error}</p></div>
  if (!stats) return <div className="page"><p className="muted">載入中…</p></div>

  return (
    <div className="page page-mid">
      <h1>儀表板</h1>

      <div className="stat-grid">
        <Link to="/review" className="stat-tile stat-tile-link">
          <div className="stat-value">{stats.due_today}</div>
          <div className="stat-label">今日待複習</div>
          {stats.due_today > 0 && <div className="stat-cta">開始複習 →</div>}
        </Link>
        <div className="stat-tile">
          <div className="stat-value">{stats.streak}</div>
          <div className="stat-label">連續學習天數</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{stats.reviews_today}</div>
          <div className="stat-label">今日已複習</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">
            {stats.retention_30d != null ? `${Math.round(stats.retention_30d * 100)}%` : '—'}
          </div>
          <div className="stat-label">30 天保持率</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{stats.total_cards}</div>
          <div className="stat-label">卡片總數</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{stats.total_notes}</div>
          <div className="stat-label">筆記總數</div>
        </div>
      </div>

      <h2 className="heatmap-title">複習熱力圖（近半年）</h2>
      <div className="heatmap-scroll">
        <div className="heatmap-months">
          {monthLabels.map((m) => (
            <span key={m.index} style={{ gridColumnStart: m.index + 1 }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="heatmap-grid">
          {weeks.map((week, wi) => (
            <div key={wi} className="heatmap-week">
              {week.days.map((d) => (
                <div
                  key={d.date}
                  className={`heatmap-cell level-${d.level}`}
                  title={`${d.date}：${d.count} 次複習`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="heatmap-legend muted">
          少
          {Array.from({ length: LEVELS }, (_, i) => (
            <div key={i} className={`heatmap-cell level-${i}`} />
          ))}
          多
        </div>
      </div>
    </div>
  )
}
