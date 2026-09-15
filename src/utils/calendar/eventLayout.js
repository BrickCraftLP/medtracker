// Side-by-side placement for overlapping events, the way Apple and Google
// Calendar do it.
//
// Two passes:
//   1. split a day's timed occurrences into clusters of transitively
//      overlapping events — a cluster shares a horizontal budget of 1.0;
//   2. inside a cluster give each event the leftmost column whose previous
//      occupant has already ended, then let it expand rightwards into columns
//      that stay free for its whole duration (so a lone long event next to two
//      short ones still uses the width the short ones leave behind).
//
// Returns fractional left/width in 0..1: the grid multiplies by its own
// measured column width, so nothing here depends on pixels.

// A five-minute event still has to be tappable.
const MIN_MINUTES = 20

export function layoutDay(occurrences) {
  const items = occurrences
    .map(o => ({ ...o, _end: Math.max(o.endMin, o.startMin + MIN_MINUTES) }))
    .sort((a, b) => a.startMin - b.startMin || b._end - a._end)

  const out = []
  let cluster = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length) out.push(...pack(cluster))
    cluster = []
    clusterEnd = -Infinity
  }

  for (const item of items) {
    if (item.startMin >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item._end)
  }
  flush()
  return out
}

const overlaps = (a, b) => a.startMin < b._end && a._end > b.startMin

function pack(cluster) {
  // colLast[i] is the last event placed in column i.
  const colLast = []
  for (const item of cluster) {
    let col = colLast.findIndex(last => last._end <= item.startMin)
    if (col === -1) { col = colLast.length; colLast.push(item) }
    else colLast[col] = item
    item._col = col
  }

  const columns = colLast.length
  for (const item of cluster) {
    let span = 1
    while (
      item._col + span < columns &&
      !cluster.some(o => o !== item && o._col === item._col + span && overlaps(item, o))
    ) span++
    item.left = item._col / columns
    item.width = span / columns
  }
  return cluster
}
