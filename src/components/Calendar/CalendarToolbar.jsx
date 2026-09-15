// Calendar header: period title, paging arrows, Today, the view switcher, and
// the entry points to the calendar filter, search and the exams page.
//
// Horizontal swipes here still switch app tabs (the grid below claims them for
// paging instead) — that is the escape hatch, so keep this strip drag-free.

import GlassButton from '../Glass/GlassButton.jsx'
import ViewSwitcher from './ViewSwitcher.jsx'

export default function CalendarToolbar({
  title, view, onView, onPrev, onNext, onToday,
  onFilter, onSearch, onExams, hiddenCount, t,
}) {
  return (
    <div style={{ padding: '18px 16px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{
          margin: 0, flex: 1, minWidth: 0, fontSize: 26, fontWeight: 800,
          color: 'var(--text-primary)', letterSpacing: -0.5,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {title}
        </h1>

        <IconButton label={t('calendar.search')} onClick={onSearch}>
          <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
        </IconButton>

        <IconButton label={t('exams.title')} onClick={onExams}>
          <path d="M4 7l8-3 8 3-8 3-8-3z" /><path d="M7 10.5V15c0 1.5 2.2 2.8 5 2.8s5-1.3 5-2.8v-4.5" />
        </IconButton>

        <IconButton label={t('calendar.calendars')} onClick={onFilter} badge={hiddenCount}>
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </IconButton>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <ArrowButton onClick={onPrev} dir="left" />
        <GlassButton height={32} fontSize={12.5} tint="var(--glass-card-bg)" onClick={onToday}>
          {t('calendar.today')}
        </GlassButton>
        <ArrowButton onClick={onNext} dir="right" />
      </div>

      <ViewSwitcher value={view} onChange={onView} t={t} />
    </div>
  )
}

// The badge sits outside the glass: the glass frame clips its own content.
function IconButton({ children, onClick, label, badge }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <GlassButton size={36} tint="var(--glass-card-bg)" onClick={onClick} ariaLabel={label}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
             stroke="var(--text-secondary)" strokeWidth="1.8" strokeLinecap="round">
          {children}
        </svg>
      </GlassButton>
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: -3, right: -3, zIndex: 2, minWidth: 16, height: 16, padding: '0 4px',
          borderRadius: 9999, background: 'var(--accent)', color: '#fff', pointerEvents: 'none',
          fontSize: 9.5, fontWeight: 700, display: 'grid', placeItems: 'center',
        }}>{badge}</span>
      )}
    </span>
  )
}

function ArrowButton({ onClick, dir }) {
  return (
    <GlassButton size={32} tint="var(--glass-card-bg)" onClick={onClick} ariaLabel={dir}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
           stroke="var(--text-secondary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </GlassButton>
  )
}
