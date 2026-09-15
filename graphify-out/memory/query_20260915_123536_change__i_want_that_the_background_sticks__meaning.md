---
type: "query"
date: "2026-09-15T12:35:36.346897+00:00"
question: "change. i want that the background sticks, meaning it somehow moves when scrolling to give the illusion that the whole page has one gradient so the black/white is fixed at the bottom and the topicgradientcolour2 is fixed to the bottom of the page and th other colour is in between"
contributor: "graphify"
outcome: "corrected"
correction: "Anchor the gradient to the full scrollable document height, not the viewport; top is black/white, color 1 is intermediate, and color 2 is at the document bottom."
source_nodes: ["TopicStatsScreen.jsx"]
---

# Q: change. i want that the background sticks, meaning it somehow moves when scrolling to give the illusion that the whole page has one gradient so the black/white is fixed at the bottom and the topicgradientcolour2 is fixed to the bottom of the page and th other colour is in between

## Answer

Expanded via graph vocab: [topic, background, screen]. Replaced the viewport-fixed gradient with a single gradient painted on a content-sized inner layer. It now spans the entire scrollable topic document: black/white at the page top, muted topic color 1 in the middle, and muted topic color 2 at the actual page bottom. Scrolling reveals successive parts of the same gradient without repeating it. Build passes.

## Outcome

- Signal: corrected
- Correction: Anchor the gradient to the full scrollable document height, not the viewport; top is black/white, color 1 is intermediate, and color 2 is at the document bottom.

## Source Nodes

- TopicStatsScreen.jsx