import { useMemo } from 'react'
import { useData } from '../../../context/DataContext.jsx'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { calcLernScore } from '../../../utils/calculations/lernScoreCalcs.js'

const CX = 120, CY = 102, R = 76
const N = 19
const BAR_LEN = 24, BAR_W = 5

const GRAD_X1 = CX - (R + BAR_LEN / 2)
const GRAD_X2 = CX + (R + BAR_LEN / 2)

const BARS = Array.from({ length: N }, (_, i) => {
  const alpha = Math.PI * (1 - i / (N - 1))
  const half  = BAR_LEN / 2
  return {
    x1: CX + (R - half) * Math.cos(alpha),
    y1: CY - (R - half) * Math.sin(alpha),
    x2: CX + (R + half) * Math.cos(alpha),
    y2: CY - (R + half) * Math.sin(alpha),
    op: 0.38 + 0.62 * Math.sin(alpha),
  }
})

function formatScore(score) {
  if (score <= 0.26) return '0.25'
  if (score >= 3.95) return '4.0'
  return score < 1 ? score.toFixed(2).replace(/0$/, '') : score.toFixed(1)
}

export default function LernScoreWidget({ config = {}, size }) {
  const { recentSessions } = useData()
  const { t } = useLanguage()

  const { score, position, noData } = useMemo(
    () => calcLernScore(recentSessions),
    [recentSessions]
  )

  const alpha = Math.PI * (1 - position)
  const dotX  = CX + R * Math.cos(alpha)
  const dotY  = CY - R * Math.sin(alpha)

  const tier = noData
    ? t('lern.noData')
    : score < 0.4
    ? t('lern.rapidDecline')
    : score < 0.75
    ? t('lern.declining')
    : score < 1.4
    ? t('lern.steady')
    : score < 2.5
    ? t('lern.improving')
    : t('lern.rapidImprove')

  return (
    <div style={{ padding: '12px 14px 10px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
        letterSpacing: 0.5, marginBottom: 4,
      }}>
        {t('lern.title')}
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
        <svg
          viewBox="0 0 240 118"
          preserveAspectRatio="xMidYMax meet"
          style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        >
          <defs>
            <linearGradient
              id="lernBarGrad"
              x1={GRAD_X1} y1="0"
              x2={GRAD_X2} y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%"   stopColor="#FF3B30" />
              <stop offset="25%"  stopColor="#FF9F0A" />
              <stop offset="50%"  stopColor="#007AFF" />
              <stop offset="100%" stopColor="#34C759" />
            </linearGradient>

            <filter id="lernShadow" x="-30%" y="-30%" width="160%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
            </filter>

            <filter id="lernGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Floating shadow */}
          <ellipse
            cx={CX} cy={CY + 14}
            rx={R * 0.58} ry={6}
            fill="rgba(0,0,0,0.13)"
            filter="url(#lernShadow)"
          />

          {/* Radial bars */}
          {BARS.map(({ x1, y1, x2, y2, op }, i) => (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="url(#lernBarGrad)"
              strokeWidth={BAR_W}
              strokeLinecap="round"
              opacity={noData ? op * 0.45 : op}
            />
          ))}

          {/* Score indicator dot */}
          <circle
            cx={dotX} cy={dotY} r={6.5}
            fill="var(--bg-primary)"
            stroke="white"
            strokeWidth={2}
            opacity={0.95}
            filter="url(#lernGlow)"
          />
        </svg>
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 2 }}>
        <div style={{
          fontSize: size === 'small' ? 26 : 34,
          fontWeight: 800,
          letterSpacing: -1.5,
          color: 'var(--text-primary)',
          lineHeight: 1.05,
        }}>
          {formatScore(score)}×
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, letterSpacing: 0.1 }}>
          {tier}
        </div>
      </div>
    </div>
  )
}
