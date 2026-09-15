import { Suspense } from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { WIDGET_COMPONENTS } from '../../Widgets/widgetRegistry.jsx'
import { WIDGET_TYPES } from './constants.js'
import { SectionLabel } from './controls.jsx'
import SheetHeader from './SheetHeader.jsx'

const PREVIEW_SUB_WIDGETS = [
  { widget_type: 'graph_view', config: {} },
  { widget_type: 'topic_accuracy', config: {} },
  { widget_type: 'heatmap_tracker', config: {} },
]

// Renders the real widget (small, default config) so the tile matches what
// lands on the dashboard.
function TypePreview({ type }) {
  const Component = WIDGET_COMPONENTS[type]
  if (!Component) return null
  return (
    <Suspense fallback={null}>
      <Component config={{}} size="small"
        subWidgets={type === 'multi_display' ? PREVIEW_SUB_WIDGETS : undefined} />
    </Suspense>
  )
}

export default function TypeStep({ isNew, selected, onSelect, onClose }) {
  const { t } = useLanguage()
  return (
    <>
      <SheetHeader step={1} title={t(isNew ? 'widget.add' : 'widget.changeType')} onClose={onClose} />
      <SectionLabel>{t('widget.chooseType')}</SectionLabel>
      <div className="wc-type-grid">
        {WIDGET_TYPES.map(type => (
          <motion.button key={type} type="button" whileTap={{ scale: 0.96 }}
            className={`wc-type${selected === type ? ' is-active' : ''}`}
            onClick={() => onSelect(type)}>
            <div className="wc-type__preview"><TypePreview type={type} /></div>
            <div className="wc-type__label">{t(`widget.type.${type}`)}</div>
          </motion.button>
        ))}
      </div>
    </>
  )
}
