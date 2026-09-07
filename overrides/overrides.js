/*
 * Behaviour layered over the mirrored WordPress markup, injected by
 * build/serve.mjs so mirror/ stays a byte-faithful clone.
 *
 * To reproduce this on the live WordPress site, paste this whole IIFE into a
 * footer snippet (Elementor -> Custom Code, or a code-snippets plugin) set to
 * run on the front end, and overrides.css into Elementor -> Site Settings ->
 * Custom CSS. It is deliberately ES5-ish and dependency-free for that reason.
 *
 * Contents: the Past Work strip (Elementor's Swiper is destroyed and replaced
 * with a seamless CSS marquee), the estimate prompt beneath it, and the removal
 * of a former employee's carousel slides.
 */
(function () {
  'use strict'

  /* How fast the strip travels, in CSS pixels per second.
   *
   * 106, down from the 163 the Swiper version ran at. The photographs are 35%
   * narrower now, so holding 163 px/s would have pushed each one past the eye
   * 35% sooner and quietly undone the "a third slower" that was asked for
   * earlier. This keeps the time each photograph spends on screen the same.
   * Raise it to 163 if the intent was a constant travel speed instead. */
  var PX_PER_SEC = 106

  /**
   * The photographs, one entry per distinct image.
   *
   * Swiper's loop mode clones slides, so the DOM holds thirteen slides for
   * seven photographs. De-duplicating on src is what keeps the rebuilt track
   * from repeating a photograph twice inside one copy of the set.
   */
  function collectPhotos(el) {
    var out = []
    var seen = {}
    var slides = el.querySelectorAll('.swiper-slide')
    for (var i = 0; i < slides.length; i++) {
      var img = slides[i].querySelector('img')
      if (!img) continue
      var src = img.getAttribute('src') || img.currentSrc || ''
      if (!src || seen[src]) continue
      seen[src] = 1
      out.push({ src: src, alt: img.getAttribute('alt') || '' })
    }
    return out
  }

  /**
   * Render `copies` whole copies of the set into the track.
   *
   * The tilt class comes from the index within one copy, so every copy carries
   * an identical pattern of angles. Using :nth-child instead would alternate
   * across the whole track, and with an odd number of photographs the pattern
   * would differ between the two halves -- which shows up as a flicker at the
   * exact point the loop restarts.
   *
   * Only the first copy is exposed to assistive technology; the rest are
   * duplicates of the same photographs and are marked hidden.
   */
  function fillTrack(track, photos, copies) {
    var html = ''
    for (var c = 0; c < copies; c++) {
      for (var i = 0; i < photos.length; i++) {
        var tilt = (i % 2 === 0) ? 'itlr-marquee__item--cw' : 'itlr-marquee__item--ccw'
        var dup = c > 0
        html += '<div class="itlr-marquee__item ' + tilt + '"' + (dup ? ' aria-hidden="true"' : '') + '>'
          + '<img src="' + photos[i].src + '" alt="' + (dup ? '' : photos[i].alt.replace(/"/g, '&quot;')) + '"'
          + ' loading="lazy" decoding="async">'
          + '</div>'
      }
    }
    track.innerHTML = html
  }

  /**
   * Set the animation duration from the distance actually travelled.
   *
   * The keyframe moves the track by -50% of its own width, so the distance is
   * half the track, and duration = distance / speed keeps the on-screen rate
   * fixed no matter how many copies ended up in there.
   */
  function setDuration(track) {
    var half = track.getBoundingClientRect().width / 2
    if (!half) return
    track.style.animationDuration = (half / PX_PER_SEC).toFixed(2) + 's'
  }

  /**
   * Replace Elementor's Swiper carousel with a seamless CSS marquee.
   *
   * Swiper is destroyed rather than reconfigured. Its loop mode is the source
   * of the jump: it clones slides and teleports the wrapper back to the start
   * once the clones are exhausted. A track built from whole copies and animated
   * to -50% has no such moment -- the last frame is identical to the first.
   */
  function buildMarquee(el) {
    if (el.getAttribute('data-itlr-marquee') === '1') return true

    var photos = collectPhotos(el)
    if (photos.length < 3) return false          // not the strip, or not loaded yet

    try {
      if (el.swiper) el.swiper.destroy(true, true)
    } catch (e) { /* a carousel that will not shut down is still replaced below */ }

    el.setAttribute('data-itlr-marquee', '1')
    // Drop the classes Elementor keys its own re-initialisation off, so it does
    // not come back and build a second Swiper over a DOM that no longer has the
    // slides it expects.
    el.classList.remove('swiper', 'swiper-container', 'swiper-initialized',
      'swiper-horizontal', 'swiper-pointer-events', 'swiper-backface-hidden')
    el.classList.add('itlr-marquee')
    el.removeAttribute('style')

    var track = document.createElement('div')
    track.className = 'itlr-marquee__track'
    el.innerHTML = ''
    el.appendChild(track)

    // Enough copies that one half alone is wider than the viewport, or a gap
    // opens at the right-hand edge as the first half scrolls away. Measured
    // rather than assumed, because the item width is set in CSS and changes
    // at the two breakpoints.
    var copies = 2
    fillTrack(track, photos, copies)
    while (copies < 12 && track.getBoundingClientRect().width / 2 < window.innerWidth * 1.15) {
      copies += 2
      fillTrack(track, photos, copies)
    }

    setDuration(track)
    // Photographs arriving late change the track width; re-measure once they do.
    var imgs = track.querySelectorAll('img')
    for (var i = 0; i < imgs.length; i++) {
      if (!imgs[i].complete) imgs[i].addEventListener('load', function () { setDuration(track) }, { once: true })
    }

    var resizeTimer
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(function () { setDuration(track) }, 200)
    })

    return true
  }

  /**
   * The Past Work carousel is the one carrying job photographs. Identify it by
   * position and content rather than by Elementor's generated element id, which
   * changes whenever the page is re-saved.
   */
  function findPastWorkCarousel() {
    var built = document.querySelector('.itlr-marquee[data-itlr-marquee="1"]')
    if (built) return built
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
   * The estimate prompt under the Past Work strip.
   *
   * Placed immediately after the photographs on purpose: the strip is the proof,
   * and the ask belongs next to the proof rather than at the foot of the page.
   *
   * Copy rules that apply here -- no invented figures, no promised outcome, and
   * descriptive link text rather than "learn more". "Free, no-obligation" is the
   * site's own wording for the offer, not a claim introduced here. US spelling,
   * to match the rest of the site and its Pennsylvania readership.
   *
   * This is injected, so it is a conversion element and not an indexable one.
   * If it earns its keep, move it into Elementor as real markup.
   * ---------------------------------------------------------------------- */
  var CTA_HTML =
    '<h2 class="itlr-cta__title">Thinking about replacing your roof?</h2>' +
    '<p class="itlr-cta__body">The work above is ours. If your roof is showing its age, ' +
    'book a free, no-obligation inspection &mdash; we will tell you honestly whether it ' +
    'needs a repair or a full replacement, and what that would involve.</p>' +
    '<div class="itlr-cta__actions">' +
      '<a class="itlr-cta__btn itlr-cta__btn--primary" href="/contact/">Get your free estimate</a>' +
      '<a class="itlr-cta__btn itlr-cta__btn--secondary" href="tel:4845530213">Call (484) 553-0213</a>' +
    '</div>'

  function injectEstimateCta(carouselEl) {
    if (document.querySelector('.itlr-cta')) return true
    // The carousel is broken out to 100vw, so the prompt is attached after the
    // widget rather than inside it -- that puts it back in the 1170px column.
    var anchor = carouselEl.closest('.elementor-widget') || carouselEl
    if (!anchor.parentNode) return false
    var cta = document.createElement('div')
    cta.className = 'itlr-cta'
    cta.innerHTML = CTA_HTML
    anchor.parentNode.insertBefore(cta, anchor.nextSibling)
    return true
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

  /* -------------------------------------------------------------------------
   * Put the founder section above the "Contact Our Roofing Team" carousel.
   *
   * The owner's story is the stronger opener of the two: it introduces a named
   * human before the page asks you to pick one of seven faces to contact.
   *
   * Neither section is found by its Elementor id. Those are regenerated every
   * time the page is re-saved, and this pair is the whole point of the change --
   * if the ids drift, a silent no-op puts the sections back in the old order
   * with nothing to show for it. The founder section carries a hand-written
   * `founder-section` class, and the carousel is identified by its heading.
   * ---------------------------------------------------------------------- */
  function findTeamCarouselSection(founder) {
    var sibs = founder.parentNode.children
    for (var i = 0; i < sibs.length; i++) {
      if (sibs[i] === founder) continue
      var h = sibs[i].querySelector('h1, h2, h3, h4')
      if (h && /contact\s+our[\s\S]{0,20}team/i.test(h.textContent)) return sibs[i]
    }
    return null
  }

  function founderAboveTeamCarousel() {
    var founder = document.querySelector('.founder-section')
    if (!founder || !founder.parentNode) return false
    var carousel = findTeamCarouselSection(founder)
    if (!carousel) return false
    // DOCUMENT_POSITION_FOLLOWING means the carousel already comes after the
    // founder section, i.e. this has run. Re-running insertBefore would be
    // harmless but it also fires on every poll tick, so stop here.
    if (founder.compareDocumentPosition(carousel) & 4) return true
    carousel.parentNode.insertBefore(founder, carousel)
    return true
  }

  function init() {
    removeFormerStaffSlides()
    founderAboveTeamCarousel()
    var el = findPastWorkCarousel()
    if (!el) return false
    var ok = buildMarquee(el)
    injectEstimateCta(el)
    return ok
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
