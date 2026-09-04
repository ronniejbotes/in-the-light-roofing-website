/**
 * Trustindex hand-off.
 *
 * The reviews slot ships with the site's own review cards rendered into it, so
 * the section is never an empty box -- not on first paint, and not at all if
 * the third-party script is blocked or slow. When the widget does mount and
 * put something in its container, our cards step aside.
 */

export function initReviews() {
  const fallbacks = document.querySelectorAll('[data-reviews-fallback]')
  if (!fallbacks.length) return

  for (const fallback of fallbacks) {
    const slot = fallback.previousElementSibling?.querySelector?.('.ti-widget')
      || document.querySelector('.ti-widget')
    if (!slot || !('MutationObserver' in window)) continue

    const settle = () => {
      // Trustindex builds its markup in stages; wait for something with real
      // height rather than for the first stray node it appends.
      if (slot.offsetHeight < 80) return false
      fallback.hidden = true
      return true
    }

    if (settle()) continue

    const mo = new MutationObserver(() => { if (settle()) mo.disconnect() })
    mo.observe(slot, { childList: true, subtree: true })

    // The widget either arrives or it does not; stop watching either way so
    // the observer is not left attached for the life of the page.
    setTimeout(() => mo.disconnect(), 20000)
  }
}
