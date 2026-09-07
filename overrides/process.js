/*
 * The 5-step process section, rebuilt as a scroll-driven stage.
 *
 * Injected by build/serve.mjs so mirror/ stays a byte-faithful clone. To move
 * it to WordPress: this file into a footer snippet (Elementor -> Custom Code),
 * process.css into Site Settings -> Custom CSS, and the five images into the
 * media library with SHOTS below repointed at them.
 *
 * The step text is read out of the markup Elementor already renders rather than
 * hard-coded here, so an edit in Elementor still drives this. Nothing is
 * written that was not already on the page -- see process.css for why the stage
 * is fixed rather than sticky.
 */
(function () {
  'use strict'

  /* Artwork, one per step, in step order. Isometric renders rather than
     photographs on purpose: the site already carries real photographs of the
     actual crew and their actual jobs, and a synthetic photograph of "a roofer"
     sitting among them would read as a claim about this company's work. An
     obvious illustration claims nothing. */
  var SHOTS = [
    '/_assets/process-01-call.webp',
    '/_assets/process-02-appointment.webp',
    '/_assets/process-03-estimate.webp',
    '/_assets/process-04-pre-production.webp',
    '/_assets/process-05-roofing.webp',
  ]

  var ALTS = [
    'Illustration of a phone call starting a roofing enquiry',
    'Illustration of a calendar and checklist for a roofing appointment',
    'Illustration of a written roofing estimate and roof plan',
    'Illustration of shingle bundles and materials ready for delivery',
    'Illustration of a pitched roof part-way through being shingled',
  ]

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  /** Wrap each character in a span carrying its index, for the staggered rise. */
  function chars(text) {
    var out = ''
    for (var i = 0; i < text.length; i++) {
      out += '<span class="itlr-proc__ch" style="--i:' + i + '">' + esc(text.charAt(i)) + '</span>'
    }
    return out
  }

  /** Read the five steps out of the Elementor columns. */
  function readSteps(sec) {
    var cols = sec.querySelectorAll('.process-col')
    var steps = []
    for (var i = 0; i < cols.length; i++) {
      var num = cols[i].querySelector('.process-num')
      var title = cols[i].querySelector('.elementor-icon-box-title')
      var desc = cols[i].querySelector('.elementor-icon-box-description')
      if (!title || !desc) continue
      steps.push({
        num: num ? num.textContent.trim() : ('0' + (i + 1)),
        title: title.textContent.trim(),
        desc: desc.textContent.trim(),
      })
    }
    return steps
  }

  function build(sec, steps) {
    var n = steps.length
    var cards = ''
    var shots = ''
    var rail = ''
    for (var i = 0; i < n; i++) {
      cards += '<li class="itlr-proc__card" data-i="' + i + '"' + (i === 0 ? ' data-active="true"' : '') + '>'
        // Once the stage covers the viewport the section's own heading is off
        // screen, so the kicker keeps it clear what these five cards are. It
        // restates the heading Elementor already renders rather than adding a
        // new claim.
        + '<p class="itlr-proc__kicker">Our 5-step roofing process</p>'
        + '<div class="itlr-proc__eyebrow">'
        + '<span class="itlr-proc__num">' + esc(steps[i].num) + '</span>'
        + '<span class="itlr-proc__step-of">Step ' + (i + 1) + ' of ' + n + '</span>'
        + '</div>'
        + '<h3 class="itlr-proc__title">' + chars(steps[i].title) + '</h3>'
        + '<p class="itlr-proc__desc">' + esc(steps[i].desc) + '</p>'
        + '</li>'
      shots += '<div class="itlr-proc__shot" data-i="' + i + '">'
        + '<img src="' + esc(SHOTS[i] || SHOTS[0]) + '" alt="' + esc(ALTS[i] || '') + '"'
        + ' width="1100" height="825" loading="lazy" decoding="async"></div>'
      rail += '<button type="button" class="itlr-proc__railitem" data-i="' + i + '"'
        + ' aria-label="Go to step ' + (i + 1) + ': ' + esc(steps[i].title) + '">'
        + '<span class="itlr-proc__railbar"></span>'
        + '<span class="itlr-proc__raillabel">' + esc(steps[i].num) + '</span>'
        + '</button>'
    }

    var track = '<div class="itlr-proc__intro"></div>'
    for (var s = 0; s < n; s++) track += '<div class="itlr-proc__step" data-i="' + s + '"></div>'
    track += '<div class="itlr-proc__tail"></div>'

    var root = document.createElement('div')
    root.className = 'itlr-proc'
    root.innerHTML =
      '<div class="itlr-proc__layer" data-visible="false">'
        + '<div class="itlr-proc__inner">'
          + '<ol class="itlr-proc__cards">' + cards + '</ol>'
          + '<div class="itlr-proc__stack">' + shots + '</div>'
        + '</div>'
        + '<div class="itlr-proc__rail">' + rail + '</div>'
      + '</div>'
      + '<div class="itlr-proc__track">' + track + '</div>'

    sec.parentNode.insertBefore(root, sec)
    // The original grid carries the same five headings and sentences. It is
    // removed only once the replacement is in the document, so a failure above
    // leaves Elementor's section exactly as it was.
    sec.style.display = 'none'
    sec.setAttribute('aria-hidden', 'true')
    return root
  }

  /* Frame-rate-independent approach: current moves a fixed fraction of the
     remaining distance per second, so the reel settles the same way on a 60Hz
     and a 144Hz screen. */
  function lerp(current, target, dt, rate) {
    return current + (target - current) * Math.min(1, dt * rate)
  }

  function smoothstep(x, a, b) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }

  function wire(root, n) {
    var layer = root.querySelector('.itlr-proc__layer')
    var track = root.querySelector('.itlr-proc__track')
    var steps = root.querySelectorAll('.itlr-proc__step')
    var cards = root.querySelectorAll('.itlr-proc__card')
    var shotEls = root.querySelectorAll('.itlr-proc__stack .itlr-proc__shot')
    var railEls = root.querySelectorAll('.itlr-proc__railitem')
    var active = 0
    var u = 0            // smoothed, continuous position across the steps
    var running = false
    var last = 0

    function setActive(i) {
      if (i === active) return
      active = i
      for (var c = 0; c < cards.length; c++) {
        if (c === i) cards[c].setAttribute('data-active', 'true')
        else cards[c].removeAttribute('data-active')
      }
      for (var r = 0; r < railEls.length; r++) {
        if (r === i) railEls[r].setAttribute('data-active', 'true')
        else railEls[r].removeAttribute('data-active')
        if (r < i) railEls[r].setAttribute('data-done', 'true')
        else railEls[r].removeAttribute('data-done')
      }
    }

    // One observer over all five spacers. The -50%/-50% root margin collapses
    // the viewport to its centre line, so exactly one spacer can be
    // intersecting at a time -- and because it is a margin rather than a
    // threshold, it fires going back up as well.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        for (var e = 0; e < entries.length; e++) {
          if (entries[e].isIntersecting) setActive(+entries[e].target.getAttribute('data-i'))
        }
      }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 })
      for (var s = 0; s < steps.length; s++) io.observe(steps[s])
    }

    function place(dt) {
      var r = track.getBoundingClientRect()
      var vh = window.innerHeight
      // The stage is only shown while the runway covers the viewport, so it can
      // never paint over the sections either side of it.
      var covering = r.top <= 0 && r.bottom >= vh
      layer.setAttribute('data-visible', covering ? 'true' : 'false')

      var first = steps[0].getBoundingClientRect()
      var stepPx = first.height || vh
      // Measured against the same centre line the observer uses, so the reel
      // and the lit card can never disagree about which step is current: this
      // reads exactly i when step i is centred on the line. Deriving it from
      // the first step rather than the track start also means the lead-in
      // spacer needs no separate bookkeeping.
      var target = (vh / 2 - first.top) / stepPx - 0.5
      target = Math.max(0, Math.min(n - 1, target))
      // Pull the continuous value most of the way to the nearest step, so each
      // render sits still for the bulk of its runway instead of drifting the
      // whole way across. Straight from the reference's "magnet".
      var magnet = Math.round(target) - (Math.round(target) - target) * 0.42
      u = lerp(u, magnet, dt, 9)

      for (var i = 0; i < shotEls.length; i++) {
        var k = i - u
        var ak = Math.abs(k)
        var alpha = 1 - smoothstep(ak, 0.35, 1.15)
        if (alpha <= 0.004) {
          shotEls[i].style.opacity = '0'
          shotEls[i].style.visibility = 'hidden'
          continue
        }
        shotEls[i].style.visibility = 'visible'
        shotEls[i].style.opacity = String(alpha)
        shotEls[i].style.zIndex = String(100 - Math.round(ak * 10))
        shotEls[i].style.transform =
          'translate3d(' + (k * 7).toFixed(2) + '%,' + (k * -9).toFixed(2) + '%,' + (-ak * 130).toFixed(1) + 'px)'
          + ' rotateY(' + (k * -9).toFixed(2) + 'deg)'
          + ' scale(' + (1 - Math.min(1, ak) * 0.08).toFixed(3) + ')'
      }
    }

    function frame(t) {
      if (!running) return
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016
      last = t
      place(dt)
      requestAnimationFrame(frame)
    }

    // The loop only runs while the section is anywhere near the viewport;
    // a marketing homepage should not hold a rAF open for the whole visit.
    function start() { if (!running) { running = true; last = 0; requestAnimationFrame(frame) } }
    function stop() { running = false }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) start(); else { stop(); layer.setAttribute('data-visible', 'false') }
      }, { rootMargin: '150% 0px 150% 0px' }).observe(track)
    } else {
      start()
    }

    for (var b = 0; b < railEls.length; b++) {
      railEls[b].addEventListener('click', function () {
        var i = +this.getAttribute('data-i')
        var top = track.getBoundingClientRect().top + window.pageYOffset
        var stepPx = steps[0].getBoundingClientRect().height
        window.scrollTo({ top: top + i * stepPx + stepPx / 2 - window.innerHeight / 2 + 1, behavior: 'smooth' })
      })
    }

    setActive(0)
    railEls[0] && railEls[0].setAttribute('data-active', 'true')
    place(0.016)
  }

  /** Small screens get the same markup laid out as a plain list -- move each
   *  render into its own card, since the stacked reel is hidden there. */
  function inlineShotsForNarrow(root) {
    var cards = root.querySelectorAll('.itlr-proc__card')
    var shots = root.querySelectorAll('.itlr-proc__stack .itlr-proc__shot')
    for (var i = 0; i < cards.length && i < shots.length; i++) {
      cards[i].appendChild(shots[i].cloneNode(true))
    }
  }

  function init() {
    var sec = document.querySelector('.our-process')
    if (!sec || sec.getAttribute('data-itlr-proc') === 'done') return false
    var steps = readSteps(sec)
    if (steps.length < 3) return false
    sec.setAttribute('data-itlr-proc', 'done')

    var root = build(sec, steps)
    inlineShotsForNarrow(root)

    var narrow = window.matchMedia('(max-width: 1024px)').matches
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // On a phone, or for someone who asked for less motion, the CSS already
    // lays this out as a static list. Wiring the runway would only add a
    // rAF loop with nothing to drive.
    if (!narrow && !reduced) wire(root, steps.length)
    return true
  }

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
