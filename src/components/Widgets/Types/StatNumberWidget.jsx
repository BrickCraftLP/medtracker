import { useMemo } from 'react'
import { useData } from '../../../context/DataContext.jsx'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { useGraphSettings } from '../../../context/GraphSettingsContext.jsx'
import { getDateRange, filterSessionsByRange } from '../../../utils/calculations/filterTimeframeCalcs.js'
import { calcWeightedAccuracy, calcOverallAccuracy, fmtPct } from '../../../utils/calculations/accuracyRatioCalcs.js'

export default function StatNumberWidget({ config = {}, size }) {
  const { recentSessions, topics } = useData()
  const { t } = useLanguage()
  const { accLineColor, wtdLineColor } = useGraphSettings()

  const metric = config.metric ?? 'accuracy'
  const { from, to } = getDateRange(config.timeframe ?? '30d')

  const sessions = useMemo(
    () => filterSessionsByRange(recentSessions, from, to),
    [recentSessions, from, to]
  )

  const value = useMemo(() => {
    if (sessions.length === 0) return null
    return metric === 'weighted'
      ? calcWeightedAccuracy(sessions, topics)
      : calcOverallAccuracy(sessions)
  }, [sessions, topics, metric])

  const color = metric === 'weighted' ? wtdLineColor : accLineColor
  const label = metric === 'weighted' ? t('widget.wtdShort') : t('widget.avgShort')

  const numberSize = size === 'small' ? 52 : 68

  return (
    <div style={{
      padding: 14,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    }}>
      {value === null ? (
        <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
          {t('widget.noData')}
        </span>
      ) : (
        <>
          <span style={{
            fontSize: numberSize,
            fontWeight: 800,
            color,
            letterSpacing: -2,
            lineHeight: 1,
          }}>
            {fmtPct(value)}
          </span>
          <span style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
            {label}
          </span>
        </>
      )}
    </div>
  )
}
