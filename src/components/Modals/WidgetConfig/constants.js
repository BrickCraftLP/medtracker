export const WIDGET_TYPES = [
  'heatmap_intensity',
  'heatmap_tracker',
  'graph_view',
  'todo_list',
  'quick_launch',
  'topic_stats',
  'topic_accuracy',
  'topic_accuracy_graph',
  'multi_display',
  'lern_score',
  'stat_number',
]

export const SUB_WIDGET_TYPES = WIDGET_TYPES.filter(type => type !== 'multi_display')
export const MAX_SUB_WIDGETS = 3

export const SIZES = ['small', 'medium', 'large']
export const TIMEFRAMES = ['7d', '14d', '30d', '90d']

export const HEATMAP_PRESETS = { blue: '#3b82f6', green: '#22c55e', purple: '#8b5cf6' }
export const DEFAULT_COLOR = '#3b82f6'

// liquid-glass-react renders its glass as a stack of sibling layers, each
// centred with top/left 50% + translate(-50%, -50%). They only line up when
// absolutely positioned inside a sized, relatively positioned frame.
export const GLASS_CENTERED = { position: 'absolute', top: '50%', left: '50%' }
