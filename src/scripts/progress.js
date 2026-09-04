/**
 * Reading-progress hairline across the top of the sticky header.
 *
 * Driven by a scroll-linked animation where the browser supports one, so the
 * bar is composited off the main thread and costs nothing during scroll. The
 * fallback is a passive scroll listener that only ever writes one custom
 * property, and never reads layout inside the handler.
 */

const supportsTimeline =
  typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')

export function initProgress() {
  const bar = document.querySelector('[data-progress]')
  if (!bar) return

  if (supportsTimeline) {
    // The CSS in chrome.css already carries the scroll-timeline animation;
    // flagging it here keeps the fallback below from also running.
    bar.dataset.progressMode = 'timeline'
    return
  }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  let ticking = false
  const write = () => {
    ticking = false
    const doc = document.documentElement
    const max = doc.scrollHeight - innerHeight
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0
    bar.style.setProperty('--progress', p.toFixed(4))
  }

  addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(write)
  }, { passive: true })

  addEventListener('resize', write, { passive: true })
  write()
}
