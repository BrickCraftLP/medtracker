import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { SUB_WIDGET_TYPES, MAX_SUB_WIDGETS } from './constants.js'
import { ICON_REMOVE } from './icons.jsx'
import { SectionLabel, Pill } from './controls.jsx'
import WidgetFields from './WidgetFields.jsx'

// onChange receives an updater: list => nextList.
export default function MultiDisplayFields({ subWidgets, size, onChange }) {
  const { t } = useLanguage()

  const add = () => onChange(list =>
    list.length >= MAX_SUB_WIDGETS ? list : [...list, { widget_type: 'heatmap_intensity', config: {} }])
  const remove = idx => onChange(list => list.filter((_, i) => i !== idx))
  const update = (idx, fn) => onChange(list => list.map((sw, i) => (i === idx ? fn(sw) : sw)))
  const setType = (idx, widget_type) => update(idx, sw => ({ ...sw, widget_type, config: {} }))
  const setConfigKey = idx => (key, value) => update(idx, sw => ({ ...sw, config: { ...sw.config, [key]: value } }))

  return (
    <div className="wc-field">
      <div className="wc-field__head">
        <SectionLabel>{t('widget.subWidgets', { n: subWidgets.length })}</SectionLabel>
        {subWidgets.length < MAX_SUB_WIDGETS && (
          <motion.button type="button" whileTap={{ scale: 0.9 }} className="wc-add" onClick={add}>
            {t('widget.addSub')}
          </motion.button>
        )}
      </div>

      {subWidgets.length === 0 && <div className="wc-empty">{t('widget.noSub')}</div>}

      <AnimatePresence initial={false}>
        {subWidgets.map((sw, idx) => (
          <motion.div key={idx} className="wc-sub"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="wc-sub__head">
              <span>{t('widget.num', { n: idx + 1 })}</span>
              <motion.button type="button" whileTap={{ scale: 0.88 }} className="wc-sub__remove"
                aria-label={t('widget.remove')} onClick={() => remove(idx)}>
                {ICON_REMOVE}
              </motion.button>
            </div>

            <div className="wc-pills">
              {SUB_WIDGET_TYPES.map(type => (
                <Pill key={type} active={sw.widget_type === type} onClick={() => setType(idx, type)}>
                  {t(`widget.type.${type}`)}
                </Pill>
              ))}
            </div>

            <WidgetFields compact type={sw.widget_type} config={sw.config ?? {}} size={size}
              onChange={setConfigKey(idx)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
