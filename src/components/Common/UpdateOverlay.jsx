import LoadingPlate from './Spinner.jsx'
import { useUpdate } from '../../context/UpdateContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

// Covers the app while the waiting service worker takes over. Stays up until
// the reload swaps the document, so there is no exit animation to run.
export default function UpdateOverlay() {
  const { updating } = useUpdate()
  const { t } = useLanguage()
  if (!updating) return null
  return <LoadingPlate zIndex={9999} label={t('update.updating')} />
}
