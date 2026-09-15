import { useState } from 'react'
import { useData } from '../../../context/DataContext.jsx'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { useGraphSettings } from '../../../context/GraphSettingsContext.jsx'
import { getHeatmapColors } from '../../../utils/calculations/heatmapIntensityCalcs.js'
import { TIMEFRAMES, HEATMAP_PRESETS, DEFAULT_COLOR } from './constants.js'
import { ICON_GEAR, ICON_FILTER, ICON_SORT, ICON_EYE, ICON_PALETTE, ICON_HEATMAP } from './icons.jsx'
import {
  Field, SettingsAccordion, ChipGrid, OptionPicker, ToggleRow, Pill,
  TopicPicker, MultiTopicPicker, ColorField, ColorRamp, Swatch,
} from './controls.jsx'

// Settings for one widget. Used for top-level widgets and — with `compact` —
// for sub-widgets inside a multi-display, which expose a reduced set.
// onChange(key, value) must merge into the latest config (functional update).
export default function WidgetFields({ type, config, size, onChange, compact = false }) {
  const { topics } = useData()
  const { t } = useLanguage()

  if (!compact) {
    if (type === 'todo_list') return <TodoFields config={config} topics={topics} onChange={onChange} />
    if (type === 'heatmap_intensity') return <HeatmapFields config={config} onChange={onChange} />
    if (type === 'heatmap_tracker') return <TrackerFields config={config} topics={topics} onChange={onChange} />
  }

  const fields = basicFields({ type, config, size, onChange, compact, topics, t })
  if (!fields) return null

  return (
    <SettingsAccordion
      defaultOpen="settings"
      items={[{
        id: 'settings',
        title: t('widget.settings'),
        icon: ICON_GEAR,
        content: <div className="wc-accordion-body">{fields}</div>,
      }]}
    />
  )
}

function topicLimit(type, size, compact) {
  if (type === 'topic_accuracy_graph') return compact || size === 'small' ? 4 : 8
  if (compact) return size === 'large' ? 6 : size === 'medium' ? 4 : 2
  return size === 'large' ? 6 : 3
}

function basicFields({ type, config, size, onChange, compact, topics, t }) {
  const set = key => value => onChange(key, value)

  const topicPicker = (
    <TopicPicker label={t('widget.topic')} value={config.topic_id} topics={topics} onChange={set('topic_id')} />
  )
  const multiTopicPicker = (
    <MultiTopicPicker label={t('widget.topics')} value={config.topic_ids ?? []} topics={topics}
      max={topicLimit(type, size, compact)} onChange={set('topic_ids')} />
  )
  const timeframe = <TimeframeField value={config.timeframe} onChange={set('timeframe')} />
  const showWeights = (
    <ToggleRow label={t('widget.showWeights')} hint={t('widget.showWeightsHint')}
      value={config.show_weights ?? false} onChange={set('show_weights')} />
  )

  switch (type) {
    case 'quick_launch':
    case 'topic_stats':
      return topicPicker

    case 'topic_accuracy':
      return <>{multiTopicPicker}{showWeights}</>

    case 'topic_accuracy_graph':
      return <>{multiTopicPicker}{timeframe}</>

    case 'stat_number':
      return (
        <>
          <OptionPicker label={t('widget.metric')} value={config.metric ?? 'accuracy'} onChange={set('metric')}
            options={[
              { value: 'accuracy', label: t('widget.graph.accuracyAll') },
              { value: 'weighted', label: t('stats.weightedAvg') },
            ]} />
          {timeframe}
        </>
      )

    case 'graph_view': {
      const mode = config.graph_mode
      return (
        <>
          <OptionPicker label={t('widget.display')} value={mode} onChange={set('graph_mode')}
            options={[
              { value: 'accuracy_all', label: t('widget.graph.accuracyAll') },
              { value: 'exercises_all', label: t('widget.graph.exercisesAll') },
              { value: 'accuracy_per_topic', label: t(compact ? 'widget.graph.accuracyTopicSub' : 'widget.graph.accuracyTopic') },
            ]} />
          {mode === 'accuracy_per_topic' && topicPicker}
          {!compact && mode === 'accuracy_per_topic' && !config.topic_id && showWeights}
          {!compact && (mode == null || mode === 'accuracy_all') && (
            <>
              <ToggleRow label={t('widget.showAccuracy')} hint={t('widget.showAccuracyHint')}
                value={config.show_accuracy ?? true} onChange={set('show_accuracy')} />
              <ToggleRow label={t('widget.showWeighted')} hint={t('widget.showWeightedHint')}
                value={config.show_weighted ?? false} onChange={set('show_weighted')} />
            </>
          )}
          {!compact && timeframe}
        </>
      )
    }

    default:
      return null
  }
}

function TimeframeField({ value, onChange }) {
  const { t } = useLanguage()
  return (
    <Field label={t('widget.timeframe')}>
      <ChipGrid columns={4} value={value ?? '30d'} onChange={onChange}
        options={TIMEFRAMES.map(v => ({ value: v, label: t(`timeframe.${v}`) }))} />
    </Field>
  )
}

// ── Heatmap intensity: preset theme or custom color, per widget; unset falls
// back to the global heatmap theme. ─────────────────────────────────────────
function HeatmapFields({ config, onChange }) {
  const { t } = useLanguage()
  const { heatmapTheme, heatmapCustomColor } = useGraphSettings()
  const [open, setOpen] = useState('theme')
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const theme = config.heatmap_theme ?? heatmapTheme
  const customColor = config.heatmap_custom_color ?? heatmapCustomColor ?? DEFAULT_COLOR

  function pickTheme(key) {
    onChange('heatmap_theme', key)
    if (key === 'custom') setOpen('custom')
  }

  function setCustomColor(hex) {
    onChange('heatmap_custom_color', hex)
    if (theme !== 'custom') onChange('heatmap_theme', 'custom')
  }

  const themes = [...Object.entries(HEATMAP_PRESETS), ['custom', customColor]]

  const items = [
    {
      id: 'theme',
      title: t('settings.heatmapTheme'),
      summary: t(`settings.theme.${theme}`),
      icon: ICON_HEATMAP,
      content: (
        <div className="wc-stack">
          <div className="wc-swatches">
            {themes.map(([key, color]) => (
              <Swatch key={key} color={color} label={t(`settings.theme.${key}`)}
                active={theme === key} onClick={() => pickTheme(key)} />
            ))}
          </div>
          <ColorRamp colors={getHeatmapColors(theme, customColor, isDark)} />
        </div>
      ),
    },
    {
      id: 'custom',
      title: t('settings.heatmapCustomColor'),
      summary: customColor.toUpperCase(),
      icon: ICON_PALETTE,
      content: (
        <div className="wc-stack">
          <p className="wc-hint">{t('settings.heatmapCustomHint')}</p>
          <ColorField color={customColor} onChange={setCustomColor} height={200} />
          <ColorRamp colors={getHeatmapColors('custom', customColor, isDark)} />
        </div>
      ),
    },
  ]

  return <SettingsAccordion label={t('widget.settings')} items={items} open={open} onOpenChange={setOpen} />
}

// ── Streak tracker: tracking mode (+ topic) and streak color. ──────────────
function TrackerFields({ config, topics, onChange }) {
  const { t } = useLanguage()
  const mode = config.tracker_mode ?? 'any'
  const topic = mode === 'topic' ? topics.find(tp => tp.id === config.topic_id) : null
  const color = config.tracker_color ?? null

  const items = [
    {
      id: 'mode',
      title: t('widget.mode'),
      summary: mode === 'topic' ? (topic?.name ?? t('widget.tracker.topic')) : t(`widget.tracker.${mode}`),
      icon: ICON_FILTER,
      content: (
        <div className="wc-accordion-body">
          <OptionPicker label={t('widget.mode')} value={mode} onChange={v => onChange('tracker_mode', v)}
            options={['any', 'all', 'topic'].map(v => ({ value: v, label: t(`widget.tracker.${v}`) }))} />
          {mode === 'topic' && (
            <TopicPicker label={t('widget.topic')} value={config.topic_id} topics={topics}
              onChange={id => onChange('topic_id', id)} />
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
        <div className="wc-stack">
          <div className="wc-pills">
            <Pill active={color == null} onClick={() => onChange('tracker_color', null)}>
              {t('widget.tracker.colorAuto')}
            </Pill>
          </div>
          <ColorField color={color ?? DEFAULT_COLOR} swatch={color ?? 'var(--accent)'} dimmed={color == null}
            height={180} onChange={c => onChange('tracker_color', c)} />
        </div>
      ),
    },
  ]

  return <SettingsAccordion label={t('widget.settings')} items={items} defaultOpen="mode" />
}

// ── To-do list: topic filter, sorting, completed visibility. ───────────────
function TodoFields({ config, topics, onChange }) {
  const { t } = useLanguage()
  const topic = topics.find(tp => tp.id === config.topic_id)
  const sortMode = config.sort_mode ?? 'smart'
  const hideCompleted = config.hide_completed ?? false

  const items = [
    {
      id: 'filter',
      title: t('widget.todo.settings.filter'),
      summary: topic ? `${topic.emoji} ${topic.name}` : t('widget.todo.allTopics'),
      icon: ICON_FILTER,
      content: (
        <div className="wc-accordion-body">
          <TopicPicker label={t('widget.todo.topicFilter')} value={config.topic_id ?? null} topics={topics}
            noneLabel={t('widget.todo.allTopics')} onChange={id => onChange('topic_id', id)} />
        </div>
      ),
    },
    {
      id: 'sort',
      title: t('widget.todo.settings.sort'),
      summary: t(`widget.todo.sort.${sortMode}`),
      icon: ICON_SORT,
      content: (
        <div className="wc-accordion-body">
          <OptionPicker label={t('widget.todo.sort')} value={sortMode} onChange={v => onChange('sort_mode', v)}
            options={['smart', 'priority', 'due', 'created'].map(v => ({ value: v, label: t(`widget.todo.sort.${v}`) }))} />
        </div>
      ),
    },
    {
      id: 'display',
      title: t('widget.todo.settings.display'),
      summary: t(hideCompleted ? 'widget.todo.hideCompleted' : 'widget.todo.showCompleted'),
      icon: ICON_EYE,
      content: (
        <div className="wc-accordion-body">
          <ToggleRow label={t('widget.todo.hideCompleted')} hint={t('widget.todo.hideCompletedHint')}
            value={hideCompleted} onChange={v => onChange('hide_completed', v)} />
        </div>
      ),
    },
  ]

  return <SettingsAccordion label={t('widget.settings')} items={items} />
}
