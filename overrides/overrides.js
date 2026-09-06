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

  /* -------------------------------------------------------------------------
   * Remove the team-carousel slides for a person who no longer works here.
   *
   * The "Contact Our Roofing Team" carousel gives each crew member a slide with
   * their portrait as the background image and a second portrait on hover. Three
   * Elementor elements carry his pair (SEMI7879 default, SEMI7885 hover):
   * 6d5023c on the homepage, 56194a8 and 8ac57c0 on /about-us/. Each was checked
   * against the CSS to be sure it carries no other crew member's photograph.
   *
   * Removing the slide rather than hiding it matters twice over: display:none
   * leaves Swiper counting a slide that is not there, and a hidden element is
   * still a portrait of a real person being served to promote a company he has
   * left.
   *
   * The group crew photo (SEMI8066) is untouched -- you cannot take one person
   * out of a photograph of six, and that needs a new photo, not code.
   * ---------------------------------------------------------------------- */
  var FORMER_STAFF = ['56194a8', '6d5023c', '8ac57c0']

  function removeFormerStaffSlides() {
    var touched = []
    FORMER_STAFF.forEach(function (id) {
      // Swiper's loop mode clones slides, so there can be several matches for
      // one id. Keep going until none are left, or the clone survives the
      // original and he is still on screen.
      var guard = 0
      var el
      while ((el = document.querySelector('.elementor-element-' + id)) && guard++ < 20) {
        var slide = el.closest('.swiper-slide') || el
        var container = slide.closest('.swiper, .swiper-container')
        slide.parentNode && slide.parentNode.removeChild(slide)
        if (container && touched.indexOf(container) === -1) touched.push(container)
      }
    })
    // Let Swiper recount, and rebuild the loop if it is using one.
    touched.forEach(function (c) {
      var s = c.swiper
      if (!s) return
      try {
        if (s.params && s.params.loop && s.loopDestroy && s.loopCreate) {
          s.loopDestroy()
          s.loopCreate()
        }
        s.update()
      } catch (e) { /* a carousel that will not recount is still better than one showing him */ }
    })
    return touched.length
  }

  function init() {
    removeFormerStaffSlides()
    var el = findPastWorkCarousel()
    if (el && makeCarouselContinuous(el)) return true
    return false
  }

  // Elementor initialises its widgets after load, and Swiper attaches a moment
  // later still, so poll briefly rather than guessing a single delay.
  // Keep asserting rather than stopping at the first success. Elementor and
  // Swiper both re-render after load, and a slide that comes back is a portrait
  // of a former employee back on the page.
  var tries = 0
  var timer = setInterval(function () {
    init()
    if (++tries > 80) clearInterval(timer)
  }, 250)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
