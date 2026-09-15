// Module-level flag: set true while a todo item — or any other row that
// drags, e.g. the settings tab-order list — is being dragged, so the parent
// tab-swipe handler can ignore the gesture.
export const todoSwipeActive = { current: false }
