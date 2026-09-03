/**
 * Third-party tag loader.
 *
 * The WordPress site shipped these tags with LiteSpeed's `litespeed/javascript`
 * type, which holds them back until the visitor interacts. Loading them
 * normally would put ~2.6 MB of third-party JavaScript on every page load --
 * the chat widget alone is about 1.6 MB.
 *
 * So each tag declares when it is actually needed:
 *   - `idle`        after a short delay or first interaction, whichever comes
 *                   first. Used for analytics and call tracking, which must
 *                   still fire for a visitor who reads and leaves.
 *   - `interaction` only once the visitor does something. Used for the chat
 *                   widget, which nobody needs before they reach for it.
 *   - `visible`     when its container scrolls into view. Used for the reviews
 *                   widget.
 *
 * Tags are described in `window.__itlrTags`, written into the page by the
 * build, so this file has no site-specific ids in it.
 */

const loaded = new Set()

function inject(tag) {
  if (loaded.has(tag.id)) return
  loaded.add(tag.id)

  if (tag.before) {
    try { new Function(tag.before)() } catch (e) { /* a tag must not break the page */ }
  }

  const s = document.createElement('script')
  s.async = true
  s.src = tag.src
  for (const [k, v] of Object.entries(tag.attrs || {})) s.setAttribute(k, v)
  document.head.appendChild(s)
}

const INTERACTIONS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll']

function onFirstInteraction(fn) {
  const run = () => {
    for (const ev of INTERACTIONS) removeEventListener(ev, run, opts)
    fn()
  }
  const opts = { passive: true, once: false }
  for (const ev of INTERACTIONS) addEventListener(ev, run, opts)
  return run
}

export function initThirdParty() {
  const tags = window.__itlrTags
  if (!Array.isArray(tags) || !tags.length) return

  const idle = tags.filter((t) => t.when === 'idle')
  const onInteract = tags.filter((t) => t.when === 'interaction')
  const onVisible = tags.filter((t) => t.when === 'visible')

  if (idle.length) {
    const fire = () => idle.forEach(inject)
    const cancel = onFirstInteraction(fire)
    // Fire anyway shortly after load so a visitor who never interacts is still
    // counted, and so CallRail swaps the number without needing a click.
    const t = setTimeout(fire, 2500)
    addEventListener('pagehide', () => clearTimeout(t), { once: true })
  }

  if (onInteract.length) {
    onFirstInteraction(() => onInteract.forEach(inject))
  }

  if (onVisible.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        io.disconnect()
        onVisible.forEach(inject)
      }
    }, { rootMargin: '400px' })
    for (const t of onVisible) {
      const el = t.selector && document.querySelector(t.selector)
      if (el) io.observe(el)
    }
    // Nothing to watch on this page: fall back to interaction.
    if (!document.querySelector(onVisible[0]?.selector || 'x')) {
      onFirstInteraction(() => onVisible.forEach(inject))
    }
  } else if (onVisible.length) {
    onFirstInteraction(() => onVisible.forEach(inject))
  }
}
