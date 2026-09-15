import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTopics } from '../../hooks/useTopics.js'
import { useLanguage } from '../../context/LanguageContext.jsx'

const EMOJI_CATEGORIES = {
  'Medizin': ['🏥','💊','🫀','🧠','🦷','👁️','💉','🩺','🩻','🩹','🩸','🧫','🫁','🦴','🦿','🦾','🧬','⚗️','🔬','🩼'],
  'Wissenschaft': ['🧪','🧮','🔭','🔬','📡','⚛️','🧲','🔋','💻','🖥️','📱','🤖','⚡','🛸','💡','🔌','🖱️','⌨️','🔩','🧰'],
  'Studium': ['📚','📖','📐','📏','✏️','🖊️','📝','📋','📊','📈','📉','🗂️','📁','📌','📍','🗓️','📅','🔢','🏫','🎓'],
  'Natur': ['🌱','🌿','🍃','🌸','🌺','💐','🌙','⭐','🌊','🔥','💧','🌈','🍎','🥦','🌞','❄️','🌪️','🦋','🌻','🐾'],
  'Symbole': ['🎯','💫','✨','🌟','💥','🏆','🥇','🎖️','🎨','🎭','🎬','🎮','🎵','🔷','💎','🔑','⚡','🔮','🪄','🌐'],
}

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

const CATEGORY_ICONS = {
  'Medizin': '🏥',
  'Wissenschaft': '🔬',
  'Studium': '📚',
  'Natur': '🌿',
  'Symbole': '🌟',
}

const PALETTE_PREVIEWS = {
  'Klassisch': ['#6366f1','#ec4899','#22c55e','#f97316'],
  'Pastell': ['#a5b4fc','#f9a8d4','#86efac','#fdba74'],
  'Satt': ['#4f46e5','#db2777','#16a34a','#ea580c'],
  'Dunkel': ['#312e81','#831843','#14532d','#0c4a6e'],
}

const CAT_KEY = {
  'Medizin':      'topicEdit.cat.medicine',
  'Wissenschaft': 'topicEdit.cat.science',
  'Studium':      'topicEdit.cat.study',
  'Natur':        'topicEdit.cat.nature',
  'Symbole':      'topicEdit.cat.symbols',
}

const PAL_KEY = {
  'Klassisch': 'topicEdit.pal.classic',
  'Pastell':   'topicEdit.pal.pastel',
  'Satt':      'topicEdit.pal.vivid',
  'Dunkel':    'topicEdit.pal.dark',
}

export default function TopicEditModal({ topic, onClose }) {
  const { createTopic, updateTopic, deleteTopic } = useTopics()
  const { t } = useLanguage()
  const isNew = !topic?.id

  const [name, setName] = useState(topic?.name ?? '')
  const [emoji, setEmoji] = useState(topic?.emoji ?? '📚')
  const [colorFrom, setColorFrom] = useState(topic?.color_from ?? '#6366f1')
  const [colorTo, setColorTo] = useState(topic?.color_to ?? '#8b5cf6')
  const [description, setDescription] = useState(topic?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState('Medizin')
  const [colorPalette, setColorPalette] = useState('Klassisch')
  const [activeStop, setActiveStop] = useState('from') // 'from' | 'to'

  const activeColor = activeStop === 'from' ? colorFrom : colorTo
  const setActiveColor = activeStop === 'from' ? setColorFrom : setColorTo

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const data = { name: name.trim(), emoji, color_from: colorFrom, color_to: colorTo, description }
      if (isNew) await createTopic(data)
      else await updateTopic(topic.id, data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
      onClose()
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteTopic(topic.id)
      onClose()
    } catch (e) {
      console.error(e)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 40 }}
      >
        <div className="modal-handle" />

        {/* Preview card */}
        <div style={{
          height: 80,
          borderRadius: 16,
          background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 20,
          transition: 'background 0.2s',
        }}>
          <span style={{ fontSize: 32 }}>{emoji}</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>{name || t('topicEdit.preview')}</span>
        </div>

        {/* Emoji picker */}
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'block' }}>{t('topicEdit.emoji')}</label>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {Object.keys(EMOJI_CATEGORIES).map(cat => (
            <motion.button
              key={cat}
              whileTap={{ scale: 0.92 }}
              onClick={() => setEmojiCategory(cat)}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 20,
                border: `1.5px solid ${emojiCategory === cat ? colorFrom : 'var(--border)'}`,
                background: emojiCategory === cat ? colorFrom + '22' : 'var(--bg-tertiary)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: emojiCategory === cat ? 700 : 500,
                color: emojiCategory === cat ? colorFrom : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 15 }}>{CATEGORY_ICONS[cat]}</span>
              {t(CAT_KEY[cat])}
            </motion.button>
          ))}
        </div>

        {/* Emoji grid */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18, minHeight: 88 }}>
          {EMOJI_CATEGORIES[emojiCategory].map(e => (
            <motion.button
              key={e}
              whileTap={{ scale: 0.8 }}
              onClick={() => setEmoji(e)}
              style={{
                width: 38, height: 38, borderRadius: 10,
                border: `2px solid ${emoji === e ? colorFrom : 'var(--border)'}`,
                background: emoji === e ? colorFrom + '22' : 'var(--bg-tertiary)',
                cursor: 'pointer', fontSize: 19,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {e}
            </motion.button>
          ))}
        </div>

        {/* Name */}
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'block' }}>{t('topicEdit.name')}</label>
        <input className="input" style={{ marginBottom: 16 }} placeholder={t('topicEdit.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} />

        {/* Description */}
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'block' }}>{t('topicEdit.description')}</label>
        <input className="input" style={{ marginBottom: 18 }} placeholder={t('topicEdit.descPlaceholder')} value={description} onChange={e => setDescription(e.target.value)} />

        {/* Color section */}
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 10, display: 'block' }}>{t('topicEdit.gradient')}</label>

        {/* Gradient stop selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          {/* Von stop */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => setActiveStop('from')}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 12,
              border: `2px solid ${activeStop === 'from' ? colorFrom : 'var(--border)'}`,
              background: activeStop === 'from' ? colorFrom + '18' : 'var(--bg-tertiary)',
              cursor: 'pointer',
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 6, background: colorFrom, flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.3)' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>{t('topicEdit.from')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{colorFrom}</div>
            </div>
          </motion.button>

          {/* Gradient preview strip */}
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})`,
            border: '1.5px solid var(--border)',
            transition: 'background 0.2s',
          }} />

          {/* Bis stop */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => setActiveStop('to')}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 12,
              border: `2px solid ${activeStop === 'to' ? colorTo : 'var(--border)'}`,
              background: activeStop === 'to' ? colorTo + '18' : 'var(--bg-tertiary)',
              cursor: 'pointer',
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 6, background: colorTo, flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.3)' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>{t('topicEdit.to')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{colorTo}</div>
            </div>
          </motion.button>
        </div>

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
                border: `1.5px solid ${colorPalette === pal ? activeColor : 'var(--border)'}`,
                background: colorPalette === pal ? activeColor + '18' : 'var(--bg-tertiary)',
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
                color: colorPalette === pal ? activeColor : 'var(--text-secondary)',
              }}>
                {t(PAL_KEY[pal])}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Color swatches */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {COLOR_PALETTES[colorPalette].map(c => (
            <motion.button
              key={c}
              whileTap={{ scale: 0.85 }}
              onClick={() => setActiveColor(c)}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: c,
                cursor: 'pointer',
                border: activeColor === c ? '3px solid white' : '2px solid transparent',
                boxShadow: activeColor === c ? `0 0 0 2px ${c}` : '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'transform 0.1s',
                flexShrink: 0,
              }}
            />
          ))}
        </div>

        <motion.button whileTap={{ scale: 0.97 }} className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={handleSave} disabled={saving}>
          {saving ? t('state.saving') : isNew ? t('topicEdit.create') : t('btn.save')}
        </motion.button>

        {!isNew && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="btn btn-danger"
            style={{ width: '100%' }}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? t('state.deleting') : confirmDelete ? t('topicEdit.deleteConfirm') : t('topicEdit.delete')}
          </motion.button>
        )}
      </motion.div>
    </div>
  )
}
