---
type: "query"
date: "2026-09-15T12:28:42.088025+00:00"
question: "its not a linear gradient that starts from deep p-black on top"
contributor: "graphify"
outcome: "corrected"
correction: "Use a single full-page linear gradient and keep the topic header transparent so the deep black/white top remains visible."
source_nodes: ["TopicStatsScreen.jsx", "ThemeContext.jsx"]
---

# Q: its not a linear gradient that starts from deep p-black on top

## Answer

Expanded via graph vocab: [topic, theme, background, color, screen]. The full-page gradient was being visually covered by the topic header's separate colored gradient. Made the header transparent and kept one uninterrupted vertical page gradient with pure black (or white) held through 12%, then topic.color_from at 52%, then topic.color_to at 100%. Build passes.

## Outcome

- Signal: corrected
- Correction: Use a single full-page linear gradient and keep the topic header transparent so the deep black/white top remains visible.

## Source Nodes

- TopicStatsScreen.jsx
- ThemeContext.jsx