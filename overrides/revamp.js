/*
 * Site-wide motion: content eases up into place as it scrolls into view, the
 * header turns to frosted glass once the page moves, and a thin cyan bar
 * tracks reading progress. Styles live in revamp.css.
 *
 * Built so that nothing depends on it. Content is only hidden once this file
 * has run and added `itlr-motion` to <html>; with no JS, an old browser, or
 * prefers-reduced-motion, every element simply renders where it is.
 *
 * Left alone on purpose:
 *   - the hero (first section). Its heading is the page's largest text, and
 *     holding it at opacity 0 for a fade would push back the moment the page
 *     counts as painted.
 *   - the components other overrides already animate (reviews marquee, Past
 *     Work crawl, process stage, crew stack): two motion systems on one
 *     element fight.
 *   - anything Elementor animates itself (`elementor-invisible`, or an
 *     `_animation` setting), and the sticky estimate forms, where a transform
 *     would change what `position: sticky` sticks to.
 */
(function () {
  'use strict'

  var root = document.documentElement
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ---------------------------------------------------- scroll position */

  // The theme makes <body> the scroll container (overflow: hidden auto), so
  // window scroll events never fire on most pages. Listen to both and read
  // whichever one is actually moving.
  function scrollTop() {
    return document.body.scrollTop || document.documentElement.scrollTop || window.pageYOffset || 0
  }
  function scrollRange() {
    var b = document.body, d = document.documentElement
    var bodyScrolls = b.scrollHeight > b.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(b).overflowY)
    return bodyScrolls ? b.scrollHeight - b.clientHeight : d.scrollHeight - d.clientHeight
  }

  var bar = document.createElement('div')
  bar.className = 'itlr-progress'
  bar.setAttribute('aria-hidden', 'true')

  var ticking = false
  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(function () {
      ticking = false
      var y = scrollTop()
      root.classList.toggle('itlr-scrolled', y > 24)
      var max = scrollRange()
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ')'
    })
  }

  /* ----------------------------------------------------------- reveals */

  var TARGETS = [
    '.elementor-widget-heading',
    '.elementor-widget-text-editor',
    '.elementor-widget-image-box',
    '.elementor-widget-icon-box',
    '.elementor-widget-icon-list',
    '.elementor-widget-button',
    '.elementor-widget-image',
    '.elementor-widget-divider',
    '.elementor-accordion-item',
    '.itlr-crew-photos__item',
  ].join(',')

  var SKIP_INSIDE = [
    'header', 'footer',
    '.itlr-reviews', '.itlr-marquee', '.itlr-proc', '.itlr-team', '.itlr-cta',
    '.process-box', '.get-form-banner', '.elementor-sticky', '[data-settings*="sticky"]',
    '.swiper', '.elementor-invisible', '[data-settings*="_animation"]', 'form',
  ].join(',')

  function heroOf() {
    // The first content section after the header.
    var secs = document.querySelectorAll('.elementor-top-section, .e-parent')
    for (var i = 0; i < secs.length; i++) {
      if (!secs[i].closest('header, footer, [data-elementor-type="header"]') && secs[i].offsetHeight > 200) return secs[i]
    }
    return null
  }

  function collect() {
    var hero = heroOf()
    var all = document.querySelectorAll(TARGETS)
    var out = []
    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      if (hero && hero.contains(el)) continue
      if (el.closest(SKIP_INSIDE)) continue
      if (el.parentElement && el.parentElement.closest('.itlr-rv')) continue   // a parent already moves
      if (!el.offsetWidth && !el.offsetHeight) continue                       // hidden on this breakpoint
      el.classList.add('itlr-rv')
      out.push(el)
    }
    return out
  }

  function reveal(list) {
    // Elements that arrive together are staggered by their order on the page,
    // so a row of cards deals in left to right instead of popping at once.
    list.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    })
    for (var i = 0; i < list.length; i++) {
      list[i].style.setProperty('--itlr-d', Math.min(i, 6) * 70 + 'ms')
      list[i].classList.add('is-in')
    }
  }

  function initReveals() {
    if (reduced || !('IntersectionObserver' in window)) return
    var els = collect()
    if (!els.length) return
    root.classList.add('itlr-motion')

    var io = new IntersectionObserver(function (entries) {
      var batch = []
      for (var k = 0; k < entries.length; k++) {
        if (!entries[k].isIntersecting) continue
        batch.push(entries[k].target)
        io.unobserve(entries[k].target)
      }
      if (batch.length) reveal(batch)
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })

    for (var j = 0; j < els.length; j++) io.observe(els[j])

    // A long jump (anchor link, Ctrl+End, restored scroll) can carry an
    // element past the viewport between two observer callbacks; anything
    // above the fold that is still hidden after that is shown outright.
    document.body.addEventListener('scroll', sweep, { passive: true })
    window.addEventListener('scroll', sweep, { passive: true })
    var sweepT
    function sweep() {
      clearTimeout(sweepT)
      sweepT = setTimeout(function () {
        var left = document.querySelectorAll('.itlr-rv:not(.is-in)')
        var late = []
        for (var n = 0; n < left.length; n++) {
          if (left[n].getBoundingClientRect().bottom < 0) late.push(left[n])
        }
        if (late.length) reveal(late)
      }, 120)
    }
  }

  /* -------------------------------------------------------- hero title */

  // The page heading lifts into place line by line. Transform and opacity
  // only, and only once the homepage's intro film has closed, so it plays
  // where someone can actually see it.
  function initHero() {
    if (reduced) return
    var hero = heroOf()
    var h1 = hero && hero.querySelector('h1')
    if (!h1) return
    var parts = h1.children.length ? [].slice.call(h1.children) : [h1]
    for (var i = 0; i < parts.length; i++) {
      parts[i].classList.add('itlr-hl')
      parts[i].style.setProperty('--itlr-d', (120 + i * 140) + 'ms')
    }
    function play() { root.classList.add('itlr-hero-in') }
    if (!root.classList.contains('itlr-gate-open')) return play()
    var mo = new MutationObserver(function () {
      if (root.classList.contains('itlr-gate-open')) return
      mo.disconnect()
      play()
    })
    mo.observe(root, { attributes: true, attributeFilter: ['class'] })
  }

  /* ------------------------------------------------------ dark sections */

  // The near-black bands get a slow drifting cyan glow, so they read as lit
  // rather than flat. Found by colour, since Elementor gives them no class.
  function initDark() {
    var secs = document.querySelectorAll('.elementor-top-section, .e-parent')
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].closest('header, footer')) continue
      if (getComputedStyle(secs[i]).backgroundColor === 'rgb(20, 22, 30)') secs[i].classList.add('itlr-dark')
    }
  }

  /* -------------------------------------------------------------- init */

  function init() {
    document.body.appendChild(bar)
    document.body.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    initDark()
    initHero()
    // After the other overrides have rebuilt their sections, so the skip
    // list sees their final markup.
    setTimeout(initReveals, 60)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
