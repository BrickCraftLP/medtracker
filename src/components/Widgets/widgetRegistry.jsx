import { lazy, Suspense } from 'react'
import HeatmapDayTrackerWidget from './Types/HeatmapDayTrackerWidget.jsx'
import QuickLaunchWidget from './Types/QuickLaunchWidget.jsx'
import TopicAccuracyWidget from './Types/TopicAccuracyWidget.jsx'
import MultiDisplayWidget from './Core/MultiDisplayWidget.jsx'
import LernScoreWidget from './Types/LernScoreWidget.jsx'
import StatNumberWidget from './Types/StatNumberWidget.jsx'

// Widgets carrying heavy dependencies (recharts, date-fns) are split out so a
// dashboard that doesn't use them never pays for them on first paint.
const HeatmapIntensityWidget = lazy(() => import('./Types/HeatmapIntensityWidget.jsx'))
const GraphViewWidget = lazy(() => import('./Types/GraphViewWidget.jsx'))
const TodoListWidget = lazy(() => import('./Types/TodoListWidget.jsx'))
const TopicStatsWidget = lazy(() => import('./Types/TopicStatsWidget.jsx'))
const TopicAccuracyGraphWidget = lazy(() => import('./Types/TopicAccuracyGraphWidget.jsx'))

export const WIDGET_COMPONENTS = {
  heatmap_intensity: HeatmapIntensityWidget,
  heatmap_tracker: HeatmapDayTrackerWidget,
  graph_view: GraphViewWidget,
  todo_list: TodoListWidget,
  quick_launch: QuickLaunchWidget,
  topic_stats: TopicStatsWidget,
  topic_accuracy: TopicAccuracyWidget,
  topic_accuracy_graph: TopicAccuracyGraphWidget,
  multi_display: MultiDisplayWidget,
  lern_score: LernScoreWidget,
  stat_number: StatNumberWidget,
}

export function renderWidgetContent(widgetConfig, size) {
  const Component = WIDGET_COMPONENTS[widgetConfig?.widget_type]
  if (!Component) return null
  return (
    <Suspense fallback={null}>
      <Component
        config={widgetConfig?.config ?? {}}
        subWidgets={widgetConfig?.sub_widgets ?? []}
        size={size ?? widgetConfig?.size ?? 'medium'}
      />
    </Suspense>
  )
}
