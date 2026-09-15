---
type: "query"
date: "2026-09-15T12:27:02.801568+00:00"
question: "good but it should be the whole background"
contributor: "graphify"
outcome: "useful"
source_nodes: ["TopicStatsScreen.jsx", "ThemeContext.jsx"]
---

# Q: good but it should be the whole background

## Answer

Expanded from the follow-up via graph vocab: [topic, theme, background, color]. Moved the black/white -> topic.color_from -> topic.color_to vertical gradient from the topic header to the TopicStatsScreen scroll-container so it spans the full topic detail background. Restored the header's translucent topic gradient. npm.cmd run build passes.

## Outcome

- Signal: useful

## Source Nodes

- TopicStatsScreen.jsx
- ThemeContext.jsx