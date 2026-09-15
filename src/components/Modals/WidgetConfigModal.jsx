import { useState, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useData } from '../../context/DataContext.jsx'
import { WIDGET_COMPONENTS } from '../Widgets/widgetRegistry.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import Switch from '../Common/Switch.jsx'
import BouncyAccordion from '../Common/BouncyAccordion.jsx'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { useGraphSettings } from '../../context/GraphSettingsContext.jsx'
import { getHeatmapColors } from '../../utils/calculations/heatmapIntensityCalcs.js'

// ── Type-picker tile preview — renders the real widget component (small size,
// default config) so what's shown here matches what lands on the dashboard. ──

const TYPE_PREVIEW_SUB_WIDGETS = [
  { widget_type: 'graph_view', config: {} },
  { widget_type: 'topic_accuracy', config: {} },
  { widget_type: 'heatmap_tracker', config: {} },
]

function TypeTilePreview({ type }) {
  const Component = WIDGET_COMPONENTS[type]
  if (!Component) return null
  return (
    <div style={{ height: '100%', overflow: 'hidden', pointerEvents: 'none' }}>
      <Suspense fallback={null}>
        <Component
          config={{}}
          size="small"
          subWidgets={type === 'multi_display' ? TYPE_PREVIEW_SUB_WIDGETS : undefined}
        />
      </Suspense>
    </div>
  )
}

// ── Live preview with real data ──────────────────────────────────────────────

function LiveWidgetPreview({ widgetType, size, config, subWidgets }) {
  const Component = WIDGET_COMPONENTS[widgetType]
  if (!Component) return null

  const containerStyle = size === 'small'
    ? { width: '52%', aspectRatio: '1', alignSelf: 'center' }
    : size === 'large'
    ? { width: '100%', height: 240 }
    : { width: '100%', height: 148 }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
      <div style={{
        ...containerStyle,
        borderRadius: 18,
        overflow: 'hidden',
        background: 'var(--card-bg)',
        border: '0.5px solid var(--border)',
        boxShadow: 'var(--shadow)',
        position: 'relative',
        flexShrink: 0,
      }}>
        <Suspense fallback={null}>
          <Component config={config} subWidgets={subWidgets} size={size} />
        </Suspense>
      </div>
    </div>
  )
}

// ── Widget type definitions ──────────────────────────────────────────────────

const WIDGET_TYPES = [
  { type: 'heatmap_intensity',    label: 'Heatmap Intensität' },
  { type: 'heatmap_tracker',      label: 'Streak Tracker' },
  { type: 'graph_view',           label: 'Diagramm' },
  { type: 'todo_list',            label: 'To-Do Liste' },
  { type: 'quick_launch',         label: 'Schnellstart' },
  { type: 'topic_stats',          label: 'Thema-Statistik' },
  { type: 'topic_accuracy',       label: 'Genauigkeit Themen' },
  { type: 'topic_accuracy_graph', label: 'Genauigkeit Verlauf' },
  { type: 'multi_display',        label: 'Multi-Widget' },
  { type: 'lern_score',           label: 'Lern Score' },
  { type: 'stat_number',          label: 'Zahl Widget' },
]

const SUB_WIDGET_TYPES = WIDGET_TYPES.filter(t => t.type !== 'multi_display')

const SIZE_OPTIONS = [
  { size: 'small',  label: 'Klein',  description: 'Halbe Breite' },
  { size: 'medium', label: 'Mittel', description: 'Volle Breite' },
  { size: 'large',  label: 'Groß',   description: 'Volle Breite & Höhe' },
]

// ── Step slide variants ──────────────────────────────────────────────────────

const stepVariants = {
  enter:  d => ({ opacity: 0, x: d * 22 }),
  center:  { opacity: 1, x: 0 },
  exit:   d => ({ opacity: 0, x: d * -22 }),
}

// ── Main component ───────────────────────────────────────────────────────────

export default function WidgetConfigModal({ widget, onSave, onDelete, onClose }) {
  const { topics } = useData()
  const { t } = useLanguage()
  const isNew = !widget?.id

  const translatedTypes = WIDGET_TYPES.map(wt => ({ ...wt, label: t(`widget.type.${wt.type}`) }))
  const translatedSubTypes = translatedTypes.filter(wt => wt.type !== 'multi_display')
  const translatedSizes = SIZE_OPTIONS.map(o => ({
    ...o,
    label: t(`widget.size.${o.size}`),
    description: t(`widget.size.${o.size}.desc`),
  }))

  const [step,       setStep]       = useState(isNew ? 'type' : 'config')
  const [slideDir,   setSlideDir]   = useState(1)
  const [size,       setSize]       = useState(widget?.size        ?? 'medium')
  const [widgetType, setWidgetType] = useState(widget?.widget_type ?? null)
  const [config,     setConfig]     = useState(widget?.config      ?? {})
  const [subWidgets, setSubWidgets] = useState(widget?.sub_widgets ?? [])
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  function goToConfig(type) {
    setWidgetType(type)
    setSlideDir(1)
    setStep('config')
  }

  function goBack() {
    setSlideDir(-1)
    setStep('type')
  }

  function updateConfig(key, value) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  function addSubWidget() {
    if (subWidgets.length >= 3) return
    setSubWidgets(prev => [...prev, { widget_type: 'heatmap_intensity', config: {} }])
  }

  function removeSubWidget(idx) {
    setSubWidgets(prev => prev.filter((_, i) => i !== idx))
  }

  function updateSubWidgetType(idx, type) {
    setSubWidgets(prev => prev.map((sw, i) => i === idx ? { ...sw, widget_type: type, config: {} } : sw))
  }

  function updateSubWidgetConfig(idx, key, value) {
    setSubWidgets(prev => prev.map((sw, i) =>
      i === idx ? { ...sw, config: { ...sw.config, [key]: value } } : sw
    ))
  }

  // Optimistic save: the data layer applies the change to local state
  // synchronously, so close right away and let the network write finish in
  // the background. A failed write only gets logged — the sheet is gone.
  function handleSave() {
    if (saving) return
    setSaving(true)
    Promise.resolve()
      .then(() => onSave({ ...widget, size, widget_type: widgetType, config, sub_widgets: subWidgets }))
      .catch(e => console.error('Widget save failed:', e))
    onClose()
  }

  const currentTypeDef = WIDGET_TYPES.find(w => w.type === widgetType)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 40 }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, marginBottom: 8 }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(120,120,128,0.18)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(120,120,128,0.22)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </motion.button>
        </div>

        <AnimatePresence mode="wait" custom={slideDir}>
          {step === 'type' ? (
            <motion.div
              key="type"
              custom={slideDir}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.32, 0, 0.67, 0] }}
            >
              <h2 style={{ margin: '0 0 18px', fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
                {isNew ? t('widget.add') : t('widget.changeType')}
              </h2>

              <SectionLabel>{t('widget.chooseType')}</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {translatedTypes.map(({ type, label }) => {
                  const active = widgetType === type
                  return (
                    <motion.button
                      key={type}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => goToConfig(type)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 14,
                        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        background: active ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                        cursor: 'pointer',
                        padding: 0,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        textAlign: 'left',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                        <TypeTilePreview type={type} />
                      </div>
                      <div style={{
                        padding: '6px 10px 8px',
                        borderTop: '1px solid var(--border)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: active ? 'var(--accent)' : 'var(--text-primary)',
                        background: active ? 'var(--accent-muted)' : 'var(--bg-secondary)',
                        flexShrink: 0,
                      }}>
                        {label}
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="config"
              custom={slideDir}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.32, 0, 0.67, 0] }}
              onPanEnd={(_, info) => {
                if (info.offset.x > 60 && Math.abs(info.offset.x) > Math.abs(info.offset.y) * 1.5) goBack()
              }}
            >
              {/* Back button row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={goBack}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '7px 13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                  {t('widget.back')}
                </motion.button>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.3 }}>
                  {currentTypeDef ? t(`widget.type.${currentTypeDef.type}`) : ''}
                </span>
              </div>

              {/* Live preview */}
              {widgetType && (
                <LiveWidgetPreview
                  widgetType={widgetType}
                  size={size}
                  config={config}
                  subWidgets={subWidgets}
                />
              )}

              {/* Size */}
              <SectionLabel>{t('widget.size')}</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
                {translatedSizes.map(o => (
                  <motion.button key={o.size} whileTap={{ scale: 0.94 }} onClick={() => setSize(o.size)}
                    style={chipStyle(size === o.size)}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{o.description}</div>
                  </motion.button>
                ))}
              </div>

              {/* Type-specific config */}
              {widgetType === 'todo_list' && (
                <TodoWidgetSettings config={config} topics={topics} updateConfig={updateConfig} t={t} />
              )}

              {widgetType === 'heatmap_intensity' && (
                <HeatmapWidgetSettings config={config} updateConfig={updateConfig} t={t} />
              )}

              {widgetType === 'heatmap_tracker' && (
                <TrackerWidgetSettings config={config} topics={topics} updateConfig={updateConfig} t={t} />
              )}

              {widgetType && widgetType !== 'multi_display' && widgetType !== 'todo_list' && widgetType !== 'heatmap_intensity' && widgetType !== 'heatmap_tracker' && (
                <CollapsibleSettings title={t('widget.settings')}>
                  {(widgetType === 'quick_launch' || widgetType === 'topic_stats') && (
                    <TopicPicker label={t('widget.topic')} selected={config.topic_id} topics={topics}
                      onSelect={id => updateConfig('topic_id', id)} />
                  )}

                  {(widgetType === 'topic_accuracy' || widgetType === 'topic_accuracy_graph') && (
                    <MultiTopicPicker
                      label={t('widget.topics')}
                      selected={config.topic_ids ?? []}
                      topics={topics}
                      max={widgetType === 'topic_accuracy_graph' ? (size === 'small' ? 4 : 8) : (size === 'large' ? 6 : 3)}
                      onToggle={id => {
                        const cur = config.topic_ids ?? []
                        const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
                        updateConfig('topic_ids', next)
                      }}
                    />
                  )}
                  {widgetType === 'topic_accuracy' && (
                    <ToggleRow
                      label={t('widget.showWeights')}
                      hint={t('widget.showWeightsHint')}
                      value={config.show_weights ?? false}
                      onChange={v => updateConfig('show_weights', v)}
                    />
                  )}

                  {widgetType === 'graph_view' && (
                    <>
                      <OptionPicker label={t('widget.display')} selected={config.graph_mode}
                        options={[
                          { value: 'accuracy_all',      label: t('widget.graph.accuracyAll') },
                          { value: 'exercises_all',      label: t('widget.graph.exercisesAll') },
                          { value: 'accuracy_per_topic', label: t('widget.graph.accuracyTopic') },
                        ]}
                        onSelect={v => updateConfig('graph_mode', v)} />
                      {config.graph_mode === 'accuracy_per_topic' && (
                        <TopicPicker label={t('widget.topic')} selected={config.topic_id} topics={topics}
                          onSelect={id => updateConfig('topic_id', id)} />
                      )}
                      {config.graph_mode === 'accuracy_per_topic' && !config.topic_id && (
                        <ToggleRow
                          label={t('widget.showWeights')}
                          hint={t('widget.showWeightsHint')}
                          value={config.show_weights ?? false}
                          onChange={v => updateConfig('show_weights', v)}
                        />
                      )}
                      {(config.graph_mode === 'accuracy_all' || config.graph_mode == null) && (
                        <>
                          <ToggleRow
                            label={t('widget.showAccuracy')}
                            hint={t('widget.showAccuracyHint')}
                            value={config.show_accuracy ?? true}
                            onChange={v => updateConfig('show_accuracy', v)}
                          />
                          <ToggleRow
                            label={t('widget.showWeighted')}
                            hint={t('widget.showWeightedHint')}
                            value={config.show_weighted ?? false}
                            onChange={v => updateConfig('show_weighted', v)}
                          />
                        </>
                      )}
                      <TimeframePicker selected={config.timeframe} onSelect={v => updateConfig('timeframe', v)} t={t} />
                    </>
                  )}

                  {widgetType === 'topic_accuracy_graph' && (
                    <TimeframePicker selected={config.timeframe} onSelect={v => updateConfig('timeframe', v)} t={t} />
                  )}

                  {widgetType === 'stat_number' && (
                    <>
                      <OptionPicker
                        label={t('widget.metric')}
                        selected={config.metric ?? 'accuracy'}
                        options={[
                          { value: 'accuracy', label: t('widget.graph.accuracyAll') },
                          { value: 'weighted', label: t('stats.weightedAvg') },
                        ]}
                        onSelect={v => updateConfig('metric', v)}
                      />
                      <TimeframePicker selected={config.timeframe} onSelect={v => updateConfig('timeframe', v)} t={t} />
                    </>
                  )}
                </CollapsibleSettings>
              )}

              {widgetType === 'multi_display' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <SectionLabel style={{ margin: 0 }}>{t('widget.subWidgets', { n: subWidgets.length })}</SectionLabel>
                    {subWidgets.length < 3 && (
                      <motion.button whileTap={{ scale: 0.9 }} onClick={addSubWidget}
                        style={{
                          background: 'var(--accent-muted)', border: '1px solid var(--accent)',
                          borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 600,
                          color: 'var(--accent)', cursor: 'pointer',
                        }}>
                        {t('widget.addSub')}
                      </motion.button>
                    )}
                  </div>

                  {subWidgets.length === 0 && (
                    <div style={{
                      padding: '20px', borderRadius: 12, border: '2px dashed var(--border-strong)',
                      textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13,
                    }}>
                      {t('widget.noSub')}
                    </div>
                  )}

                  <AnimatePresence>
                    {subWidgets.map((sw, idx) => (
                      <motion.div key={idx}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        style={{
                          background: 'var(--bg-tertiary)', borderRadius: 14,
                          padding: '12px 14px', marginBottom: 10,
                          border: '1px solid var(--border)',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                            {t('widget.num', { n: idx + 1 })}
                          </span>
                          <motion.button whileTap={{ scale: 0.88 }} onClick={() => removeSubWidget(idx)}
                            style={{
                              background: 'var(--wrong)', border: 'none', borderRadius: 6,
                              width: 26, height: 26, cursor: 'pointer', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                          </motion.button>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                          {translatedSubTypes.map(wt => (
                            <motion.button key={wt.type} whileTap={{ scale: 0.92 }}
                              onClick={() => updateSubWidgetType(idx, wt.type)}
                              style={{
                                padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                                border: `2px solid ${sw.widget_type === wt.type ? 'var(--accent)' : 'var(--border)'}`,
                                background: sw.widget_type === wt.type ? 'var(--accent-muted)' : 'var(--card-bg)',
                                color: 'var(--text-primary)', cursor: 'pointer',
                              }}>
                              {wt.label}
                            </motion.button>
                          ))}
                        </div>

                        {(sw.widget_type === 'quick_launch' || sw.widget_type === 'topic_stats' || sw.widget_type === 'graph_view' || sw.widget_type === 'topic_accuracy' || sw.widget_type === 'topic_accuracy_graph' || sw.widget_type === 'stat_number') && (
                          <CollapsibleSettings title={t('widget.settings')}>
                            {(sw.widget_type === 'quick_launch' || sw.widget_type === 'topic_stats') && (
                              <TopicPicker label={t('widget.topic')} selected={sw.config?.topic_id} topics={topics}
                                onSelect={id => updateSubWidgetConfig(idx, 'topic_id', id)} />
                            )}

                            {sw.widget_type === 'graph_view' && (
                              <>
                                <OptionPicker label={t('widget.display')} selected={sw.config?.graph_mode}
                                  options={[
                                    { value: 'accuracy_all',      label: t('widget.graph.accuracyAll') },
                                    { value: 'exercises_all',      label: t('widget.graph.exercisesAll') },
                                    { value: 'accuracy_per_topic', label: t('widget.graph.accuracyTopicSub') },
                                  ]}
                                  onSelect={v => updateSubWidgetConfig(idx, 'graph_mode', v)} />
                                {sw.config?.graph_mode === 'accuracy_per_topic' && (
                                  <TopicPicker label={t('widget.topic')} selected={sw.config?.topic_id} topics={topics}
                                    onSelect={id => updateSubWidgetConfig(idx, 'topic_id', id)} />
                                )}
                              </>
                            )}

                            {sw.widget_type === 'topic_accuracy' && (
                              <>
                                <MultiTopicPicker
                                  label={t('widget.topics')}
                                  selected={sw.config?.topic_ids ?? []}
                                  topics={topics}
                                  max={size === 'large' ? 6 : size === 'medium' ? 4 : 2}
                                  onToggle={id => {
                                    const cur = sw.config?.topic_ids ?? []
                                    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
                                    updateSubWidgetConfig(idx, 'topic_ids', next)
                                  }}
                                />
                                <ToggleRow
                                  label={t('widget.showWeights')}
                                  hint={t('widget.showWeightsHint')}
                                  value={sw.config?.show_weights ?? false}
                                  onChange={v => updateSubWidgetConfig(idx, 'show_weights', v)}
                                />
                              </>
                            )}

                            {sw.widget_type === 'topic_accuracy_graph' && (
                              <>
                                <MultiTopicPicker
                                  label={t('widget.topics')}
                                  selected={sw.config?.topic_ids ?? []}
                                  topics={topics}
                                  max={4}
                                  onToggle={id => {
                                    const cur = sw.config?.topic_ids ?? []
                                    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
                                    updateSubWidgetConfig(idx, 'topic_ids', next)
                                  }}
                                />
                                <TimeframePicker selected={sw.config?.timeframe} onSelect={v => updateSubWidgetConfig(idx, 'timeframe', v)} t={t} />
                              </>
                            )}

                            {sw.widget_type === 'stat_number' && (
                              <>
                                <OptionPicker
                                  label={t('widget.metric')}
                                  selected={sw.config?.metric ?? 'accuracy'}
                                  options={[
                                    { value: 'accuracy', label: t('widget.graph.accuracyAll') },
                                    { value: 'weighted', label: t('stats.weightedAvg') },
                                  ]}
                                  onSelect={v => updateSubWidgetConfig(idx, 'metric', v)}
                                />
                                <TimeframePicker selected={sw.config?.timeframe} onSelect={v => updateSubWidgetConfig(idx, 'timeframe', v)} t={t} />
                              </>
                            )}
                          </CollapsibleSettings>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Actions */}
              {error && <p style={{ color: 'var(--wrong)', fontSize: 13, marginBottom: 10 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 10 }}>
                {!isNew && onDelete && (
                  <motion.button whileTap={{ scale: 0.97 }} className="btn btn-secondary"
                    style={{ flex: 1 }} onClick={onDelete}>
                    {t('widget.remove')}
                  </motion.button>
                )}

                <motion.button whileTap={{ scale: 0.97 }} className="btn btn-primary"
                  style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {t('widget.save')}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ── Small helper components ──────────────────────────────────────────────────

// Single-section settings block, rendered with the same bouncy accordion the
// global Settings screen uses. Starts open, like the old collapser did.
function CollapsibleSettings({ title, children }) {
  const [openId, setOpenId] = useState('settings')
  const items = [{
    id: 'settings',
    title,
    icon: ICON_GEAR,
    content: <div style={{ paddingTop: 12 }}>{children}</div>,
  }]
  return (
    <div style={{ marginBottom: 20 }}>
      <BouncyAccordion items={items} value={openId} onValueChange={setOpenId} />
    </div>
  )
}

const ICON_GEAR = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)">
    <path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7 7 0 00-1.63-.94l-.36-2.54A.5.5 0 0013.9 2h-3.84a.5.5 0 00-.49.42l-.36 2.54a7 7 0 00-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.67 8.48a.5.5 0 00.12.64l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 00.49.42h3.84a.5.5 0 00.49-.42l.36-2.54a7 7 0 001.63-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/>
  </svg>
)

const HEATMAP_PRESETS = { blue: '#3b82f6', green: '#22c55e', purple: '#8b5cf6' }

// Heatmap widget colors: preset theme or a custom hex from the app's color
// picker. Stored per widget; unset falls back to the global heatmap theme.
function HeatmapWidgetSettings({ config, updateConfig, t }) {
  const { heatmapTheme, heatmapCustomColor } = useGraphSettings()
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const [openId, setOpenId] = useState('theme')
  const theme = config.heatmap_theme ?? heatmapTheme
  const customColor = config.heatmap_custom_color ?? heatmapCustomColor ?? '#3b82f6'

  function setCustom(hex) {
    updateConfig('heatmap_custom_color', hex)
    if (theme !== 'custom') updateConfig('heatmap_theme', 'custom')
  }

  const ramp = colors => (
    <div style={{ display: 'flex', gap: 4 }}>
      {colors.map((c, i) => <div key={i} style={{ flex: 1, height: 22, borderRadius: 5, background: c }} />)}
    </div>
  )

  const swatch = (key, background, label) => {
    const selected = theme === key
    return (
      <motion.button key={key} whileTap={{ scale: 0.92 }}
        onClick={() => { updateConfig('heatmap_theme', key); if (key === 'custom') setOpenId('custom') }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, background,
          border: selected ? '2px solid var(--accent)' : '2px solid transparent',
          boxShadow: selected ? '0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent)' : 'none',
          transition: 'all 0.15s',
        }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
      </motion.button>
    )
  }

  const items = [
    {
      id: 'theme',
      title: t('settings.heatmapTheme'),
      summary: t(`settings.theme.${theme}`),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="10" y="3" width="5" height="5" rx="1.2" opacity="0.6"/><rect x="17" y="3" width="4" height="5" rx="1.2" opacity="0.3"/><rect x="3" y="10" width="5" height="5" rx="1.2" opacity="0.4"/><rect x="10" y="10" width="5" height="5" rx="1.2"/><rect x="17" y="10" width="4" height="5" rx="1.2" opacity="0.7"/><rect x="3" y="17" width="5" height="4" rx="1.2" opacity="0.8"/><rect x="10" y="17" width="5" height="4" rx="1.2" opacity="0.3"/><rect x="17" y="17" width="4" height="4" rx="1.2"/></svg>,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
            {Object.entries(HEATMAP_PRESETS).map(([k, c]) => swatch(k, c, t(`settings.theme.${k}`)))}
            {swatch('custom', customColor, t('settings.theme.custom'))}
          </div>
          {ramp(getHeatmapColors(theme, customColor, isDark))}
        </div>
      ),
    },
    {
      id: 'custom',
      title: t('settings.heatmapCustomColor'),
      summary: customColor.toUpperCase(),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z"/></svg>,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.heatmapCustomHint')}</p>
          <HexColorPicker color={customColor} onChange={setCustom} style={{ width: '100%', height: 200 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: customColor, border: '0.5px solid var(--border-strong)' }} />
            <div style={{ flex: 1, height: 40, borderRadius: 10, background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 2 }}>
              <span style={{ fontSize: 15, fontFamily: 'monospace', color: 'var(--text-tertiary)', userSelect: 'none' }}>#</span>
              <HexColorInput color={customColor} onChange={setCustom}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'monospace', color: 'var(--text-primary)', width: '100%', letterSpacing: 1 }} />
            </div>
          </div>
          {ramp(getHeatmapColors('custom', customColor, isDark))}
        </div>
      ),
    },
  ]

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{t('widget.settings')}</SectionLabel>
      <BouncyAccordion items={items} value={openId} onValueChange={setOpenId} />
    </div>
  )
}

const ICON_MODE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
)
const ICON_PALETTE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z"/></svg>
)

// Streak tracker settings, split into a "Mode" section (tracking mode + topic
// when relevant) and a "Color" section — same one-section-open accordion the
// activity (heatmap_intensity) widget uses.
function TrackerWidgetSettings({ config, topics, updateConfig, t }) {
  const [openId, setOpenId] = useState('mode')
  const mode = config.tracker_mode ?? 'any'
  const topic = mode === 'topic' ? topics.find(tp => tp.id === config.topic_id) : null
  const color = config.tracker_color ?? null

  const items = [
    {
      id: 'mode',
      title: t('widget.mode'),
      summary: mode === 'topic' ? (topic?.name ?? t('widget.tracker.topic')) : t(`widget.tracker.${mode}`),
      icon: ICON_MODE,
      content: (
        <div style={{ paddingTop: 8 }}>
          <OptionPicker label={t('widget.mode')} selected={mode}
            options={[
              { value: 'any', label: t('widget.tracker.any') },
              { value: 'all', label: t('widget.tracker.all') },
              { value: 'topic', label: t('widget.tracker.topic') },
            ]}
            onSelect={v => updateConfig('tracker_mode', v)} />
          {mode === 'topic' && (
            <TopicPicker label={t('widget.topic')} selected={config.topic_id} topics={topics}
              onSelect={id => updateConfig('topic_id', id)} />
          )}
        </div>
      ),
    },
    {
      id: 'color',
      title: t('widget.tracker.color'),
      summary: color ? color.toUpperCase() : t('widget.tracker.colorAuto'),
      icon: ICON_PALETTE,
      content: (
        <div style={{ paddingTop: 8 }}>
          <WidgetColorPicker
            label={t('widget.tracker.color')}
            autoLabel={t('widget.tracker.colorAuto')}
            value={color}
            onChange={c => updateConfig('tracker_color', c)}
          />
        </div>
      ),
    },
  ]

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{t('widget.settings')}</SectionLabel>
      <BouncyAccordion items={items} value={openId} onValueChange={setOpenId} />
    </div>
  )
}

// App color picker (same as the custom theme screen) with an "Auto" chip that
// clears the value (null) so the widget falls back to its default color.
function WidgetColorPicker({ label, autoLabel, value, onChange }) {
  const color = value ?? '#3b82f6'
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{label}</SectionLabel>
      <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
        <motion.button whileTap={{ scale: 0.94 }} onClick={() => onChange(null)}
          style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11,
            border: `1.5px solid ${value == null ? 'var(--accent)' : 'var(--border)'}`,
            background: value == null ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
            color: 'var(--text-primary)', cursor: 'pointer', fontWeight: value == null ? 600 : 400,
          }}>
          {autoLabel}
        </motion.button>
      </div>
      <HexColorPicker color={color} onChange={onChange} style={{ width: '100%', height: 180, opacity: value == null ? 0.55 : 1, transition: 'opacity 0.15s' }} />
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: value ?? 'var(--accent)', border: '0.5px solid var(--border-strong)' }} />
        <div style={{ flex: 1, height: 40, borderRadius: 10, background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 2 }}>
          <span style={{ fontSize: 15, fontFamily: 'monospace', color: 'var(--text-tertiary)', userSelect: 'none' }}>#</span>
          <HexColorInput color={color} onChange={onChange}
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'monospace', color: 'var(--text-primary)', width: '100%', letterSpacing: 1 }} />
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600,
      marginBottom: 8, letterSpacing: 0.3, ...style,
    }}>
      {children}
    </div>
  )
}

const SWATCH_COLORS = [
  '#007AFF', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#6366f1', '#f97316', '#14b8a6',
]

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{label}</SectionLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SWATCH_COLORS.map(c => (
          <motion.button
            key={c}
            whileTap={{ scale: 0.85 }}
            onClick={() => onChange(c)}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: c,
              border: value === c ? `3px solid var(--text-primary)` : '3px solid transparent',
              outline: value === c ? `2px solid ${c}` : 'none',
              outlineOffset: 1,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'border 0.15s, outline 0.15s',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ToggleRow({ label, hint, value, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 12,
      background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)',
      marginBottom: 20,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{hint}</div>}
      </div>
      <Switch checked={value} onChange={onChange} />
    </div>
  )
}

function OptionPicker({ label, selected, options, onSelect }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{label}</SectionLabel>
      {options.map(o => (
        <motion.button key={o.value} whileTap={{ scale: 0.97 }} onClick={() => onSelect(o.value)}
          style={{ ...rowChipStyle(selected === o.value), display: 'flex', width: '100%', textAlign: 'left',
            fontSize: 14, marginBottom: 8, alignItems: 'center', gap: 10 }}>
          {selected === o.value && (
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          )}
          <span style={{ color: selected === o.value ? 'var(--accent)' : 'var(--text-primary)', fontWeight: selected === o.value ? 600 : 400 }}>
            {o.label}
          </span>
        </motion.button>
      ))}
    </div>
  )
}

// Todo widget settings in the same bouncy accordion the global Settings screen
// uses — one section per concern, one open at a time.
function TodoWidgetSettings({ config, topics, updateConfig, t }) {
  const [openId, setOpenId] = useState(null)
  const topic = topics.find(tp => tp.id === config.topic_id)
  const sortMode = config.sort_mode ?? 'smart'
  const hideCompleted = config.hide_completed ?? false

  const items = [
    {
      id: 'filter',
      title: t('widget.todo.settings.filter'),
      summary: topic ? `${topic.emoji} ${topic.name}` : t('widget.todo.allTopics'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>,
      content: (
        <div style={{ paddingTop: 12 }}>
          <TopicPicker
            label={t('widget.todo.topicFilter')}
            selected={config.topic_id ?? null}
            topics={topics}
            noneLabel={t('widget.todo.allTopics')}
            onSelect={id => updateConfig('topic_id', id)}
          />
        </div>
      ),
    },
    {
      id: 'sort',
      title: t('widget.todo.settings.sort'),
      summary: t(`widget.todo.sort.${sortMode}`),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>,
      content: (
        <div style={{ paddingTop: 12 }}>
          <OptionPicker
            label={t('widget.todo.sort')}
            selected={sortMode}
            options={['smart', 'priority', 'due', 'created'].map(v => ({ value: v, label: t(`widget.todo.sort.${v}`) }))}
            onSelect={v => updateConfig('sort_mode', v)}
          />
        </div>
      ),
    },
    {
      id: 'display',
      title: t('widget.todo.settings.display'),
      summary: hideCompleted ? t('widget.todo.hideCompleted') : t('widget.todo.showCompleted'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>,
      content: (
        <div style={{ paddingTop: 12 }}>
          <ToggleRow
            label={t('widget.todo.hideCompleted')}
            hint={t('widget.todo.hideCompletedHint')}
            value={hideCompleted}
            onChange={v => updateConfig('hide_completed', v)}
          />
        </div>
      ),
    },
  ]

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{t('widget.settings')}</SectionLabel>
      <BouncyAccordion items={items} value={openId} onValueChange={setOpenId} />
    </div>
  )
}

// noneLabel: adds a leading "none" chip (selects null); tapping the active
// topic again also clears the selection.
function TopicPicker({ label, selected, topics, onSelect, noneLabel }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{label}</SectionLabel>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {noneLabel && (
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => onSelect(null)}
            style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11,
              border: `1.5px solid ${!selected ? 'var(--accent)' : 'var(--border)'}`,
              background: !selected ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
              color: 'var(--text-primary)', cursor: 'pointer', fontWeight: !selected ? 600 : 400,
            }}>
            {noneLabel}
          </motion.button>
        )}
        {topics.map(t => (
          <motion.button key={t.id} whileTap={{ scale: 0.94 }}
            onClick={() => onSelect(noneLabel && selected === t.id ? null : t.id)}
            style={{
              padding: '4px 8px', borderRadius: 20, fontSize: 11,
              border: `1.5px solid ${selected === t.id ? t.color_from : 'var(--border)'}`,
              background: selected === t.id ? `${t.color_from}18` : 'var(--bg-tertiary)',
              color: 'var(--text-primary)', cursor: 'pointer', fontWeight: selected === t.id ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
            <span style={{ fontSize: 12 }}>{t.emoji}</span> {t.name}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

const TIMEFRAME_OPTIONS = [
  { value: '7d',  label: '7 Tage' },
  { value: '14d', label: '14 Tage' },
  { value: '30d', label: '30 Tage' },
  { value: '90d', label: '90 Tage' },
]

function TimeframePicker({ selected, onSelect, t }) {
  const active = selected ?? '30d'
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{t('widget.timeframe')}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {TIMEFRAME_OPTIONS.map(o => (
          <motion.button key={o.value} whileTap={{ scale: 0.94 }} onClick={() => onSelect(o.value)}
            style={chipStyle(active === o.value)}>
            <div style={{ fontSize: 13, fontWeight: 600, color: active === o.value ? 'var(--accent)' : 'var(--text-primary)' }}>
              {t(`timeframe.${o.value}`)}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function MultiTopicPicker({ label, selected, topics, max, onToggle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>{label} · max. {max}</SectionLabel>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {topics.map(t => {
          const active = selected.includes(t.id)
          const disabled = !active && selected.length >= max
          return (
            <motion.button key={t.id} whileTap={{ scale: 0.94 }}
              onClick={() => { if (!disabled) onToggle(t.id) }}
              style={{
                padding: '4px 8px', borderRadius: 20, fontSize: 11,
                border: `1.5px solid ${active ? t.color_from : 'var(--border)'}`,
                background: active ? `${t.color_from}18` : 'var(--bg-tertiary)',
                color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
                cursor: disabled ? 'default' : 'pointer',
                fontWeight: active ? 600 : 400,
                opacity: disabled ? 0.45 : 1,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              <span style={{ fontSize: 12 }}>{t.emoji}</span> {t.name}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function chipStyle(active) {
  return {
    padding: '11px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
    border: `0.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
    transition: 'border-color 0.14s, background 0.14s',
  }
}

function rowChipStyle(active) {
  return {
    padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
    border: `0.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
    transition: 'border-color 0.14s, background 0.14s',
  }
}
