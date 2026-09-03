/**
 * FAQ accordion.
 *
 * Panels are open in the markup (details-like semantics via aria-expanded) and
 * closed here on boot, so the answers are present for crawlers and for anyone
 * without JS.
 */

export function initAccordion() {
  const items = document.querySelectorAll('.accordion__item')
  if (!items.length) return

  for (const item of items) {
    const btn = item.querySelector('.accordion__btn')
    const panel = item.querySelector('.accordion__panel')
    if (!btn || !panel) continue

    // Start closed unless the author marked it open.
    const startOpen = item.hasAttribute('data-open')
    item.classList.toggle('is-open', startOpen)
    btn.setAttribute('aria-expanded', String(startOpen))

    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true'
      btn.setAttribute('aria-expanded', String(!open))
      item.classList.toggle('is-open', !open)
    })
  }
}
