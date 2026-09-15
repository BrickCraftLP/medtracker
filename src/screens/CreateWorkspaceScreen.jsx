import { useContext, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { NavDirectionContext } from '../context/navDirection.js'
import { useWorkspace } from '../context/WorkspaceContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

// Same palette set as TopicEditModal's gradient picker, for a consistent feel.
const COLOR_PALETTES = {
  'Klassisch': [
    '#6366f1','#8b5cf6','#a855f7','#ec4899','#ef4444',
    '#f97316','#eab308','#84cc16','#22c55e','#14b8a6',
    '#0ea5e9','#3b82f6','#64748b','#78716c','#f43f5e',
  ],
  'Pastell': [
    '#a5b4fc','#c4b5fd','#d8b4fe','#f9a8d4','#fca5a5',
    '#fdba74','#fde68a','#bef264','#86efac','#5eead4',
    '#7dd3fc','#93c5fd','#cbd5e1','#d6d3d1','#fda4af',
  ],
  'Satt': [
    '#4f46e5','#7c3aed','#9333ea','#db2777','#dc2626',
    '#ea580c','#ca8a04','#65a30d','#16a34a','#0d9488',
    '#0284c7','#2563eb','#475569','#57534e','#e11d48',
  ],
  'Dunkel': [
    '#312e81','#4c1d95','#581c87','#831843','#7f1d1d',
    '#7c2d12','#713f12','#3f6212','#14532d','#134e4a',
    '#0c4a6e','#1e3a5f','#1e293b','#292524','#881337',
  ],
}

const PALETTE_PREVIEWS = {
  'Klassisch': ['#6366f1','#ec4899','#22c55e','#f97316'],
  'Pastell': ['#a5b4fc','#f9a8d4','#86efac','#fdba74'],
  'Satt': ['#4f46e5','#db2777','#16a34a','#ea580c'],
  'Dunkel': ['#312e81','#831843','#14532d','#0c4a6e'],
}

const PAL_KEY = {
  'Klassisch': 'topicEdit.pal.classic',
  'Pastell':   'topicEdit.pal.pastel',
  'Satt':      'topicEdit.pal.vivid',
  'Dunkel':    'topicEdit.pal.dark',
}

const GLASS = {
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  borderRadius: 16,
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
  overflow: 'hidden',
}

const SWATCH_COLORS = [
  '#007AFF', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#6366f1', '#f97316', '#14b8a6',
]

// Must stay in sync with the icons WorkspaceSwitcher's ItemIcon can render.
const ICONS = ['grid', 'layers', 'blocks', 'box', 'spark', 'chart', 'heart', 'star', 'flag', 'home', 'folder', 'target',
  'bell', 'bookmark', 'calendar', 'clock', 'sun', 'moon', 'cloud', 'shield', 'zap', 'gift']

function IconGlyph({ icon, size = 16 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (icon) {
    case 'grid':   return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    case 'layers': return <svg {...common}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>
    case 'blocks': return <svg {...common}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="8" y="13" width="8" height="8" rx="1.5" /></svg>
    case 'box':    return <svg {...common}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
    case 'spark':  return <svg {...common}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" /></svg>
    case 'chart':  return <svg {...common}><path d="M4 19V10" /><path d="M12 19V5" /><path d="M20 19v-7" /></svg>
    case 'heart':  return <svg {...common}><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" /></svg>
    case 'star':   return <svg {...common}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
    case 'flag':   return <svg {...common}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22V3" /></svg>
    case 'home':   return <svg {...common}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
    case 'folder': return <svg {...common}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
    case 'target': return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
    case 'bell':     return <svg {...common}><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 003.4 0" /></svg>
    case 'bookmark': return <svg {...common}><path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" /></svg>
    case 'calendar': return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
    case 'clock':    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
    case 'sun':      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    case 'moon':     return <svg {...common}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
    case 'cloud':    return <svg {...common}><path d="M17.5 19a4.5 4.5 0 000-9 6 6 0 00-11.4 2A4 4 0 007 19h10.5z" /></svg>
    case 'shield':   return <svg {...common}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /></svg>
    case 'zap':      return <svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
    case 'gift':     return <svg {...common}><rect x="3" y="8" width="18" height="4" /><rect x="4" y="12" width="16" height="9" /><path d="M12 8v13" /><path d="M12 8c-1.5-4-6-4-6-1.5S9 8 12 8z" /><path d="M12 8c1.5-4 6-4 6-1.5S15 8 12 8z" /></svg>
    default: return null
  }
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
        {title}
      </p>
      <div style={{ ...GLASS, padding: 16 }}>{children}</div>
    </div>
  )
}

// Serves both /workspaces/new and /workspaces/:id/edit — same shape as
// TopicEditModal's `isNew` split.
export default function CreateWorkspaceScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const { workspaces, createWorkspace, updateWorkspace, removeWorkspace } = useWorkspace()

  const existing = id ? workspaces.find(w => w.id === id) : null
  const isNew = !existing

  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? SWATCH_COLORS[0])
  const [icon, setIcon] = useState(existing?.icon ?? ICONS[0])
  const [colorPalette, setColorPalette] = useState('Klassisch')
  const [busy, setBusy] = useState(false)

  const canDelete = !isNew && workspaces.length > 1

  function handleBack() {
    setDirection(-1)
    navigate(-1)
  }

  async function handleSubmit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      if (isNew) await createWorkspace({ name, color, icon })
      else await updateWorkspace(existing.id, { name: name.trim(), color, icon })
      setDirection(-1)
      navigate('/home')
    } catch (e) {
      console.error('workspace save failed:', e)
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!canDelete || busy) return
    if (!window.confirm(t('workspace.deleteConfirm', { name: existing.name }))) return
    setBusy(true)
    try {
      await removeWorkspace(existing.id)
      setDirection(-1)
      navigate('/home')
    } catch (e) {
      console.error('workspace delete failed:', e)
      setBusy(false)
    }
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={handleBack}
          style={{
            background: 'rgba(0,0,0,0.18)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '0.5px solid rgba(255,255,255,0.22)',
            borderRadius: 10,
            padding: '7px 12px',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Back
        </motion.button>

        <h1 style={{ margin: '0 0 30px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {isNew ? t('workspace.new') : t('workspace.edit')}
        </h1>

        <Section title={t('workspace.name')}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('workspace.namePlaceholder')}
            autoComplete="off"
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              fontSize: 15, fontWeight: 500, color: 'var(--text-primary)',
            }}
          />
        </Section>

        <Section title={t('workspace.color')}>
          {/* Palette tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {Object.keys(COLOR_PALETTES).map(pal => (
              <motion.button
                key={pal}
                whileTap={{ scale: 0.92 }}
                onClick={() => setColorPalette(pal)}
                style={{
                  flex: 1,
                  padding: '7px 4px',
                  borderRadius: 12,
                  border: `1.5px solid ${colorPalette === pal ? color : 'var(--border)'}`,
                  background: colorPalette === pal ? color + '18' : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <div style={{ display: 'flex', gap: 2 }}>
                  {PALETTE_PREVIEWS[pal].map(c => (
                    <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                  ))}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: colorPalette === pal ? 700 : 500,
                  color: colorPalette === pal ? color : 'var(--text-secondary)',
                }}>
                  {t(PAL_KEY[pal])}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Color swatches */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {COLOR_PALETTES[colorPalette].map(c => (
              <motion.button
                key={c}
                whileTap={{ scale: 0.85 }}
                onClick={() => setColor(c)}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: c,
                  cursor: 'pointer',
                  border: color === c ? '3px solid white' : '2px solid transparent',
                  boxShadow: color === c ? `0 0 0 2px ${c}` : '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'transform 0.1s',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>

          <HexColorPicker
            color={color}
            onChange={setColor}
            style={{ width: '100%', height: 180 }}
          />
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: color,
              border: '0.5px solid var(--border-strong)',
            }} />
            <div style={{
              flex: 1, height: 40, borderRadius: 10,
              background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)',
              display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 2,
            }}>
              <span style={{ fontSize: 15, fontFamily: 'monospace', color: 'var(--text-tertiary)', userSelect: 'none' }}>#</span>
              <HexColorInput
                color={color}
                onChange={setColor}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 15, fontFamily: 'monospace', color: 'var(--text-primary)',
                  width: '100%', letterSpacing: 1,
                }}
              />
            </div>
          </div>
        </Section>

        <Section title={t('workspace.icon')}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ICONS.map(ic => (
              <motion.button
                key={ic}
                whileTap={{ scale: 0.85 }}
                onClick={() => setIcon(ic)}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: icon === ic ? `${color}26` : 'var(--bg-tertiary)',
                  color: icon === ic ? color : 'var(--text-tertiary)',
                  border: icon === ic ? `1.5px solid ${color}` : '1.5px solid transparent',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <IconGlyph icon={ic} />
              </motion.button>
            ))}
          </div>
        </Section>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={!name.trim() || busy}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: 16,
            border: 'none',
            background: name.trim() && !busy ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: name.trim() && !busy ? 'white' : 'var(--text-tertiary)',
            fontSize: 16,
            fontWeight: 700,
            cursor: name.trim() && !busy ? 'pointer' : 'default',
          }}
        >
          {isNew ? t('workspace.create') : t('btn.save')}
        </motion.button>

        {!isNew && (
          <>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleDelete}
              disabled={!canDelete || busy}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '15px',
                borderRadius: 16,
                border: 'none',
                background: 'transparent',
                color: canDelete && !busy ? '#ef4444' : 'var(--text-tertiary)',
                fontSize: 16,
                fontWeight: 600,
                cursor: canDelete && !busy ? 'pointer' : 'default',
              }}
            >
              {t('workspace.delete')}
            </motion.button>
            {!canDelete && (
              <p style={{ margin: '2px 16px 0', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                {t('workspace.deleteLast')}
              </p>
            )}
          </>
        )}

      </div>
    </div>
  )
}
