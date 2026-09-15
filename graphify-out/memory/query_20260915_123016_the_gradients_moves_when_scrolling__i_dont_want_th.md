---
type: "query"
date: "2026-09-15T12:30:16.688148+00:00"
question: "the gradients moves when scrolling. i dont want that. and make the saturation way less"
contributor: "graphify"
outcome: "useful"
source_nodes: ["TopicStatsScreen.jsx"]
---

# Q: the gradients moves when scrolling. i dont want that. and make the saturation way less

## Answer

Expanded via graph vocab: [topic, background, color, screen]. Changed TopicStatsScreen's page gradient from backgroundAttachment local to fixed and sized it to 100vw by 100vh, so it remains pinned while content scrolls. Muted both topic gradient colors to 30% by mixing them with theme-neutral gray. Build passes.

## Outcome

- Signal: useful

## Source Nodes

- TopicStatsScreen.jsx