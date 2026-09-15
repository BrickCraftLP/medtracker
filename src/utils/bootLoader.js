// Dismisses the inline #boot-loader declared in index.html.
//
// The loader is the single spinner that owns the whole boot: every React gate
// that used to paint its own opaque background div now renders transparent, so
// this overlay stays on screen continuously until a component with real
// content calls hideBootLoader(). main.jsx also arms a failsafe so a hung gate
// can never trap the user behind it.

let hidden = false

export function hideBootLoader() {
  if (hidden) return
  hidden = true
  const el = document.getElementById('boot-loader')
  if (!el) return
  // Wait for the frame that actually paints the content underneath, otherwise
  // the fade starts against a still-empty screen.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('boot-loader-hide')
      setTimeout(() => el.remove(), 220)
    })
  })
}
