/*
 * "Contact Our Roofing Team" -- the crew carousel rebuilt as a photo stack.
 *
 * Injected by build/serve.mjs so mirror/ stays a byte-faithful clone. To move
 * it to WordPress: this file into a footer snippet (Elementor -> Custom Code)
 * and team.css into Site Settings -> Custom CSS.
 *
 * Only the carousel widget is replaced. The section's <h2> is a sibling of it,
 * not a child, so it stays exactly where it was.
 */
(function () {
  'use strict'

  /* Names for the crew, in the order the portraits appear.
   *
   * DELIBERATELY EMPTY. The card design has a caption slot and it looks better
   * filled -- but this repository does not contain the crew's names. The
   * carousel slides are bare Elementor containers with the portrait set as a
   * CSS background: no <img>, no alt text, no caption, and content/media.json
   * gives every one of these files an empty alt and a title that is just the
   * camera filename (SEMI7900, SEMI8023 ...). The repo's own history confirms
   * it: the commit that removed a former employee's portraits had to open all
   * twelve photographs to work out which ones were his, because there was no
   * name metadata to go on.
   *
   * First names do appear in customer reviews -- Luis, Keylor, John, Mike,
   * Juan, Adam -- but nothing ties any of them to a face, and guessing which
   * photograph is which person is exactly the kind of invention that has no
   * place on a real business's website.
   *
   * Fill this in with the five real names, in portrait order, and the caption
   * row appears by itself. Anything left blank simply renders no caption.
   */
  var CREW_NAMES = []

  /* Portraits belonging to a former employee. overrides.js already removes his
   * slides and overrides.css nulls his background, so he should never reach
   * this code -- but this rebuilds the section from whatever portraits it
   * finds, and a filename check costs nothing next to the cost of putting a
   * man who no longer works here back on the homepage. */
  var NEVER_USE = /SEMI7879|SEMI7885/i

  /* The owner's portrait.
   *
   * At rest the pile shows one face, and it should be the man who owns the
   * company rather than whichever slide Elementor happens to emit first.
   *
   * Identified rather than guessed. SEMI7900 is the same man as
   * owner-headshot.png, which the founder section on the homepage and About Us
   * captions "Bryson Berard, Owner": same glasses, same beard, same black Nike
   * jacket with the striped collar and cuffs, same shoot. That caption is the
   * only place on the whole site where a name and a face are tied together --
   * see CREW_NAMES above for why none of the others can be. */
  var OWNER = /SEMI7900/i

  /* Right-sized copies of the portraits.
   *
   * The originals are 1366x2048 and 93-211 KB each; a card here shows them at
   * about 180 px wide. tools/make-derivatives.mjs writes a 420 px WebP of each
   * of the five current portraits to overrides/assets/derived/team/ (served
   * at /_assets/derived/team/<yyyy>-<mm>-<name>-420.webp), and the publish
   * pass points the carousel's CSS at the same files so the originals are
   * never fetched. This mapping covers the dev server, where the CSS is not
   * rewritten, and any portrait the pass missed. Only these five have a
   * derivative; anything else -- and anything matching NEVER_USE -- keeps
   * the URL it came with, and a derivative that fails to load falls back to
   * the original (see build()). */
  var TEAM_DERIVED = ['SEMI7900', 'SEMI7949', 'SEMI7953', 'SEMI8001', 'SEMI8023']
  var DERIVED_WIDTH = 420

  function derivative(url) {
    if (NEVER_USE.test(url)) return null
    var m = String(url).match(/\/assets\/(\d{4})\/(\d{2})\/(SEMI\d+)\.(?:jpe?g|png)(?:\.webp)?(?:[?#].*)?$/i)
    if (!m || TEAM_DERIVED.indexOf(m[3].toUpperCase()) === -1) return null
    return '/_assets/derived/team/' + m[1] + '-' + m[2] + '-' + m[3].toUpperCase() + '-' + DERIVED_WIDTH + '.webp'
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  /** The section carrying the crew carousel, found by its heading. */
  function findTeamSection() {
    var secs = document.querySelectorAll('.elementor-element')
    for (var i = 0; i < secs.length; i++) {
      var h = secs[i].querySelector('h1, h2, h3, h4')
      if (!h || !/contact\s+our[\s\S]{0,20}team/i.test(h.textContent)) continue
      if (secs[i].querySelector('.swiper-slide')) return secs[i]
    }
    return null
  }

  /**
   * Read the portraits out of the carousel.
   *
   * They are CSS background images on a container inside each slide, not <img>
   * elements, so the computed style is the only place to get them. Reading them
   * rather than hard-coding a list means a portrait swapped in Elementor still
   * flows through, and it inherits the former-employee suppression for free:
   * overrides.css sets `background-image: none` on his element, so he resolves
   * to nothing here and is skipped.
   */
  function readPortraits(sec) {
    var slides = sec.querySelectorAll('.swiper-slide')
    var out = []
    var seen = {}
    for (var i = 0; i < slides.length; i++) {
      var kids = slides[i].querySelectorAll('*')
      for (var k = 0; k < kids.length; k++) {
        var bg = window.getComputedStyle(kids[k]).backgroundImage
        if (!bg || bg === 'none') continue
        var m = bg.match(/url\(["']?(.*?)["']?\)/)
        if (!m) continue
        var url = m[1]
        if (NEVER_USE.test(url)) break          // former employee: skip the slide
        if (seen[url]) break                    // Swiper's loop clones each slide
        seen[url] = 1
        out.push(url)
        break
      }
    }
    return out
  }

  /**
   * Put the owner at the front of the pile.
   *
   * A swap, not a rotation: he takes the front and whoever held it takes his
   * old place, so the other three portraits keep the positions they had. The
   * fan is shuffled on every hover anyway (see scatter), so this only decides
   * the resting card -- which is the one that matters, because it is the single
   * face anyone sees before they interact with the section at all.
   *
   * If the portrait is ever renamed or replaced, nothing here breaks: the list
   * simply keeps the order it was read in.
   */
  function ownerFirst(list) {
    for (var i = 1; i < list.length; i++) {
      if (!OWNER.test(list[i])) continue
      var swap = list[0]
      list[0] = list[i]
      list[i] = swap
      break
    }
    return list
  }

  function build(widget, portraits) {
    var cards = ''
    for (var i = 0; i < portraits.length; i++) {
      var name = CREW_NAMES[i] ? String(CREW_NAMES[i]).trim() : ''
      var small = derivative(portraits[i])
      cards += '<button type="button" class="itlr-team__card" data-i="' + i + '"'
        + ' aria-label="' + (name ? esc(name) : 'Crew member ' + (i + 1)) + '">'
        + '<span class="itlr-team__photo">'
        + '<img src="' + esc(small || portraits[i]) + '"'
        + (small ? ' data-itlr-original="' + esc(portraits[i]) + '"' : '')
        + ' alt="' + (name ? esc(name) + ', In The Light Roofing' : '') + '"'
        + ' loading="lazy" decoding="async"></span>'
        + (name ? '<span class="itlr-team__name">' + esc(name) + '</span>' : '')
        + '</button>'
    }

    var root = document.createElement('div')
    root.className = 'itlr-team'
    root.setAttribute('data-spread', 'false')
    root.innerHTML =
      '<div class="itlr-team__stage">' + cards + '</div>'
      // No CTA here: the section already ends with an Elementor "Contact Us Now"
      // button linking to /contact/, so adding one would duplicate it.
      + '<div class="itlr-team__actions">'
        + '<p class="itlr-team__hint">Hover to fan the crew out</p>'
      + '</div>'

    widget.parentNode.insertBefore(root, widget)
    widget.style.display = 'none'
    widget.setAttribute('aria-hidden', 'true')

    // A derivative that is missing (not generated yet, or renamed) must not
    // leave a broken card: fall back to the original, once.
    var imgs = root.querySelectorAll('img[data-itlr-original]')
    for (var k = 0; k < imgs.length; k++) {
      imgs[k].addEventListener('error', function () {
        var orig = this.getAttribute('data-itlr-original')
        if (!orig) return
        this.removeAttribute('data-itlr-original')
        this.src = orig
      })
    }
    return root
  }

  /**
   * Scatter the cards without letting any two seriously cover each other.
   *
   * The original picks random positions and retries on collision. That is a
   * rejection sampler, and with five cards in a 1170px stage the last one
   * regularly runs out of attempts and gets placed on top of a neighbour --
   * measured at roughly one layout in five, and the fallback is "keep the
   * overlapping attempt", so it shows.
   *
   * Instead the stage is divided into one slot per card and each card is
   * jittered inside its own slot, which cannot overlap by construction. The
   * cards are shuffled into the slots, so the arrangement still changes on
   * every hover -- it is the order that is random rather than the position.
   * Vertical offset and rotation stay free, which is where the scattered look
   * actually comes from.
   *
   * The original spreads in vw/vh across a full-screen hero; this lives inside
   * a section, so everything is measured from the stage box in pixels.
   */
  function scatter(stage, cards) {
    var box = stage.getBoundingClientRect()
    var cw = cards[0].offsetWidth || 200
    var ch = cards[0].offsetHeight || 264
    var n = cards.length
    // The section is a height-constrained flex column whose items deliberately
    // overlap -- that is how the outlined heading sits behind the portraits.
    // The "Contact Us Now" button is one of those items and lands in the bottom
    // ~55px of this box, so the fan is kept clear of that band and biased
    // slightly upward. Measured, not guessed: without this two cards cover the
    // button on most layouts.
    var BUTTON_BAND = 60
    var LIFT = 10
    var padY = Math.max(0, Math.min((box.height - ch) / 2 - 8, (box.height - ch) / 2 - BUTTON_BAND + LIFT))
    var span = Math.max(cw * n, box.width - cw - 16)   // total x travel available
    var slot = span / n
    // Keep adjacent cards at least 82% of a card apart, the same threshold the
    // old collision test used; whatever slack the slot has left over becomes
    // jitter.
    var jitter = Math.max(0, (slot - cw * 0.82) / 2)

    var order = []
    for (var i = 0; i < n; i++) order.push(i)
    for (var a = n - 1; a > 0; a--) {                  // Fisher-Yates
      var b2 = Math.floor(Math.random() * (a + 1))
      var tmp = order[a]; order[a] = order[b2]; order[b2] = tmp
    }

    var out = new Array(n)
    for (var k = 0; k < n; k++) {
      var cardIndex = order[k]
      var centre = -span / 2 + slot * (k + 0.5)
      var x = centre + (Math.random() * 2 - 1) * jitter
      var y = -LIFT + (Math.random() * 2 - 1) * padY
      var r = (Math.random() * 2 - 1) * 9
      out[cardIndex] = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + r.toFixed(1) + 'deg)'
    }
    return out
  }

  function wire(root) {
    var stage = root.querySelector('.itlr-team__stage')
    var cards = [].slice.call(root.querySelectorAll('.itlr-team__card'))
    if (!cards.length) return
    var n = cards.length
    var top = 0
    var spread = false
    var spreadTransforms = []
    var picking = false

    // Resting pile: each card sits a little lower and a little smaller than the
    // one above it, with a fixed lean so the stack reads as physical.
    var LEAN = [-3, 2.5, -1.5, 4, -4.5]

    function apply() {
      for (var i = 0; i < n; i++) {
        var depth = (i - top + n) % n
        var t
        if (spread) {
          t = spreadTransforms[i] || 'translate(0,0)'
        } else {
          t = 'translateY(' + (depth * 7) + 'px) scale(' + (1 - depth * 0.05).toFixed(3) + ')'
            + ' rotate(' + (depth === 0 ? 0 : LEAN[depth % LEAN.length]) + 'deg)'
        }
        cards[i].style.setProperty('--itlr-t', t)
        cards[i].style.transform = t
        cards[i].style.zIndex = String(spread ? 50 : n - depth)
      }
    }

    function open() {
      if (spread || picking) return
      spread = true
      spreadTransforms = scatter(stage, cards)
      root.setAttribute('data-spread', 'true')
      apply()
    }

    function close() {
      if (picking) return
      spread = false
      root.setAttribute('data-spread', 'false')
      apply()
    }

    root.addEventListener('mouseenter', open)
    root.addEventListener('mouseleave', close)

    for (var c = 0; c < n; c++) {
      (function (idx) {
        var card = cards[idx]
        card.addEventListener('click', function () {
          if (!spread) { top = idx; apply(); return }
          // Spin the chosen card, then collapse the pile with it on top.
          picking = true
          card.setAttribute('data-picked', 'true')
          card.style.zIndex = '200'
          setTimeout(function () {
            card.removeAttribute('data-picked')
            picking = false
            top = idx
            spread = false
            root.setAttribute('data-spread', 'false')
            apply()
          }, 700)
        })
        // Keyboard: tabbing into the pile opens it, so the cards behind the top
        // one are reachable rather than being a decorative heap.
        card.addEventListener('focus', open)
      })(c)
    }

    // A card leaving the stage on resize would strand it off-centre.
    var t
    window.addEventListener('resize', function () {
      clearTimeout(t)
      t = setTimeout(function () { if (spread) { spreadTransforms = scatter(stage, cards); apply() } }, 180)
    })

    apply()
  }

  function init() {
    var sec = findTeamSection()
    if (!sec || sec.getAttribute('data-itlr-team') === 'done') return false
    var sw = sec.querySelector('.swiper, .swiper-container')
    var widget = sw && (sw.closest('[data-widget_type]') || sw.closest('.elementor-widget'))
    if (!widget) return false

    var portraits = ownerFirst(readPortraits(sec))
    // Below three and this is not the crew carousel, or the backgrounds have
    // not resolved yet. Either way, leave Elementor's carousel alone.
    if (portraits.length < 3) return false

    sec.setAttribute('data-itlr-team', 'done')
    var root = build(widget, portraits)

    var narrow = window.matchMedia('(max-width: 900px)').matches
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    var noHover = window.matchMedia('(hover: none)').matches
    // The CSS already lays these out as a plain grid; wiring the pile would
    // write inline transforms that fight it.
    if (!narrow && !reduced && !noHover) wire(root)
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
