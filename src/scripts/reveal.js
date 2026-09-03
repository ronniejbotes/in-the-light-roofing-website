/**
 * Scroll reveal.
 *
 * Content ships visible. We only add the `js-reveal` class -- which is what
 * actually hides [data-reveal] elements -- once we know JS is running and the
 * visitor has not asked for reduced motion. That way a script failure or a
 * motion preference can never leave the page blank.
 */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)')

export function initReveal() {
  const targets = document.querySelectorAll('[data-reveal]')
  if (!targets.length) return

  if (REDUCED.matches || !('IntersectionObserver' in window)) return

  document.documentElement.classList.add('js-reveal')

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-in')
        io.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  )

  for (const el of targets) {
    // Anything already on screen at load reveals immediately -- no flash, and
    // above-the-fold content is never gated behind a scroll.
    const box = el.getBoundingClientRect()
    if (box.top < innerHeight * 0.92 && box.bottom > 0) {
      el.classList.add('is-in')
    } else {
      io.observe(el)
    }
  }

  // If the visitor turns reduced motion on mid-session, drop the whole effect.
  REDUCED.addEventListener?.('change', (e) => {
    if (!e.matches) return
    io.disconnect()
    document.documentElement.classList.remove('js-reveal')
  })
}
