// Calendar header: period title, paging arrows, Today, the view switcher, and
// the entry points to the calendar filter, search and the exams page.
//
// Horizontal swipes here still switch app tabs (the grid below claims them for
// paging instead) — that is the escape hatch, so keep this strip drag-free.

import { motion } from 'framer-motion'
import ViewSwitcher from './ViewSwitcher.jsx'

export default function CalendarToolbar({
  title, view, onView, onPrev, onNext, onToday,
  onFilter, onSearch, onExams, hiddenCount, t,
}) {
  return (
    <div style={{ padding: '18px 16px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{
          margin: 0, flex: 1, fontSize: 26, fontWeight: 800,
          color: 'var(--text-primary)', letterSpacing: -0.5,
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
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onToday}
          className="pill tap-highlight"
          style={{
            border: '1px solid var(--border-strong)', background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 650,
            padding: '5px 14px', cursor: 'pointer',
          }}
        >
          {t('calendar.today')}
        </motion.button>
        <ArrowButton onClick={onNext} dir="right" />
        <div style={{ flex: 1 }} />
      </div>

      <ViewSwitcher value={view} onChange={onView} t={t} />
    </div>
  )
}

function IconButton({ children, onClick, label, badge }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label={label}
      style={{
        position: 'relative', width: 34, height: 34, borderRadius: '50%',
        display: 'grid', placeItems: 'center', cursor: 'pointer',
        border: '0.5px solid var(--glass-card-stroke)', background: 'var(--glass-card-bg)',
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
           stroke="var(--text-secondary)" strokeWidth="1.8" strokeLinecap="round">
        {children}
      </svg>
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 3px',
          borderRadius: 9999, background: 'var(--accent)', color: '#fff',
          fontSize: 9.5, fontWeight: 700, display: 'grid', placeItems: 'center',
        }}>{badge}</span>
      )}
    </motion.button>
  )
}

function ArrowButton({ onClick, dir }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label={dir}
      style={{
        width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
        cursor: 'pointer', border: '0.5px solid var(--glass-card-stroke)',
        background: 'var(--glass-card-bg)',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
           stroke="var(--text-secondary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </motion.button>
  )
}
