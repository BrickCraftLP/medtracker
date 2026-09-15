import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTopics } from '../../hooks/useTopics.js'
import { useLanguage } from '../../context/LanguageContext.jsx'
import LiquidSheet from '../Glass/LiquidSheet.jsx'
import GlassButton from '../Glass/GlassButton.jsx'
import SheetHeader from './WidgetConfig/SheetHeader.jsx'
import { Field, Pill } from './WidgetConfig/controls.jsx'

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

function GradientStop({ label, color, active, onClick }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.95 }}
      className={`wc-chip te-stop${active ? ' is-active' : ''}`}
      style={{ '--pill-accent': color }}
      onClick={onClick}>
      <span className="te-stop__dot" style={{ background: color }} />
      <span>
        <div className="wc-chip__hint" style={{ margin: 0, fontWeight: 600 }}>{label}</div>
        <div className="te-stop__hex">{color}</div>
      </span>
    </motion.button>
  )
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
    <LiquidSheet onClose={onClose}>
      <div style={{ '--pill-accent': colorFrom, '--accent': colorFrom }}>
        <SheetHeader title={isNew ? t('topics.addNew') : topic.name} onClose={onClose} />

        {/* Preview card */}
        <div className="te-preview" style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}>
          <span>{emoji}</span>
          <span>{name || t('topicEdit.preview')}</span>
        </div>

        <Field label={t('topicEdit.emoji')}>
          <div className="wc-pills te-tabs">
            {Object.keys(EMOJI_CATEGORIES).map(cat => (
              <Pill key={cat} color={colorFrom} active={emojiCategory === cat} onClick={() => setEmojiCategory(cat)}>
                <span className="wc-pill__emoji" style={{ fontSize: 15 }}>{CATEGORY_ICONS[cat]}</span>
                {t(CAT_KEY[cat])}
              </Pill>
            ))}
          </div>
          <div className="te-emojis">
            {EMOJI_CATEGORIES[emojiCategory].map(e => (
              <motion.button key={e} type="button" whileTap={{ scale: 0.8 }}
                className={`te-emoji${emoji === e ? ' is-active' : ''}`}
                onClick={() => setEmoji(e)}>
                {e}
              </motion.button>
            ))}
          </div>
        </Field>

        <Field label={t('topicEdit.name')}>
          <input className="te-input" placeholder={t('topicEdit.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} />
        </Field>

        <Field label={t('topicEdit.description')}>
          <input className="te-input" placeholder={t('topicEdit.descPlaceholder')} value={description} onChange={e => setDescription(e.target.value)} />
        </Field>

        <Field label={t('topicEdit.gradient')}>
          <div className="te-stops">
            <GradientStop label={t('topicEdit.from')} color={colorFrom} active={activeStop === 'from'} onClick={() => setActiveStop('from')} />
            <div className="te-stops__strip" style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }} />
            <GradientStop label={t('topicEdit.to')} color={colorTo} active={activeStop === 'to'} onClick={() => setActiveStop('to')} />
          </div>

          <div className="wc-chips te-palettes" style={{ gridTemplateColumns: 'repeat(4, 1fr)', '--accent': activeColor }}>
            {Object.keys(COLOR_PALETTES).map(pal => (
              <motion.button key={pal} type="button" whileTap={{ scale: 0.94 }}
                className={`wc-chip${colorPalette === pal ? ' is-active' : ''}`}
                style={colorPalette === pal ? { borderColor: activeColor, background: `${activeColor}22` } : undefined}
                onClick={() => setColorPalette(pal)}>
                <div className="te-palette-dots">
                  {PALETTE_PREVIEWS[pal].map(c => <span key={c} style={{ background: c }} />)}
                </div>
                <div className="wc-chip__hint" style={{ margin: 0 }}>{t(PAL_KEY[pal])}</div>
              </motion.button>
            ))}
          </div>

          <div className="te-colors">
            {COLOR_PALETTES[colorPalette].map(c => (
              <motion.button key={c} type="button" whileTap={{ scale: 0.85 }}
                aria-label={c}
                className={`te-color${activeColor === c ? ' is-active' : ''}`}
                style={{ background: c, '--pill-accent': c }}
                onClick={() => setActiveColor(c)} />
            ))}
          </div>
        </Field>

        <div className="wc-actions">
          {!isNew && (
            <GlassButton height={48} style={{ flex: 1 }} variant={confirmDelete ? 'danger' : undefined}
              onClick={handleDelete} disabled={deleting}>
              {deleting ? t('state.deleting') : confirmDelete ? t('topicEdit.deleteConfirm') : t('topicEdit.delete')}
            </GlassButton>
          )}
          <GlassButton height={48} style={{ flex: 1 }} variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? t('state.saving') : isNew ? t('topicEdit.create') : t('btn.save')}
          </GlassButton>
        </div>
      </div>
    </LiquidSheet>
  )
}
