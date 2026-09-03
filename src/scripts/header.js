/**
 * Sticky header state, mobile menu, and submenu toggles.
 * The menu markup is fully rendered server-side; this only manages state.
 */

export function initHeader() {
  const header = document.querySelector('.header')
  const burger = document.querySelector('.burger')
  const menu = document.getElementById('mobile-menu')

  /* --- shrink-on-scroll ------------------------------------------------ */
  if (header) {
    const sentinel = document.createElement('div')
    sentinel.setAttribute('aria-hidden', 'true')
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;'
    header.parentNode.insertBefore(sentinel, header)

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        ([e]) => header.classList.toggle('is-stuck', !e.isIntersecting),
        { threshold: 0 }
      ).observe(sentinel)
    }
  }

  /* --- mobile menu ----------------------------------------------------- */
  if (burger && menu) {
    let lastFocus = null

    const setOpen = (open) => {
      burger.setAttribute('aria-expanded', String(open))
      menu.classList.toggle('is-open', open)
      menu.setAttribute('aria-hidden', String(!open))
      document.body.classList.toggle('is-locked', open)
      if (open) {
        lastFocus = document.activeElement
        menu.querySelector('a, button')?.focus()
      } else {
        lastFocus?.focus?.()
      }
    }

    burger.addEventListener('click', () =>
      setOpen(burger.getAttribute('aria-expanded') !== 'true')
    )
    menu.querySelector('[data-menu-close]')?.addEventListener('click', () => setOpen(false))

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) setOpen(false)
    })

    // Keep the menu in step with the breakpoint it belongs to.
    const mq = matchMedia('(min-width: 1025px)')
    mq.addEventListener?.('change', (e) => { if (e.matches) setOpen(false) })
  }

  /* --- collapsible submenus inside the mobile menu --------------------- */
  for (const btn of document.querySelectorAll('.mobile-menu__toggle')) {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'))
      if (!panel) return
      const open = btn.getAttribute('aria-expanded') === 'true'
      btn.setAttribute('aria-expanded', String(!open))
      panel.classList.toggle('is-open', !open)
    })
  }
}
