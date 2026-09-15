import { Suspense } from 'react'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { WIDGET_COMPONENTS } from '../../Widgets/widgetRegistry.jsx'
import { SIZES } from './constants.js'
import { Field, ChipGrid } from './controls.jsx'
import SheetHeader from './SheetHeader.jsx'
import GlassButton from '../../Glass/GlassButton.jsx'
import WidgetFields from './WidgetFields.jsx'
import MultiDisplayFields from './MultiDisplayFields.jsx'

function LivePreview({ type, size, config, subWidgets }) {
  const Component = WIDGET_COMPONENTS[type]
  if (!Component) return null
  return (
    <div className="wc-preview">
      <div className={`wc-preview__card is-${size}`}>
        <Suspense fallback={null}>
          <Component config={config} subWidgets={subWidgets} size={size} />
        </Suspense>
      </div>
    </div>
  )
}

export default function ConfigStep({ draft, canDelete, onSize, onConfigKey, onSubWidgets, onBack, onClose, onSave, onDelete }) {
  const { t } = useLanguage()
  const { widget_type: type, size, config, sub_widgets: subWidgets } = draft

  return (
    <>
      <SheetHeader step={2} title={t(`widget.type.${type}`)} onBack={onBack} onClose={onClose} />

      <LivePreview type={type} size={size} config={config} subWidgets={subWidgets} />

      <Field label={t('widget.size')}>
        <ChipGrid columns={3} value={size} onChange={onSize}
          options={SIZES.map(s => ({ value: s, label: t(`widget.size.${s}`), hint: t(`widget.size.${s}.desc`) }))} />
      </Field>

      {type === 'multi_display'
        ? <MultiDisplayFields subWidgets={subWidgets} size={size} onChange={onSubWidgets} />
        : <WidgetFields type={type} config={config} size={size} onChange={onConfigKey} />}

      <div className="wc-actions">
        {canDelete && (
          <GlassButton height={48} style={{ flex: 1 }} onClick={onDelete}>{t('widget.remove')}</GlassButton>
        )}
        <GlassButton height={48} style={{ flex: 1 }} variant="primary" onClick={onSave}>{t('widget.save')}</GlassButton>
      </div>
    </>
  )
}
