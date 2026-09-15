---
type: "query"
date: "2026-09-15T12:25:21.574365+00:00"
question: "when in a topic make the gradient start with black (when on darkmode or white when in white mode) and then have the gradient begin of the topic as it is now from top to bottom. meaning three colour gradient bnlack/white, gradientcolourtopic 1, gradientolourtopic 2"
contributor: "graphify"
outcome: "useful"
source_nodes: ["TopicStatsScreen()", "ThemeContext.jsx"]
---

# Q: when in a topic make the gradient start with black (when on darkmode or white when in white mode) and then have the gradient begin of the topic as it is now from top to bottom. meaning three colour gradient bnlack/white, gradientcolourtopic 1, gradientolourtopic 2

## Answer

Expanded from original query via graph vocab: [topic, topics, theme, dark, light, color]. Updated TopicStatsScreen header to use a vertical three-stop gradient: black in dark mode or white in light mode, then topic.color_from, then topic.color_to. Added useTheme so the first stop follows the active mode. npm.cmd run build passes.

## Outcome

- Signal: useful

## Source Nodes

- TopicStatsScreen()
- ThemeContext.jsx