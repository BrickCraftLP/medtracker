// Grades across a semester, in exam-date order, with the target as a
// reference line. Lazy-loaded: recharts is a 100 KB gzip chunk and most visits
// to the exams page never expand a semester that has two graded exams in it.

import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Cell, Tooltip,
} from 'recharts'
import { gradeValue, hasPassed } from '../../utils/calculations/examCalcs.js'

export default function GradeChart({ exams, scheme, target }) {
  const data = exams
    .map(exam => ({
      name: exam.title,
      short: exam.title.length > 10 ? `${exam.title.slice(0, 9)}…` : exam.title,
      value: gradeValue(exam, scheme),
      passed: hasPassed(exam, scheme),
      date: exam.exam_date,
    }))
    .filter(d => d.value != null)
    .sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1))

  if (data.length < 2) return null

  return (
    <div style={{ height: 150, marginBottom: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -22 }}>
          <XAxis
            dataKey="short" tick={{ fontSize: 9.5, fill: 'var(--text-tertiary)' }}
            axisLine={false} tickLine={false} interval={0}
          />
          <YAxis
            domain={scheme.lowerIsBetter ? [scheme.min, scheme.max] : [0, 100]}
            // A lower-is-better scale has to be drawn upside down, or a 1.0
            // looks like the worst result on the chart.
            reversed={scheme.lowerIsBetter}
            tick={{ fontSize: 9.5, fill: 'var(--text-tertiary)' }}
            axisLine={false} tickLine={false} width={38}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent-muted)' }}
            formatter={value => [scheme.lowerIsBetter ? Number(value).toFixed(1) : `${Math.round(value)}%`, '']}
            labelFormatter={(_l, payload) => payload?.[0]?.payload?.name ?? ''}
          />
          {target != null && (
            <ReferenceLine
              y={Number(target)} stroke="var(--accent)" strokeDasharray="4 4" strokeWidth={1.5}
            />
          )}
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={34}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.passed === false ? 'var(--wrong)' : 'var(--correct)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
