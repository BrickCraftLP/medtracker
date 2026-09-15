import { createContext, useContext } from 'react'

// Lets any nested component kick off the full-screen "white circle" reveal
// transition (see CircleRevealOverlay.jsx) without needing to know where the
// overlay actually lives in the tree.
export const CircleRevealContext = createContext({ triggerReveal: () => {} })

export function useCircleReveal() {
  return useContext(CircleRevealContext)
}
