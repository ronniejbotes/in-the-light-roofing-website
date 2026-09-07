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
    // ESTIMATE, not inspection. This said "a free, no-obligation inspection"
    // and that was wrong: the site's own FAQ says "What's the difference
    // between free estimates and paid roof inspections?" and "roof inspections
    // may come with a fee". The estimate is the free thing. Advertising a free
    // inspection on the same page that says inspections are charged for is a
    // promise the client would have had to break at the kerb.
    '<p class="itlr-cta__body">The work above is ours. If your roof is showing its age, ' +
    'book a free, no-obligation estimate &mdash; we will tell you honestly whether it ' +
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

  /* -------------------------------------------------------------------------
   * /home/ hero: play the lightning instead of showing a still of it.
   *
   * The lightning is an <img> in .banner-bg-img, not a CSS background. (The
   * stylesheet rule that appears to paint it is invalid -- its url() has a
   * stray `fetchpriority(high)` inside the value, so browsers drop the whole
   * declaration. Worth knowing before hunting for a background to replace.)
   *
   * The img is kept and wrapped rather than replaced. It holds the layout box
   * the video is sized against, and it is what stays visible if autoplay is
   * refused -- which happens on iOS Low Power Mode and on Data Saver, and is
   * why the video is never the only thing there.
   *
   * The clip itself is a ping-pong: 4 seconds forward then the same 4 seconds
   * backward, so the last frame is the one before the first and it loops with
   * no visible seam. That also halved what had to be generated.
   * ---------------------------------------------------------------------- */
  var HERO_VIDEO = '/_assets/hero-lightning'

  /* -------------------------------------------------------------------------
   * /past-work/: make the gallery actually show its photographs.
   *
   * Elementor's gallery ships with `e-gallery--lazyload`: the items carry no
   * <img> at all, only a data-thumbnail, and its own script is supposed to set
   * each one as a background as it scrolls into view. On the mirror that script
   * only ever gets through some of them -- measured 8 of 14 after scrolling the
   * whole page, and fewer than that on the deployed copy, which is why the page
   * showed three photographs and a lot of blue.
   *
   * The URLs are all right there in data-thumbnail, so rather than repair
   * Elementor's loader this replaces it: one observer, a generous margin, and
   * every item gets its background. Still lazy -- 14 photographs is 2.5MB and
   * loading them all up front would be its own bug -- but no longer optional.
   * ---------------------------------------------------------------------- */
  function fixGalleryLazyLoad() {
    var items = document.querySelectorAll('.e-gallery-image[data-thumbnail]')
    if (!items.length) return false

    var pending = []
    for (var i = 0; i < items.length; i++) {
      var el = items[i]
      if (el.getAttribute('data-itlr-lazy') === '1') continue
      el.setAttribute('data-itlr-lazy', '1')
      // Elementor may have got to this one already; leave it be.
      if (el.style.backgroundImage && el.style.backgroundImage !== 'none') continue
      pending.push(el)
    }
    if (!pending.length) return true

    function load(el) {
      var u = el.getAttribute('data-thumbnail')
      if (!u) return
      el.style.backgroundImage = 'url("' + u.replace(/"/g, '%22') + '")'
      el.classList.add('e-gallery-image-loaded')
    }

    if (!('IntersectionObserver' in window)) {
      for (var j = 0; j < pending.length; j++) load(pending[j])
      return true
    }

    var io = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        if (!entries[k].isIntersecting) continue
        load(entries[k].target)
        io.unobserve(entries[k].target)
      }
    }, { rootMargin: '800px 0px' })

    for (var m = 0; m < pending.length; m++) io.observe(pending[m])
    return true
  }

  /* -------------------------------------------------------------------------
   * The lightning video, on every page that shows the lightning.
   *
   * There are two variants of the same artwork and they need different
   * handling, which is why matching only the first one missed 200-odd pages:
   *
   *   /home/         an <img> of 2024/05/bnr-bg.webp inside .banner-bg-img
   *   everywhere else  a CSS background-image of 2024/03/bnr-bg.jpg.webp on the
   *                    banner section itself
   *
   * The second is found by reading computed styles rather than by listing
   * pages: Elementor gives the banner section a different generated id on
   * nearly every page, so any hard-coded list would be wrong the moment a page
   * is re-saved. Scanning is limited to top-level sections, not every node.
   * ---------------------------------------------------------------------- */
  function makeLightningVideo(posterUrl) {
    var v = document.createElement('video')
    v.className = 'itlr-hero-video'
    // Properties and attributes both: Safari decides whether a video may
    // autoplay from the attributes in the markup, not from properties set after.
    v.autoplay = true
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.setAttribute('autoplay', '')
    v.setAttribute('muted', '')
    v.setAttribute('loop', '')
    v.setAttribute('playsinline', '')
    v.setAttribute('preload', 'auto')
    v.setAttribute('aria-hidden', 'true')
    v.setAttribute('tabindex', '-1')
    if (posterUrl) v.poster = posterUrl
    v.innerHTML = '<source src="' + HERO_VIDEO + '.webm" type="video/webm">'
      + '<source src="' + HERO_VIDEO + '.mp4" type="video/mp4">'
    v.addEventListener('loadeddata', function () { v.setAttribute('data-ready', '1') })
    v.addEventListener('error', function () { v.parentNode && v.parentNode.removeChild(v) })
    return v
  }

  function playOrRemove(v) {
    var p = v.play()
    if (p && p.catch) {
      p.catch(function () {
        // Autoplay refused -- iOS Low Power Mode, Data Saver. What is behind it
        // is the original artwork, so drop the video rather than leave a paused
        // first frame sitting there.
        v.removeAttribute('data-ready')
      })
    }
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }

  /** Variant 1: the <img> on /home/. */
  function heroLightningImage() {
    var host = document.querySelector('.banner-bg-img')
    if (!host || host.getAttribute('data-itlr-herovid') === '1') return false
    var img = host.querySelector('img')
    if (!img || !/bnr-bg/.test(img.currentSrc || img.src || '')) return false

    host.setAttribute('data-itlr-herovid', '1')
    if (reducedMotion()) return true

    // The img is kept and wrapped, not replaced: it holds the box the video is
    // sized against, and it is what remains if autoplay is refused.
    var wrap = document.createElement('span')
    wrap.className = 'itlr-hero-videowrap'
    img.parentNode.insertBefore(wrap, img)
    wrap.appendChild(img)

    var v = makeLightningVideo(img.currentSrc || img.src)
    wrap.appendChild(v)
    playOrRemove(v)
    return true
  }

  /** Variant 2: the CSS background on every other page's banner section. */
  function heroLightningBackgrounds() {
    var cands = document.querySelectorAll('.elementor-top-section, section.elementor-section, .e-con-parent')
    var found = false
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i]
      if (el.getAttribute('data-itlr-herovid') === '1') continue
      var cs = window.getComputedStyle(el)
      if (!/bnr-bg/.test(cs.backgroundImage || '')) continue

      el.setAttribute('data-itlr-herovid', '1')
      found = true
      if (reducedMotion()) continue

      // The video is absolutely placed, so the section needs to be a
      // positioning context. Elementor usually sets this already.
      if (cs.position === 'static') el.style.position = 'relative'

      var poster = (cs.backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [])[1] || ''
      var v = makeLightningVideo(poster)
      // First child, so it paints over the section's own background but under
      // the overlay and the content -- both of which the stylesheet lifts.
      el.insertBefore(v, el.firstChild)
      playOrRemove(v)
    }
    return found
  }

  function heroLightningVideo() {
    var a = heroLightningImage()
    var b = heroLightningBackgrounds()
    return a || b
  }

  /* -------------------------------------------------------------------------
   * The "Start the build" gate. Homepage only.
   *
   * Same shape as the Eye Candy Customs warehouse gate: you arrive on a still
   * of the job not yet started, choose to begin it, watch the roof go on, and
   * are let through. Scroll stays locked until then so the sequence can never
   * be scrolled past halfway.
   *
   * Two deliberate departures from ECC. Nothing darkens the footage -- no black
   * ground, no gradient scrim -- because the clip is a bright daylight aerial
   * and dimming it is the opposite of what it is for; the button takes its
   * contrast from a solid cyan chip instead. And the video is not fetched until
   * the page itself has finished loading: it is 1.8MB, nobody sees a frame of
   * it before a click, and it has no business competing with the homepage.
   *
   * GATE_ONCE_PER_SESSION is false to match ECC, where the door is part of
   * arriving and shows on every load. Set it to true and a visitor sees the
   * gate once per tab instead -- worth weighing on a site whose job is to move
   * people toward a quote.
   * ---------------------------------------------------------------------- */
  var GATE_VIDEO = '/_assets/build-gate'
  var GATE_POSTER = '/_assets/build-gate-poster.jpg'
  var GATE_FAILSAFE_MS = 10500          // the clip runs 8.04s; +2s of headroom
  var GATE_ONCE_PER_SESSION = false
  var GATE_KEY = 'itlr-gate-seen'
  var gateBuilt = false

  function isHomepage() {
    var p = (location.pathname || '/').replace(/\/+$/, '')
    return p === '' || p === '/home' || p === '/index.html'
  }

  function gateAlreadySeen() {
    if (!GATE_ONCE_PER_SESSION) return false
    try { return sessionStorage.getItem(GATE_KEY) === '1' } catch (e) { return false }
  }

  function buildGate() {
    // Runs exactly once. init() polls for 20 seconds and the gate removes
    // itself from the DOM when it is done, so an "is it already there" check
    // would rebuild it the moment somebody got through.
    if (gateBuilt) return false
    gateBuilt = true

    if (!isHomepage()) return false
    // Reduced motion asked not to sit through this. Let them straight in.
    if (reducedMotion()) return false
    if (gateAlreadySeen()) return false
    if (!document.body) return false

    var gate = document.createElement('div')
    gate.id = 'itlr-build-gate'
    gate.setAttribute('data-state', 'closed')
    gate.setAttribute('role', 'dialog')
    gate.setAttribute('aria-modal', 'true')
    gate.setAttribute('aria-label', 'Start the build')

    // The still is frame 0 of the clip itself -- the worn roof, before anyone
    // has touched it -- so the first frame of playback is the picture that was
    // already on screen and the cut into motion is invisible.
    var poster = document.createElement('img')
    poster.className = 'itlr-gate-media itlr-gate-poster'
    poster.src = GATE_POSTER
    poster.alt = ''
    poster.setAttribute('aria-hidden', 'true')
    gate.appendChild(poster)

    var v = document.createElement('video')
    v.className = 'itlr-gate-media itlr-gate-video'
    v.muted = true
    v.playsInline = true
    v.setAttribute('muted', '')
    v.setAttribute('playsinline', '')
    v.setAttribute('preload', 'none')
    v.setAttribute('poster', GATE_POSTER)
    v.setAttribute('aria-hidden', 'true')
    v.setAttribute('tabindex', '-1')
    gate.appendChild(v)

    var ui = document.createElement('div')
    ui.className = 'itlr-gate-ui'
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'itlr-gate-btn'
    btn.textContent = 'Start the build'
    var note = document.createElement('p')
    note.className = 'itlr-gate-note'
    note.textContent = 'Watch a roof go on in eight seconds'
    ui.appendChild(btn)
    ui.appendChild(note)
    gate.appendChild(ui)

    var skip = document.createElement('button')
    skip.type = 'button'
    skip.className = 'itlr-gate-skip'
    skip.textContent = 'Skip'
    gate.appendChild(skip)

    document.body.appendChild(gate)

    // Every arrival starts at the top, behind the gate.
    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }
    catch (e) { window.scrollTo(0, 0) }

    var prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    var failsafe = null
    var done = false

    function onKey(e) {
      if (e.key === 'Escape' || e.keyCode === 27) finish()
    }

    function finish() {
      if (done) return
      done = true
      if (failsafe) clearTimeout(failsafe)
      document.removeEventListener('keydown', onKey)
      gate.setAttribute('data-state', 'done')
      document.body.style.overflow = prevOverflow
      try { sessionStorage.setItem(GATE_KEY, '1') } catch (e) { }
      // Let the crossfade finish, then take it out of the tree entirely so it
      // cannot swallow clicks or hold a decoded video frame in memory.
      setTimeout(function () {
        if (gate.parentNode) gate.parentNode.removeChild(gate)
      }, 800)
    }

    function start() {
      if (gate.getAttribute('data-state') !== 'closed') return
      gate.setAttribute('data-state', 'playing')
      var p = v.play()
      if (p && p.catch) {
        // Playback refused, or the file never arrived. Never strand somebody
        // behind a video that is not going to play.
        p.catch(finish)
      }
      failsafe = setTimeout(finish, GATE_FAILSAFE_MS)
    }

    btn.addEventListener('click', start)
    skip.addEventListener('click', finish)
    v.addEventListener('ended', finish)
    v.addEventListener('error', finish)
    document.addEventListener('keydown', onKey)
    try { btn.focus({ preventScroll: true }) } catch (e) { }

    // Only now go and fetch it. The homepage has first claim on the connection
    // and there is nothing to see here until somebody clicks.
    function arm() {
      if (v.getElementsByTagName('source').length) return
      v.innerHTML = '<source src="' + GATE_VIDEO + '.webm" type="video/webm">'
        + '<source src="' + GATE_VIDEO + '.mp4" type="video/mp4">'
      v.setAttribute('preload', 'auto')
      v.load()
    }
    if (document.readyState === 'complete') arm()
    else window.addEventListener('load', arm)

    return true
  }

  /* -------------------------------------------------------------------------
   * The Google Maps embed: in the footer, and on the contact page.
   *
   * One place embed with the business pinned. The contact page already had a
   * map, but it was the generic `maps?q=In The Light Roofing` search embed at
   * zoom 10 -- the whole Lehigh Valley and no marker on the premises. That one
   * is repointed rather than a second map added below it.
   *
   * loading="lazy" is on the iframe deliberately and matters more than usual
   * here: the footer is on all 427 pages, and without it every page load would
   * pull Google Maps whether or not anyone scrolled that far.
   * ---------------------------------------------------------------------- */
  var MAP_EMBED = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3028.3642109374377'
    + '!2d-75.44724580028523!3d40.62184923270019!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2'
    + '!1s0x89c43b840ffd0c33%3A0x21c950328309980d!2sIn%20The%20Light%20Roofing!5e0!3m2!1sen!2sza'
    + '!4v1788795465393!5m2!1sen!2sza'

  var MAP_TITLE = 'Google Map showing In The Light Roofing, 871 N Fenwick St, Allentown PA'

  function makeMapFrame() {
    var f = document.createElement('iframe')
    f.className = 'itlr-map-frame'
    f.src = MAP_EMBED
    // A named frame, or a screen reader announces only "iframe".
    f.title = MAP_TITLE
    f.setAttribute('loading', 'lazy')
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    f.setAttribute('allowfullscreen', '')
    f.style.border = '0'
    return f
  }

  /**
   * The footer row holding the four columns.
   *
   * Found by content, not by id: it is the innermost container that holds all
   * three of the footer's column headings. Taking the innermost match matters --
   * every wrapper above it contains those words too, and attaching the map to
   * one of those would put it beside the whole page rather than beside the
   * columns.
   */
  function findFooterRow() {
    var conts = document.querySelectorAll('.elementor-container, .e-con-inner')
    var best = null
    var bestSize = Infinity
    for (var i = 0; i < conts.length; i++) {
      var t = (conts[i].textContent || '').toUpperCase()
      if (t.indexOf('QUICK LINKS') === -1) continue
      if (t.indexOf('CONTACT INFO') === -1) continue
      if (conts[i].children.length < 3) continue
      var size = conts[i].querySelectorAll('*').length
      if (size < bestSize) { best = conts[i]; bestSize = size }
    }
    return best
  }

  function injectFooterMap() {
    var row = findFooterRow()
    if (!row || row.getAttribute('data-itlr-map') === '1') return false
    row.setAttribute('data-itlr-map', '1')

    // The row cannot grow past its parent, and the footer sits inside the
    // site's 1170px container. Widening the row alone just squeezed the four
    // columns (351px down to 242px) instead of using the empty page margin the
    // map is meant to occupy, so every boxed ancestor up to the footer section
    // is marked and released by the stylesheet as well.
    var up = row.parentElement
    for (var g = 0; up && g < 6; g++) {
      if (up.classList.contains('elementor-container') || up.classList.contains('e-con-inner')) {
        up.setAttribute('data-itlr-mapwide', '1')
      }
      up = up.parentElement
    }
    var col = document.createElement('div')
    col.className = 'itlr-footer-map'
    col.appendChild(makeMapFrame())
    row.appendChild(col)
    return true
  }

  /** Repoint the contact page's existing map at the pinned place embed. */
  function upgradeContactMap() {
    var frames = document.querySelectorAll('iframe[src*="google.com/maps"], iframe[src*="maps.google.com"]')
    var changed = false
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i]
      if (f.classList.contains('itlr-map-frame')) continue      // the footer's own
      if ((f.src || '').indexOf('/maps/embed?pb=') > -1) continue // already pinned
      f.src = MAP_EMBED
      if (!f.getAttribute('title')) f.setAttribute('title', MAP_TITLE)
      f.setAttribute('loading', 'lazy')
      f.classList.add('itlr-map-frame', 'itlr-map-frame--page')
      changed = true
    }
    return changed
  }

  function init() {
    removeFormerStaffSlides()
    injectFooterMap()
    upgradeContactMap()
    founderAboveTeamCarousel()
    heroLightningVideo()
    fixGalleryLazyLoad()
    var el = findPastWorkCarousel()
    if (!el) return false
    var ok = buildMarquee(el)
    injectEstimateCta(el)
    return ok
  }

  // The gate goes up before anything else and outside init()'s poll. This
  // script is deferred, so the body is parsed but not yet painted -- which is
  // the last moment the overlay can appear without the page flashing behind it
  // first. It also must not be re-run: init() fires every 250ms for 20 seconds
  // and the gate deletes itself once someone is through.
  buildGate()

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
