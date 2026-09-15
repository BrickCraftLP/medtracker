// ─── Pride Theme Collection ────────────────────────────────────────────────
// Each theme is an *overlay* — only --navbar-bg. The overlay is merged on top
// of the light or dark base in resolveTheme() so every flag looks correct in
// both modes.
//
// make(lightGrad, darkGrad) returns { light, dark } variant objects.
// Light variants layer over rgba(255,255,255,0.72) — frosted white.
// Dark variants layer over rgba(28,28,30,0.85)    — frosted near-black.
//
// To add a new theme: add a make(...) entry, add it to themes/index.js, and
// add a label in i18n/en.js + de.js.
// ─────────────────────────────────────────────────────────────────────────────

const W = 'rgba(255,255,255,0.72)' // frosted white (light base)
const K = 'rgba(28, 28, 30, 0.85)' // frosted near-black (dark base)

function make(lightGrad, darkGrad) {
  return {
    light: { '--navbar-bg': lightGrad },
    dark:  { '--navbar-bg': darkGrad  },
  }
}

// Classic 6-stripe rainbow
export const prideAll = make(
  `linear-gradient(90deg, rgba(228,3,3,0.18) 0%, rgba(255,140,0,0.18) 20%, rgba(255,237,0,0.18) 37%, rgba(0,128,38,0.18) 53%, rgba(0,77,255,0.18) 70%, rgba(117,7,135,0.18) 100%), ${W}`,
  `linear-gradient(90deg, rgba(228,3,3,0.30) 0%, rgba(255,140,0,0.30) 20%, rgba(255,237,0,0.30) 37%, rgba(0,128,38,0.30) 53%, rgba(0,77,255,0.30) 70%, rgba(117,7,135,0.30) 100%), ${K}`
)

// Progress Pride — rainbow + black / brown / trans chevron
export const prideProg = make(
  `linear-gradient(90deg, rgba(0,0,0,0.22) 0%, rgba(120,79,23,0.22) 10%, rgba(85,205,252,0.20) 20%, rgba(247,168,184,0.20) 30%, rgba(228,3,3,0.20) 40%, rgba(255,140,0,0.20) 52%, rgba(255,237,0,0.20) 63%, rgba(0,128,38,0.20) 74%, rgba(0,77,255,0.20) 86%, rgba(117,7,135,0.20) 100%), ${W}`,
  `linear-gradient(90deg, rgba(80,50,10,0.45) 0%, rgba(120,79,23,0.38) 10%, rgba(85,205,252,0.32) 20%, rgba(247,168,184,0.32) 30%, rgba(228,3,3,0.32) 40%, rgba(255,140,0,0.32) 52%, rgba(255,237,0,0.32) 63%, rgba(0,128,38,0.32) 74%, rgba(0,77,255,0.32) 86%, rgba(117,7,135,0.32) 100%), ${K}`
)

// Gay men's (MLM) — teal → mint → white centre → lavender → purple
export const prideMlm = make(
  `linear-gradient(90deg, rgba(7,141,112,0.22) 0%, rgba(38,206,170,0.22) 18%, rgba(152,232,193,0.22) 34%, rgba(255,255,255,0) 50%, rgba(123,173,226,0.22) 66%, rgba(80,73,204,0.22) 82%, rgba(61,26,142,0.22) 100%), ${W}`,
  `linear-gradient(90deg, rgba(7,141,112,0.38) 0%, rgba(38,206,170,0.36) 18%, rgba(152,232,193,0.30) 34%, rgba(255,255,255,0.22) 50%, rgba(123,173,226,0.32) 66%, rgba(80,73,204,0.36) 82%, rgba(61,26,142,0.40) 100%), ${K}`
)

// Lesbian sunset — dark orange → light orange → white → pink → deep pink
export const prideWlw = make(
  `linear-gradient(90deg, rgba(214,41,0,0.22) 0%, rgba(255,155,85,0.22) 25%, rgba(255,255,255,0) 50%, rgba(212,98,166,0.22) 75%, rgba(165,0,98,0.22) 100%), ${W}`,
  `linear-gradient(90deg, rgba(214,41,0,0.38) 0%, rgba(255,155,85,0.34) 25%, rgba(255,255,255,0.22) 50%, rgba(212,98,166,0.34) 75%, rgba(165,0,98,0.38) 100%), ${K}`
)

// Bisexual — pink → purple → blue
export const prideBi = make(
  `linear-gradient(90deg, rgba(214,2,112,0.28) 0%, rgba(214,2,112,0.28) 30%, rgba(155,79,150,0.30) 50%, rgba(0,56,168,0.28) 70%, rgba(0,56,168,0.28) 100%), ${W}`,
  `linear-gradient(90deg, rgba(214,2,112,0.42) 0%, rgba(214,2,112,0.42) 30%, rgba(155,79,150,0.44) 50%, rgba(0,56,168,0.42) 70%, rgba(0,56,168,0.42) 100%), ${K}`
)

// Pansexual — hot pink → golden yellow → cyan
export const pridePan = make(
  `linear-gradient(90deg, rgba(255,33,140,0.25) 0%, rgba(255,216,0,0.27) 50%, rgba(33,177,255,0.25) 100%), ${W}`,
  `linear-gradient(90deg, rgba(255,33,140,0.40) 0%, rgba(255,216,0,0.42) 50%, rgba(33,177,255,0.40) 100%), ${K}`
)

// Transgender — sky blue → pastel pink → white → pastel pink → sky blue
export const prideTrans = make(
  `linear-gradient(90deg, rgba(85,205,252,0.28) 0%, rgba(247,168,184,0.28) 28%, rgba(255,255,255,0) 50%, rgba(247,168,184,0.28) 72%, rgba(85,205,252,0.28) 100%), ${W}`,
  `linear-gradient(90deg, rgba(85,205,252,0.42) 0%, rgba(247,168,184,0.38) 28%, rgba(255,255,255,0.22) 50%, rgba(247,168,184,0.38) 72%, rgba(85,205,252,0.42) 100%), ${K}`
)

// Non-Binary — yellow → white → purple → charcoal
export const prideNb = make(
  `linear-gradient(90deg, rgba(252,244,49,0.32) 0%, rgba(255,255,255,0) 33%, rgba(156,89,209,0.28) 66%, rgba(44,44,44,0.25) 100%), ${W}`,
  `linear-gradient(90deg, rgba(252,244,49,0.48) 0%, rgba(255,255,255,0.22) 33%, rgba(156,89,209,0.42) 66%, rgba(160,160,180,0.28) 100%), ${K}`
)

// Asexual — black → grey → white → deep purple
export const prideAce = make(
  `linear-gradient(90deg, rgba(0,0,0,0.25) 0%, rgba(164,164,164,0.22) 33%, rgba(255,255,255,0) 58%, rgba(129,0,129,0.28) 100%), ${W}`,
  `linear-gradient(90deg, rgba(80,80,90,0.45) 0%, rgba(164,164,164,0.30) 33%, rgba(255,255,255,0.22) 58%, rgba(129,0,129,0.44) 100%), ${K}`
)

// Aromantic — dark green → light green → white → deep forest green
export const prideAro = make(
  `linear-gradient(90deg, rgba(58,130,50,0.28) 0%, rgba(168,211,121,0.25) 33%, rgba(255,255,255,0) 56%, rgba(27,94,32,0.28) 100%), ${W}`,
  `linear-gradient(90deg, rgba(58,130,50,0.44) 0%, rgba(168,211,121,0.36) 33%, rgba(255,255,255,0.22) 56%, rgba(27,94,32,0.44) 100%), ${K}`
)

// Agender — black → grey → white → light green → black
export const prideAg = make(
  `linear-gradient(90deg, rgba(0,0,0,0.25) 0%, rgba(185,185,185,0.20) 22%, rgba(255,255,255,0) 44%, rgba(184,244,131,0.28) 72%, rgba(0,0,0,0.22) 100%), ${W}`,
  `linear-gradient(90deg, rgba(80,80,90,0.45) 0%, rgba(185,185,185,0.28) 22%, rgba(255,255,255,0.22) 44%, rgba(184,244,131,0.44) 72%, rgba(80,80,90,0.40) 100%), ${K}`
)

// Genderfluid — pink → white → purple → black → blue
export const prideGf = make(
  `linear-gradient(90deg, rgba(255,118,164,0.28) 0%, rgba(255,255,255,0) 25%, rgba(190,0,255,0.28) 50%, rgba(0,0,0,0.22) 75%, rgba(51,51,188,0.28) 100%), ${W}`,
  `linear-gradient(90deg, rgba(255,118,164,0.44) 0%, rgba(255,255,255,0.22) 25%, rgba(190,0,255,0.44) 50%, rgba(80,80,100,0.40) 75%, rgba(51,51,188,0.44) 100%), ${K}`
)

// Intersex — bright yellow → light yellow → rich purple
export const prideIs = make(
  `linear-gradient(90deg, rgba(255,216,0,0.32) 0%, rgba(255,235,100,0.25) 50%, rgba(121,2,170,0.28) 100%), ${W}`,
  `linear-gradient(90deg, rgba(255,216,0,0.48) 0%, rgba(255,235,100,0.38) 50%, rgba(121,2,170,0.44) 100%), ${K}`
)

// Demiboy — dark grey → light grey → pastel blue → white
export const prideDemiboy = make(
  `linear-gradient(90deg, rgba(100,100,100,0.28) 0%, rgba(196,196,196,0.22) 33%, rgba(155,203,235,0.28) 66%, rgba(255,255,255,0) 100%), ${W}`,
  `linear-gradient(90deg, rgba(120,120,130,0.44) 0%, rgba(196,196,196,0.32) 33%, rgba(155,203,235,0.42) 66%, rgba(255,255,255,0.22) 100%), ${K}`
)

// Demigirl — dark grey → light grey → pastel pink → white
export const prideDemigirl = make(
  `linear-gradient(90deg, rgba(100,100,100,0.28) 0%, rgba(196,196,196,0.22) 33%, rgba(254,189,214,0.28) 66%, rgba(255,255,255,0) 100%), ${W}`,
  `linear-gradient(90deg, rgba(120,120,130,0.44) 0%, rgba(196,196,196,0.32) 33%, rgba(254,189,214,0.42) 66%, rgba(255,255,255,0.22) 100%), ${K}`
)

// Genderqueer — lavender purple → white → green
export const prideGq = make(
  `linear-gradient(90deg, rgba(181,126,220,0.28) 0%, rgba(255,255,255,0) 50%, rgba(73,128,38,0.28) 100%), ${W}`,
  `linear-gradient(90deg, rgba(181,126,220,0.44) 0%, rgba(255,255,255,0.22) 50%, rgba(73,128,38,0.44) 100%), ${K}`
)

// Polysexual — magenta → bright green → royal blue
export const pridePoly = make(
  `linear-gradient(90deg, rgba(246,28,185,0.25) 0%, rgba(7,213,105,0.25) 50%, rgba(11,95,220,0.25) 100%), ${W}`,
  `linear-gradient(90deg, rgba(246,28,185,0.40) 0%, rgba(7,213,105,0.40) 50%, rgba(11,95,220,0.40) 100%), ${K}`
)

// Omnisexual — pink → purple → indigo → light blue
export const prideOmni = make(
  `linear-gradient(90deg, rgba(255,118,164,0.25) 0%, rgba(180,80,255,0.25) 33%, rgba(75,0,130,0.28) 66%, rgba(135,206,250,0.25) 100%), ${W}`,
  `linear-gradient(90deg, rgba(255,118,164,0.40) 0%, rgba(180,80,255,0.40) 33%, rgba(75,0,130,0.44) 66%, rgba(135,206,250,0.40) 100%), ${K}`
)

// Demisexual — black → grey → white → purple
export const prideDemi = make(
  `linear-gradient(90deg, rgba(0,0,0,0.25) 0%, rgba(164,164,164,0.20) 28%, rgba(255,255,255,0) 55%, rgba(128,0,128,0.28) 100%), ${W}`,
  `linear-gradient(90deg, rgba(80,80,90,0.45) 0%, rgba(164,164,164,0.30) 28%, rgba(255,255,255,0.22) 55%, rgba(128,0,128,0.44) 100%), ${K}`
)
