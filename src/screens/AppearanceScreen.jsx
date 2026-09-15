import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { THEMES, MODES } from '../themes/index.js'
import { NavDirectionContext } from '../context/navDirection.js'

const GLASS = {
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  borderRadius: 16,
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
  overflow: 'hidden',
}

// Horizontal-stripe flag icon — unique `id` per icon avoids clipPath collisions.
function stripes(id, colors) {
  const n = colors.length
  const h = 22 / n
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <defs><clipPath id={id}><rect width="22" height="22" rx="5"/></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        {colors.map((c, i) => (
          <rect key={i} y={i * h} width="22" height={h + 0.5} fill={c}/>
        ))}
      </g>
    </svg>
  )
}

// Exported so PrideCollectionScreen can reuse without duplicating SVGs.
export const THEME_ICONS = {
  // ── Standard ─────────────────────────────────────────────────────────────
  none: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M6 18L18 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  light: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M12 3v1M12 20v1M4.2 4.2l.7.7M18.4 18.4l.7.7M3 12h1M20 12h1M4.2 19.8l.7-.7M18.4 5.6l.7-.7"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  dark: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  // ── Pride ─────────────────────────────────────────────────────────────────
  // All Pride — rainbow arcs (distinctive, keeps its original design)
  'pride-all': (
    <svg width="22" height="22" viewBox="0 0 22 18" fill="none">
      <path d="M1 17a10 10 0 0 1 20 0" stroke="#E40303" strokeWidth="2.4" strokeLinecap="round"/>
      <path d="M3 17a8 8 0 0 1 16 0"   stroke="#FF8C00" strokeWidth="2.4" strokeLinecap="round"/>
      <path d="M5 17a6 6 0 0 1 12 0"   stroke="#FFED00" strokeWidth="2.4" strokeLinecap="round"/>
      <path d="M7 17a4 4 0 0 1 8 0"    stroke="#008026" strokeWidth="2.4" strokeLinecap="round"/>
      <path d="M9 17a2 2 0 0 1 4 0"    stroke="#004DFF" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  ),
  // Progress Pride — 8 stripes: black, brown + rainbow
  'pride-prog':    stripes('pi-prog',    ['#000000','#784F17','#E40303','#FF8C00','#FFED00','#008026','#004DFF','#750787']),
  // Gay men's (MLM) — teal → mint → white → lavender → purple → indigo
  'pride-mlm':     stripes('pi-mlm',     ['#078D70','#26CEAA','#98E8C1','#FFFFFF','#7BADE2','#5049CC','#3D1A8E']),
  // Lesbian sunset — dark orange → orange → white → pink → deep pink
  'pride-wlw':     stripes('pi-wlw',     ['#D62900','#FF9B55','#FFFFFF','#D462A6','#A50062']),
  // Bisexual — pink / purple / blue
  'pride-bi':      stripes('pi-bi',      ['#D60270','#D60270','#9B4F96','#0038A8','#0038A8']),
  // Pansexual — hot pink / golden yellow / cyan
  'pride-pan':     stripes('pi-pan',     ['#FF218C','#FFD800','#21B1FF']),
  // Transgender — sky blue / pastel pink / white / pastel pink / sky blue
  'pride-trans':   stripes('pi-trans',   ['#55CDFC','#F7A8B8','#FFFFFF','#F7A8B8','#55CDFC']),
  // Non-Binary — yellow / white / purple / charcoal
  'pride-nb':      stripes('pi-nb',      ['#FCF431','#FFFFFF','#9C59D1','#2D2D2D']),
  // Asexual — black / grey / white / deep purple
  'pride-ace':     stripes('pi-ace',     ['#000000','#A4A4A4','#FFFFFF','#810081']),
  // Aromantic — dark green / light green / white / grey / black
  'pride-aro':     stripes('pi-aro',     ['#3A8232','#A8D379','#FFFFFF','#A9A9A9','#000000']),
  // Agender — black / grey / white / light green / white / grey / black
  'pride-ag':      stripes('pi-ag',      ['#000000','#B9B9B9','#FFFFFF','#B8F483','#FFFFFF','#B9B9B9','#000000']),
  // Genderfluid — pink / white / purple / black / blue
  'pride-gf':      stripes('pi-gf',      ['#FF76A4','#FFFFFF','#BE18D6','#000000','#333EBC']),
  // Intersex — yellow background with purple circle (unique design)
  'pride-is': (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect width="22" height="22" rx="5" fill="#FFD800"/>
      <circle cx="11" cy="11" r="6" stroke="#7902AA" strokeWidth="2.5" fill="none"/>
    </svg>
  ),
  // Demiboy — dark grey / light grey / pastel blue / white
  'pride-demiboy':  stripes('pi-dmb',   ['#7F7F7F','#C4C4C4','#FFFFFF','#9BD9EB','#FFFFFF']),
  // Demigirl — dark grey / light grey / white / pastel pink / white
  'pride-demigirl': stripes('pi-dmg',   ['#7F7F7F','#C4C4C4','#FFFFFF','#FEBDD6','#FFFFFF']),
  // Genderqueer — lavender / white / green
  'pride-gq':      stripes('pi-gq',     ['#B57EDC','#FFFFFF','#498026']),
  // Polysexual — magenta / bright green / royal blue
  'pride-poly':    stripes('pi-poly',   ['#F61CB9','#07D569','#0B5FDC']),
  // Omnisexual — pink / light pink / light blue / indigo / dark purple
  'pride-omni':    stripes('pi-omni',   ['#FF76A4','#FEB8CE','#BFB9FF','#8B2FC9','#650ED5']),
  // Demisexual — black triangle flag simplified as: black / white / grey / purple
  'pride-demi':    stripes('pi-demi',   ['#000000','#FFFFFF','#A4A4A4','#810081']),
}


function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
        {title}
      </p>
      <div style={GLASS}>{children}</div>
    </div>
  )
}

function ThemeRow({ opt, active, onTap, divider, label, expandable, expanded, onExpand }) {
  return (
    <>
      <motion.div
        whileTap={{ scale: 0.98, backgroundColor: 'var(--bg-tertiary)' }}
        onClick={onTap}
        style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 14, cursor: 'pointer' }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: active ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: active ? 'var(--accent)' : 'var(--text-secondary)',
          transition: 'background 0.15s, color 0.15s',
        }}>
          {THEME_ICONS[opt.key]}
        </div>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        {active && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {expandable && (
          <motion.button
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            onClick={e => { e.stopPropagation(); onExpand() }}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', borderRadius: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
        )}
      </motion.div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px 0 66px' }} />}
    </>
  )
}

export default function AppearanceScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const { mode, setMode, collection, setCollection, customColors } = useTheme()

  const activePride = THEMES.find(th => th.group === 'pride' && th.key === collection)

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '0.5px solid rgba(255,255,255,0.22)', borderRadius: 10, padding: '7px 12px', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 30px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('settings.appearance')}
        </h1>

        <Section title={t('settings.appearance.mode')}>
          {MODES.map((opt, i) => (
            <ThemeRow
              key={opt.key}
              opt={opt}
              label={t(opt.labelKey)}
              active={mode === opt.key}
              onTap={() => setMode(opt.key)}
              divider={i < MODES.length - 1}
            />
          ))}
        </Section>

        <Section title={t('settings.appearance.themes')}>
          {/* None — no theme overlay */}
          <ThemeRow
            opt={{ key: 'none' }}
            label={t('settings.appearance.none')}
            active={collection === 'none'}
            onTap={() => setCollection('none')}
            divider={true}
          />

          {/* Custom gradient nav row */}
          <motion.div
            whileTap={{ scale: 0.98, backgroundColor: 'var(--bg-tertiary)' }}
            onClick={() => { setCollection('custom'); navigate('/settings/appearance/custom') }}
            style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 14, cursor: 'pointer' }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: customColors.length === 1
                ? customColors[0]
                : `linear-gradient(135deg, ${customColors.join(', ')})`,
              border: collection === 'custom' ? '2px solid var(--accent)' : '0.5px solid var(--border)',
              boxShadow: collection === 'custom' ? '0 0 0 3px var(--accent-muted)' : 'none',
              transition: 'border 0.15s, box-shadow 0.15s',
            }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', display: 'block' }}>
                {t('settings.appearance.custom')}
              </span>
              {collection === 'custom' && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {customColors.length} {t('settings.appearance.custom.colors-count')}
                </span>
              )}
            </div>
            {collection === 'custom' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5l4.5 4.5L19 7" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
              <path d="M1 1l5 5-5 5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.div>
          <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px 0 66px' }} />

          {/* Pride Collection nav row */}
          <motion.div
            whileTap={{ scale: 0.98, backgroundColor: 'var(--bg-tertiary)' }}
            onClick={() => navigate('/settings/appearance/pride')}
            style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 14, cursor: 'pointer' }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: activePride ? 'var(--accent-muted)' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 22 18" fill="none">
                <path d="M1 17a10 10 0 0 1 20 0" stroke="#E40303" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M3 17a8 8 0 0 1 16 0"   stroke="#FF8C00" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M5 17a6 6 0 0 1 12 0"   stroke="#FFED00" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M7 17a4 4 0 0 1 8 0"    stroke="#008026" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M9 17a2 2 0 0 1 4 0"    stroke="#004DFF" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', display: 'block' }}>
                {t('settings.appearance.pride-collection')}
              </span>
              {activePride && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {t(activePride.labelKey)}
                </span>
              )}
            </div>
            {activePride && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5l4.5 4.5L19 7" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
              <path d="M1 1l5 5-5 5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.div>
        </Section>

      </div>
    </div>
  )
}
