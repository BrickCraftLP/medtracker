import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext.jsx'
import { NavDirectionContext } from '../context/navDirection.js'
import { useChangelog } from '../hooks/useChangelog.js'
import { refreshChangelog, fetchLanguageFile } from '../services/changelogService.js'
import { getLocale } from '../i18n/index.js'

const VISIBLE_COUNT = 5

const GLASS = {
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  borderRadius: 16,
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
  overflow: 'hidden',
}

const TYPE_STYLE = {
  new:      { bg: 'rgba(99,102,241,0.15)',  color: '#6366f1' },
  improved: { bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6' },
  fix:      { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e' },
}

function TypeTag({ type, label }) {
  const s = TYPE_STYLE[type] ?? TYPE_STYLE.improved
  return (
    <span style={{
      flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
      textTransform: 'uppercase', padding: '3px 7px', borderRadius: 6,
      background: s.bg, color: s.color, lineHeight: 1.2,
    }}>
      {label}
    </span>
  )
}

// ── Block renderers ────────────────────────────────────────────────────────────

function HeroBlock({ block, accent, gradient }) {
  return (
    <div style={{
      background: gradient ? `linear-gradient(${gradient})` : accent,
      padding: '28px 20px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: -0.5, lineHeight: 1.1 }}>
        {block.title}
      </div>
      {block.subtitle && (
        <div style={{ marginTop: 6, fontSize: 15, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
          {block.subtitle}
        </div>
      )}
    </div>
  )
}

function HeadingBlock({ block, accent }) {
  return (
    <div style={{ fontSize: 15, fontWeight: 700, color: accent, padding: '18px 20px 4px', letterSpacing: -0.2 }}>
      {block.text}
    </div>
  )
}

function ParagraphBlock({ block }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', padding: '6px 20px 10px' }}>
      {block.text.split('\n').map((line, i, arr) => (
        <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
      ))}
    </div>
  )
}

function CalloutBlock({ block, accent }) {
  return (
    <div style={{
      margin: '6px 20px 10px', padding: '12px 14px', borderRadius: 10,
      borderLeft: `3px solid ${accent}`, background: `${accent}18`,
      fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 500,
    }}>
      {block.text}
    </div>
  )
}

function TableBlock({ block, accent }) {
  const { headers, rows } = block
  return (
    <div style={{ overflowX: 'auto', padding: '6px 20px 14px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                textAlign: i === 0 ? 'left' : 'center', padding: '6px 8px',
                color: accent, fontWeight: 700,
                borderBottom: `1px solid ${accent}33`, whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '0.5px solid var(--border)' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '7px 8px', textAlign: ci === 0 ? 'left' : 'center',
                  color: ci === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: ci === 0 ? 600 : 400, lineHeight: 1.4,
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StoryBlocks({ blocks, accent, gradient }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'hero':      return <HeroBlock      key={i} block={block} accent={accent} gradient={gradient} />
          case 'heading':   return <HeadingBlock   key={i} block={block} accent={accent} />
          case 'paragraph': return <ParagraphBlock key={i} block={block} />
          case 'callout':   return <CalloutBlock   key={i} block={block} accent={accent} />
          case 'table':     return <TableBlock     key={i} block={block} accent={accent} />
          default:          return null
        }
      })}
    </>
  )
}

// ── Release card ───────────────────────────────────────────────────────────────

function ReleaseCard({ entry, isLatest, language, t, formatDate }) {
  const accent   = entry.style?.accent   ?? 'var(--accent)'
  const gradient = entry.style?.gradient ?? null
  const tag      = entry.style?.tag      ?? ''

  const [langFile, setLangFile] = useState(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [open, setOpen] = useState(isLatest)

  // Always fetch the language file fresh when the card mounts or language changes
  useEffect(() => {
    let cancelled = false
    setLoadingFile(true)
    setLangFile(null)
    fetchLanguageFile(entry, language).then(result => {
      if (cancelled) return
      if (result) setLangFile(result)
      setLoadingFile(false)
    })
    return () => { cancelled = true }
  }, [entry, language])

  const changes = langFile?.changes ?? []
  const blocks  = langFile?.blocks  ?? []

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Version row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 4px 8px' }}>
        {tag ? <span style={{ fontSize: 13 }}>{tag}</span> : null}
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('settings.changelogVersion', { v: entry.version })}
        </span>
        {isLatest && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
            padding: '2px 7px', borderRadius: 6, background: accent, color: 'white',
          }}>
            {t('settings.changelogLatest')}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {formatDate(entry.date)}
        </span>
      </div>

      <div style={GLASS}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setOpen(o => !o)}
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {/* Bullet list — loaded from language file */}
          <div style={{ padding: '4px 0' }}>
            {loadingFile && changes.length === 0 ? (
              // Skeleton while loading
              [1, 2].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px' }}>
                  <div style={{ width: 52, height: 18, borderRadius: 6, background: 'var(--border)', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 14, borderRadius: 6, background: 'var(--border)' }} />
                </div>
              ))
            ) : changes.map((c, j) => (
              <div key={j}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 16px' }}>
                  <TypeTag type={c.type} label={t(`settings.changelogType.${c.type}`)} />
                  <span style={{ flex: 1, fontSize: 14, lineHeight: 1.45, color: 'var(--text-primary)' }}>
                    {c.text}
                  </span>
                </div>
                {j < changes.length - 1 && (
                  <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />
                )}
              </div>
            ))}
          </div>

          {/* Expand / collapse toggle */}
          {blocks.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 16px', borderTop: '0.5px solid var(--border)',
              color: accent, fontSize: 12, fontWeight: 600,
            }}>
              <span>{open ? t('settings.changelogCollapse') : t('settings.changelogExpand')}</span>
              <motion.svg
                width="14" height="14" viewBox="0 0 24 24" fill={accent}
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
              >
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
              </motion.svg>
            </div>
          )}
        </motion.button>

        {/* Story expansion */}
        <AnimatePresence initial={false}>
          {open && blocks.length > 0 && (
            <motion.div
              key="story"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ borderTop: '0.5px solid var(--border)' }}>
                <StoryBlocks blocks={blocks} accent={accent} gradient={gradient} />
                <div style={{ height: 12 }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ChangelogScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t, language } = useLanguage()
  const { entries, latestVersion, markSeen } = useChangelog()

  const [showAll, setShowAll] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetched, setFetched] = useState(false)

  useEffect(() => { markSeen() }, [markSeen, latestVersion])

  // Mark fetch complete so we know when to show the empty state
  useEffect(() => {
    refreshChangelog().then(() => setFetched(true))
  }, [])

  const visibleEntries = showAll ? entries : entries.slice(0, VISIBLE_COUNT)
  const hasMore = entries.length > VISIBLE_COUNT && !showAll

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(getLocale(language), {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    } catch { return iso }
  }

  async function handleFetchMore() {
    setLoadingMore(true)
    // Small delay so the spinner is visible; actual fetches happen inside each card
    await new Promise(r => setTimeout(r, 120))
    setShowAll(true)
    setLoadingMore(false)
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{
            background: 'rgba(0,0,0,0.18)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '0.5px solid rgba(255,255,255,0.22)',
            borderRadius: 10, padding: '7px 12px', color: 'white',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 4px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('settings.changelog')}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 14, color: 'var(--text-secondary)' }}>
          {t('settings.changelogSubtitle')}
        </p>

        {entries.length === 0 ? (
          fetched ? (
            // Fetch completed but nothing came back
            <div style={{
              textAlign: 'center', padding: '60px 24px 40px',
              color: 'var(--text-tertiary)',
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Silent. Too silent.
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                Where is the maintenance guy again?
              </div>
            </div>
          ) : (
            // Still fetching
            <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-tertiary)', fontSize: 14 }}>
              …
            </div>
          )
        ) : visibleEntries.map((entry, i) => (
          <ReleaseCard
            key={entry.version}
            entry={entry}
            isLatest={i === 0}
            language={language}
            t={t}
            formatDate={formatDate}
          />
        ))}

        {hasMore && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleFetchMore}
            disabled={loadingMore}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, cursor: 'pointer',
              background: 'var(--glass-card-bg)',
              backdropFilter: 'blur(60px)', WebkitBackdropFilter: 'blur(60px)',
              border: '0.5px solid var(--glass-card-stroke)',
              color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loadingMore ? (
              <span style={{ opacity: 0.5 }}>{t('settings.changelogLoadingMore')}</span>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                  <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                {t('settings.changelogFetchMore', { n: entries.length - VISIBLE_COUNT })}
              </>
            )}
          </motion.button>
        )}

      </div>
    </div>
  )
}
