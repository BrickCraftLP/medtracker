// Links attached to an event — a Drive folder, the lecture recording, the
// Moodle page. Stored as jsonb on the row: they are always fetched with the
// event and never queried on their own, so a table would buy nothing.

import { useState } from 'react'

// Provider is inferred from the hostname purely for the icon; an unknown host
// is a perfectly good link and just gets the generic one.
const PROVIDERS = [
  [/(drive|docs|sheets|slides)\.google\./i, '📄', 'drive'],
  [/notion\./i, '📓', 'notion'],
  [/moodle|ilias|canvas|blackboard/i, '🎒', 'moodle'],
  [/(zoom\.us|teams\.microsoft|meet\.google)/i, '🎥', 'meeting'],
  [/(youtube\.com|youtu\.be|vimeo)/i, '▶️', 'video'],
  [/github\./i, '💻', 'code'],
]

export function providerOf(url) {
  for (const [re, icon, kind] of PROVIDERS) if (re.test(url)) return { icon, kind }
  return { icon: '🔗', kind: 'link' }
}

function normalise(raw) {
  const value = raw.trim()
  if (!value) return null
  // A pasted "drive.google.com/…" is a URL the user means as one; give it a
  // scheme so the anchor actually navigates.
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function labelFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export default function LinkChips({ links = [], onChange, t }) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')

  function add() {
    const url = normalise(value)
    if (!url) { setAdding(false); setValue(''); return }
    onChange([...links, { id: crypto.randomUUID(), url, label: labelFrom(url), kind: providerOf(url).kind }])
    setValue('')
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {links.map(link => (
        <span
          key={link.id ?? link.url}
          className="pill"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
            padding: '5px 8px 5px 10px', fontSize: 12, fontWeight: 600,
            background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)',
            backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          }}
        >
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              color: 'var(--text-primary)', textDecoration: 'none', maxWidth: 180,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {providerOf(link.url).icon} {link.label ?? labelFrom(link.url)}
          </a>
          <button
            onClick={() => onChange(links.filter(l => (l.id ?? l.url) !== (link.id ?? link.url)))}
            aria-label={t('calendar.delete')}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-tertiary)', fontSize: 14, lineHeight: 1, padding: 0,
            }}
          >×</button>
        </span>
      ))}

      {adding ? (
        <input
          className="te-input"
          autoFocus
          value={value}
          placeholder={t('calendar.linkPlaceholder')}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); add() }
            if (e.key === 'Escape') { setValue(''); setAdding(false) }
          }}
          onBlur={add}
          style={{ flex: '1 1 160px', width: 'auto', height: 36, padding: '0 10px', fontSize: 13.5 }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', padding: '4px 2px',
          }}
        >
          + {t('calendar.addLink')}
        </button>
      )}
    </div>
  )
}
