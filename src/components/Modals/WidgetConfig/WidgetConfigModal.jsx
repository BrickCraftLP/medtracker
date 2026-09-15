import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LiquidSheet from '../../Glass/LiquidSheet.jsx'
import TypeStep from './TypeStep.jsx'
import ConfigStep from './ConfigStep.jsx'

const paneVariants = {
  enter: dir => ({ opacity: 0, x: dir * 22 }),
  center: { opacity: 1, x: 0 },
  exit: dir => ({ opacity: 0, x: dir * -22 }),
}
const paneTransition = { duration: 0.22, ease: [0.32, 0, 0.67, 0] }

function isSwipeBack({ offset }) {
  return offset.x > 60 && Math.abs(offset.x) > Math.abs(offset.y) * 1.5
}

// Two-step widget editor: pick a type, then configure it.
export default function WidgetConfigModal({ widget, onSave, onDelete, onClose }) {
  const isNew = !widget?.id
  const [step, setStep] = useState(isNew ? 'type' : 'config')
  const [dir, setDir] = useState(1)
  const [draft, setDraft] = useState(() => ({
    size: widget?.size ?? 'medium',
    widget_type: widget?.widget_type ?? null,
    config: widget?.config ?? {},
    sub_widgets: widget?.sub_widgets ?? [],
  }))
  const saving = useRef(false)

  function chooseType(widget_type) {
    setDraft(d => ({ ...d, widget_type }))
    setDir(1)
    setStep('config')
  }

  function goBack() {
    setDir(-1)
    setStep('type')
  }

  // Optimistic save: the data layer applies the change to local state
  // synchronously, so close right away and let the network write finish in
  // the background. A failed write is reported by the parent.
  function save() {
    if (saving.current) return
    saving.current = true
    Promise.resolve()
      .then(() => onSave({ ...widget, ...draft }))
      .catch(e => console.error('Widget save failed:', e))
    onClose()
  }

  return (
    <LiquidSheet onClose={onClose}>
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          variants={paneVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={paneTransition}
          onPanEnd={step === 'config' ? (_, info) => { if (isSwipeBack(info)) goBack() } : undefined}
        >
          {step === 'type' ? (
            <TypeStep isNew={isNew} selected={draft.widget_type} onSelect={chooseType} onClose={onClose} />
          ) : (
            <ConfigStep
              draft={draft}
              canDelete={!isNew && Boolean(onDelete)}
              onSize={size => setDraft(d => ({ ...d, size }))}
              onConfigKey={(key, value) => setDraft(d => ({ ...d, config: { ...d.config, [key]: value } }))}
              onSubWidgets={fn => setDraft(d => ({ ...d, sub_widgets: fn(d.sub_widgets) }))}
              onBack={goBack}
              onClose={onClose}
              onSave={save}
              onDelete={onDelete}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </LiquidSheet>
  )
}
