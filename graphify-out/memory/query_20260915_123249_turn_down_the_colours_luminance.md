---
type: "query"
date: "2026-09-15T12:32:49.469164+00:00"
question: "turn down the colours luminance"
contributor: "graphify"
outcome: "useful"
source_nodes: ["TopicStatsScreen.jsx"]
---

# Q: turn down the colours luminance

## Answer

Expanded via graph vocab: [topic, background, color, screen]. Lowered TopicStatsScreen gradient luminance by reducing each topic hue contribution from 30% to 24% and replacing the blend neutrals with #141416 in dark mode and #8E8E93 in light mode. The gradient remains viewport-fixed. Build passes.

## Outcome

- Signal: useful

## Source Nodes

- TopicStatsScreen.jsx