// Search over everything the local index holds — events, tasks, exams,
// topics, semesters. Entirely offline: the same searchLocal() a local model
// would call is what backs this sheet, which is also what keeps the index
// honest. An index nothing reads is an index that silently rots.

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext.jsx'
import { useData } from '../../context/DataContext.jsx'
import { useWorkspace } from '../../context/WorkspaceContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { searchLocal } from '../../services/localIndex.js'

const TYPE_ICON = { event: '📅', todo: '✅', exam: '🎓', topic: '📚', semester: '🗓️', calendar: '🎒' }
const FILTERS = [null, 'event', 'todo', 'exam']

export default function SearchSheet({ onClose, onPick }) {
  const { user } = useAuth()
  const { activeWorkspaceId } = useWorkspace()
  const { calendars } = useData()
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [type, setType] = useState(null)
  const [results, setResults] = useState([])
  const seq = useRef(0)

  useEffect(() => {
    const run = async () => {
      const mine = ++seq.current
      if (!query.trim()) { setResults([]); return }
      const found = await searchLocal(query, {
        userId: user?.id,
        workspaceId: activeWorkspaceId,
        // Calendar rows follow their calendar, not the workspace — pass the
        // ones actually visible here so a shared calendar is searchable and a
        // foreign one is not.
        calendarIds: new Set(calendars.map(c => c.id)),
        types: type ? [type] : null,
        limit: 30,
      })
      // A slow query must not overwrite a newer one's results.
      if (mine === seq.current) setResults(found)
    }
    const id = setTimeout(run, 120)
    return () => clearTimeout(id)
  }, [query, type, user?.id, activeWorkspaceId, calendars])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 32 }}
      >
        <input
          className="input"
          autoFocus
          value={query}
          placeholder={t('calendar.searchPlaceholder')}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          style={{ marginBottom: 10, fontSize: 16 }}
        />

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {FILTERS.map(f => (
            <button
              key={f ?? 'all'}
              onClick={() => setType(f)}
              className="pill"
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${type === f ? 'var(--accent)' : 'var(--border)'}`,
                background: type === f ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: type === f ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {f ? t(`calendar.searchType.${f}`) : t('calendar.searchType.all')}
            </button>
          ))}
        </div>

        {query.trim() && !results.length && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13.5 }}>
            {t('calendar.searchEmpty')}
          </div>
        )}

        {results.map(hit => (
          <button
            key={hit.id}
            onClick={() => onPick?.({ type: hit.type, id: hit.ref_id, date: hit.date })}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
              textAlign: 'left', cursor: 'pointer', marginBottom: 6, padding: '9px 11px',
              borderRadius: 11, border: '0.5px solid var(--border)', background: 'var(--bg-tertiary)',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1.3 }}>{TYPE_ICON[hit.type] ?? '•'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 14, fontWeight: 650, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {hit.title || '—'}
              </span>
              <span style={{
                display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {[hit.date, hit.snippet].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        ))}
      </motion.div>
    </div>
  )
}
