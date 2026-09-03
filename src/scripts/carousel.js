/**
 * Scroll-snap carousel controls. The track scrolls natively (and is swipeable
 * and keyboard-scrollable on its own); these buttons are an enhancement.
 */

export function initCarousel() {
  for (const root of document.querySelectorAll('[data-carousel]')) {
    const track = root.querySelector('.carousel__track')
    const prev = root.querySelector('[data-carousel-prev]')
    const next = root.querySelector('[data-carousel-next]')
    if (!track) continue

    const step = () => {
      const first = track.firstElementChild
      if (!first) return track.clientWidth
      const gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0
      return first.getBoundingClientRect().width + gap
    }

    const sync = () => {
      const max = track.scrollWidth - track.clientWidth - 2
      if (prev) prev.disabled = track.scrollLeft <= 2
      if (next) next.disabled = track.scrollLeft >= max
    }

    prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }))
    next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }))
    track.addEventListener('scroll', sync, { passive: true })
    addEventListener('resize', sync, { passive: true })
    sync()
  }
}
