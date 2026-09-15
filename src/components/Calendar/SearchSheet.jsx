// Search over everything the local index holds — events, tasks, exams,
// topics, semesters. Entirely offline: the same searchLocal() a local model
// would call is what backs this sheet, which is also what keeps the index
// honest. An index nothing reads is an index that silently rots.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useData } from '../../context/DataContext.jsx'
import { useWorkspace } from '../../context/WorkspaceContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { searchLocal } from '../../services/localIndex.js'
import LiquidSheet from '../Glass/LiquidSheet.jsx'
import GlassButton from '../Glass/GlassButton.jsx'
import { Pill } from '../Modals/WidgetConfig/controls.jsx'

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
    <LiquidSheet onClose={onClose}>
      <header className="sheet-header">
        <div className="sheet-header__row">
          <div className="sheet-header__titles">
            <h2 className="sheet-header__title">{t('calendar.search')}</h2>
          </div>
          <GlassButton size={34} onClick={onClose} ariaLabel={t('widget.close')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </GlassButton>
        </div>
      </header>

      <input
        className="input"
        autoFocus
        value={query}
        placeholder={t('calendar.searchPlaceholder')}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        style={{ marginBottom: 12, fontSize: 16 }}
      />

      <div className="wc-pills" style={{ marginBottom: 16 }}>
        {FILTERS.map(f => (
          <Pill key={f ?? 'all'} active={type === f} onClick={() => setType(f)}>
            {f ? t(`calendar.searchType.${f}`) : t('calendar.searchType.all')}
          </Pill>
        ))}
      </div>

      {query.trim() && !results.length && (
        <div className="wc-empty">{t('calendar.searchEmpty')}</div>
      )}

      <div className="wc-options">
        {results.map(hit => (
          <button
            key={hit.id}
            type="button"
            className="wc-option"
            onClick={() => onPick?.({ type: hit.type, id: hit.ref_id, date: hit.date })}
            style={{ alignItems: 'flex-start' }}
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
      </div>
    </LiquidSheet>
  )
}
