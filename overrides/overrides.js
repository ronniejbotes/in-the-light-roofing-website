/*
 * Behaviour layered over the mirrored WordPress markup, injected by
 * build/serve.mjs so mirror/ stays a byte-faithful clone.
 *
 * To reproduce this on the live WordPress site, paste the body of
 * makeCarouselContinuous() into a footer snippet (Elementor -> Custom Code, or
 * a code-snippets plugin) set to run on the front end.
 */
(function () {
  'use strict'

  /**
   * Turn the Past Work image carousel into a continuous marquee.
   *
   * Elementor builds these on Swiper, which advances one slide per tick. To get
   * a constant crawl instead: no delay between ticks, a long transition, linear
   * easing, and freeMode so it does not snap to slide boundaries. Swiper is
   * already initialised by Elementor, so this reconfigures the live instance
   * rather than constructing a second one over the same DOM.
   */
  function makeCarouselContinuous(el) {
    var swiper = el.swiper
    if (!swiper) return false

    el.classList.add('itlr-marquee-carousel')

    // Honour the OS setting: leave the carousel as Elementor built it.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true
    }

    try {
      swiper.params.loop = true
      swiper.params.speed = 6000            // ms per slide advance -> the crawl rate
      swiper.params.freeMode = true
      swiper.params.freeModeMomentum = false
      swiper.params.allowTouchMove = false  // a drag fights the animation and never resumes
      swiper.params.autoplay = {
        delay: 0,                           // no pause between advances
        disableOnInteraction: false,
        pauseOnMouseEnter: false,
      }
      if (swiper.autoplay) {
        swiper.autoplay.stop()
        swiper.autoplay.start()
      }
      swiper.update()
    } catch (e) {
      return false
    }
    return true
  }

  /**
   * The Past Work carousel is the one carrying job photographs. Identify it by
   * position and content rather than by Elementor's generated element id, which
   * changes whenever the page is re-saved.
   */
  function findPastWorkCarousel() {
    var wrappers = document.querySelectorAll('.elementor-image-carousel-wrapper.swiper, .elementor-image-carousel-wrapper.swiper-container')
    for (var i = 0; i < wrappers.length; i++) {
      var w = wrappers[i]
      if (w.querySelectorAll('.swiper-slide').length < 3) continue
      var img = w.querySelector('img')
      if (!img) continue
      // Two carousels on this page qualify structurally. The certification-badge
      // strip near the top uses 450x450 square logos; the Past Work carousel uses
      // job photographs, which are larger and not square. Match on both, or the
      // badge strip gets picked first and the job photos are left alone.
      if (!img.naturalWidth) continue
      if (img.naturalWidth < 600) continue
      if (img.naturalWidth === img.naturalHeight) continue
      return w
    }
    return null
  }

  function init() {
    var el = findPastWorkCarousel()
    if (el && makeCarouselContinuous(el)) return true
    return false
  }

  // Elementor initialises its widgets after load, and Swiper attaches a moment
  // later still, so poll briefly rather than guessing a single delay.
  var tries = 0
  var timer = setInterval(function () {
    if (init() || ++tries > 40) clearInterval(timer)
  }, 250)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
