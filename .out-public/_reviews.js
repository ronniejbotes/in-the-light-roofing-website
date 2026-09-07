const REVIEWS = [
  {
    "name": "Lynn Miller",
    "date": "18 September 2025",
    "text": "We would highly recommend In the Light Roofing for anyone needing help with roofing issues. We needed repairs to our roof & they promptly came out for an estimate. They did the work the same day which was awesome since we have closing on our house in 11 days. They’re very professional & kind as well!"
  },
  {
    "name": "Robert Uhl",
    "date": "13 September 2025",
    "text": "In The Light Roofing did a great job. Had a little bit of a water leak, they were able to come out the day after I called to get it taken care of. Very happy with the work and timeliness of the repair. Highly recommend!"
  },
  {
    "name": "Jay Sabo",
    "date": "26 August 2025",
    "text": "In the Light Roofing is top quality. From their sales rep John R. to their project manager Mike and to their talented team of roofers they were able to answer questions and complete our roof with 6 shed dormers and a 1,000 square foot porch roof in less than 3 days. And the work was high quality!"
  },
  {
    "name": "Andrew Brensinger",
    "date": "5 September 2025",
    "text": "Keylor did a great job repairing my soffit after some critters decided to chew and build a nest. Thanks again for the follow up visit just to make sure everything was right. I am a satisfied customer. I would like to also note that they came and did my repair the same day, which was fantastic!"
  },
  {
    "name": "Dustin Victory",
    "date": "26 September 2025",
    "text": "Could not say better thing very professional very clean and just great over all Keylor Gomez was very helpful and knowledgeable and was always there if I had a question or concern would 10 /10 recommend this company"
  },
  {
    "name": "D K",
    "date": "21 August 2025",
    "text": "Professional, efficient, skilled, and quality oriented are four words to best describe our decision to trust In the Light roofing to work on our roofs. From the start Juan represented In the Light professionally and totally showed me why the work had to be done to include video and pictures. Juan and I spoke often and he was at our house no less than half a dozen times so without the project. Juan was a big factor in choosing in the Light. roofing I also got the meet or speak to several key people in their company to include the owner. The price I paid was fair and the quality was obvious especially when we looked at the skilled staff members working on our property and how efficient they were. They use quality and insured materials. We even bought them a pizza lunch. Clean up met our expectations my a few pieces of debris on the driveway and bushes. We kept our schedule and even agreed on an alternative day because of the extreme heat and rainfall. They even delivered a very large dumpster to this property so they made sure everything was under control and not spread out all over the place. Two days and done !Bottom line- we would recommend in the Light roofing or your Roofing needs. Dennis& Susan"
  },
  {
    "name": "SANJAY ANDERSON",
    "date": "19 August 2025",
    "text": "The Team was professional and timely with their work. Sales person did a fantastic job explaining everything, including the materials that will be used and warranties."
  },
  {
    "name": "Janet Knecht",
    "date": "16 August 2025",
    "text": "I was caught off guard by this need for a roof. They helped me through the process and the trauma. Huge job. Very professional and personable."
  },
  {
    "name": "Jean Charles",
    "date": "7 October 2025",
    "text": "They are doing a perfect job to my house. They worked to my neighborhood. I contacted John, and talked about the situation. He came over to my house."
  }
];

/*
 * Replaces the Trustindex widget under the hero with a 3D testimonial marquee.
 *
 * WHY THIS IS NOT THE REACT COMPONENT
 * The component supplied is React + shadcn/ui + Tailwind + TypeScript. This
 * project is none of those: no react, no tailwind config, no tsconfig, no
 * components.json, and a build that is Vite bundling plain JS and CSS. Adding
 * React and Tailwind so one section can render would mean a build pipeline,
 * a component library and a type system for a static WordPress mirror. The
 * geometry, the alternating vertical marquees, the pause-on-hover and the edge
 * gradients are ported to plain CSS in overrides/reviews.css instead, which is
 * also what makes it pasteable into WordPress.
 *
 * THE REVIEWS ARE REAL
 * All nine are lifted verbatim from the Google feed the live site already runs,
 * captured to overrides/reviews.json. Nothing is written, trimmed or improved.
 * Names, dates and wording are the customers' own, typos included.
 *
 * NO REVIEW SCHEMA IS EMITTED, DELIBERATELY. Review or aggregateRating markup
 * on a business's own pages makes the whole domain ineligible for review rich
 * results. These are plain HTML; the stars belong to the Business Profile.
 */
;(function () {
  'use strict'

  var COLUMNS = 4

  function initials(name) {
    var parts = String(name).trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  function card(r) {
    var el = document.createElement('figure')
    el.className = 'itlr-review'

    var head = document.createElement('div')
    head.className = 'itlr-review__head'

    var av = document.createElement('div')
    av.className = 'itlr-review__avatar'
    av.setAttribute('aria-hidden', 'true')
    av.textContent = initials(r.name)

    var meta = document.createElement('div')
    var nm = document.createElement('figcaption')
    nm.className = 'itlr-review__name'
    nm.textContent = r.name
    var dt = document.createElement('p')
    dt.className = 'itlr-review__date'
    dt.textContent = r.date + ' · Google'
    meta.appendChild(nm); meta.appendChild(dt)

    head.appendChild(av); head.appendChild(meta)

    var stars = document.createElement('div')
    stars.className = 'itlr-review__stars'
    stars.textContent = '★★★★★'
    stars.setAttribute('aria-label', '5 out of 5')

    var q = document.createElement('blockquote')
    q.className = 'itlr-review__body'
    q.textContent = r.text

    el.appendChild(head); el.appendChild(stars); el.appendChild(q)
    return el
  }

  function build() {
    var wrap = document.createElement('div')
    wrap.className = 'itlr-reviews'

    var stage = document.createElement('div')
    stage.className = 'itlr-reviews__stage'

    for (var c = 0; c < COLUMNS; c++) {
      var col = document.createElement('div')
      col.className = 'itlr-reviews__col' + (c % 2 ? ' itlr-reviews__col--reverse' : '')
      // Offset each column so they do not read as four copies of one list.
      var rotated = REVIEWS.slice(c * 2).concat(REVIEWS.slice(0, c * 2))
      // Twice through: the keyframe travels exactly half the track, so the loop
      // is seamless without cloning nodes at runtime.
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 0; i < rotated.length; i++) {
          var n = card(rotated[i])
          if (pass === 1) n.setAttribute('aria-hidden', 'true')
          col.appendChild(n)
        }
      }
      stage.appendChild(col)
    }

    wrap.appendChild(stage)
    ;['t', 'b', 'l', 'r'].forEach(function (s) {
      var f = document.createElement('div')
      f.className = 'itlr-reviews__fade itlr-reviews__fade--' + s
      wrap.appendChild(f)
    })

    var foot = document.createElement('p')
    foot.className = 'itlr-reviews-foot'
    var a = document.createElement('a')
    a.href = 'https://www.google.com/search?q=In+The+Light+Roofing+reviews'
    a.target = '_blank'
    a.rel = 'noopener'
    // No review count is printed. The site currently shows four different
    // totals (237, 232, 18, 39) and the Business Profile shows another; a
    // hard-coded number is what created that mess and it rots on its own.
    a.textContent = 'Read every review on Google'
    foot.appendChild(a)

    var frag = document.createDocumentFragment()
    frag.appendChild(wrap)
    frag.appendChild(foot)
    return frag
  }

  /**
   * Trustindex replaces its own .ti-widget element after it loads, which
   * destroys anything mounted inside it. So mount into the Elementor shortcode
   * wrapper that CONTAINS the widget -- that element is part of the page, not
   * of the third-party script -- and keep re-asserting, because the script may
   * inject again after we have run.
   */
  function host() {
    var heading = [].slice.call(document.querySelectorAll('h1,h2,h3'))
      .filter(function (h) { return /What Homeowners Say/i.test(h.textContent || '') })[0]
    if (!heading) return null
    var section = heading.closest('section') || heading.closest('.elementor-section')
    if (!section) return null
    return section.querySelector('.elementor-shortcode')
      || (section.querySelector('.ti-widget') || {}).parentElement
      || null
  }

  function mount() {
    var h = host()
    if (!h) return false

    // Anything Trustindex has (re)drawn goes; our own block stays.
    var stale = h.querySelectorAll('.ti-widget, [class*="ti-widget"]')
    for (var i = 0; i < stale.length; i++) stale[i].remove()

    if (h.querySelector('.itlr-reviews') && h.querySelector('.itlr-reviews-foot')) return true

    var old = h.querySelectorAll('.itlr-reviews, .itlr-reviews-foot')
    for (var j = 0; j < old.length; j++) old[j].remove()

    h.appendChild(build())
    return true
  }

  var tries = 0
  var timer = setInterval(function () {
    mount()
    if (++tries > 80) clearInterval(timer)
  }, 250)
  if (document.readyState !== 'loading') mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
