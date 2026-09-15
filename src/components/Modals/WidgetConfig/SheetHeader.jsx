import { useLanguage } from '../../../context/LanguageContext.jsx'
import GlassButton from './GlassButton.jsx'
import { ICON_BACK, ICON_CLOSE } from './icons.jsx'

export default function SheetHeader({ step, title, onBack, onClose }) {
  const { t } = useLanguage()
  return (
    <header className="sheet-header">
      <div className="sheet-header__row">
        {onBack && (
          <GlassButton size={34} onClick={onBack} ariaLabel={t('widget.back')}>{ICON_BACK}</GlassButton>
        )}
        <div className="sheet-header__titles">
          <span className="sheet-header__eyebrow">{t('widget.step', { n: step })}</span>
          <h2 className="sheet-header__title">{title}</h2>
        </div>
        <GlassButton size={34} onClick={onClose} ariaLabel={t('widget.close')}>{ICON_CLOSE}</GlassButton>
      </div>
      <div className="sheet-progress" aria-hidden>
        <span className="is-active" />
        <span className={step === 2 ? 'is-active' : undefined} />
      </div>
    </header>
  )
}
