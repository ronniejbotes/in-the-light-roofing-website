export function initToTop() {
  const btn = document.querySelector('.to-top')
  if (!btn) return

  let ticking = false
  const update = () => {
    btn.classList.toggle('is-visible', scrollY > 700)
    ticking = false
  }

  addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(update)
  }, { passive: true })

  btn.addEventListener('click', () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  })

  update()
}
