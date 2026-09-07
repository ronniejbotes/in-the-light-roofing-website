/*
 * Late loading for third-party scripts that have no business on the critical
 * path -- the chat widget, reCAPTCHA, the Trustindex loader, CleanTalk's bot
 * detector. build/seo/perf.mjs turns their <script> tags into inert
 * placeholders at publish time (type="text/plain" data-itlr-defer="1", every
 * other attribute kept); this file wakes them once the page has loaded and
 * the browser is idle, or on the first interaction, whichever comes first.
 *
 * Injected by build/serve.mjs and baked in by build/publish.mjs, before
 * overrides.js. CallRail's number swap and Google Tag Manager are never
 * touched: one is the phone number a customer dials, the other is how the
 * client knows the phone rang.
 *
 * Without JavaScript the placeholders stay inert and take no space -- a
 * <script> element has no box -- so nothing about the layout depends on this
 * file running.
 */
(function () {
  'use strict'

  var SELECTOR = 'script[data-itlr-defer]'
  var IDLE_FALLBACK_MS = 2500

  /**
   * Replace one placeholder with a live <script> carrying the same attributes.
   * The element is recreated rather than retyped: changing `type` on a script
   * that has already been parsed does not make the browser run it.
   */
  function wake(ph) {
    if (!ph || !ph.parentNode || ph.getAttribute('data-itlr-woken') === '1') return
    ph.setAttribute('data-itlr-woken', '1')
    var s = document.createElement('script')
    for (var i = 0; i < ph.attributes.length; i++) {
      var a = ph.attributes[i]
      if (a.name === 'type' || a.name === 'data-itlr-defer' || a.name === 'data-itlr-woken') continue
      if (a.name === 'src') continue           // set last, after the other attributes are in place
      s.setAttribute(a.name, a.value)
    }

    /*
     * The chat widget's embed.js does all its work from `window.onload = ...`.
     * Loaded after the page's load event -- which is the whole idea here --
     * that handler would never run and the widget would never appear
     * (measured: script present, no iframe, no button, 20 s). So when the
     * page has already loaded, a load handler the script has just assigned
     * is called once by hand. Only a NEW handler: one that was there before
     * the script ran has already had its load event.
     */
    var before = window.onload
    s.addEventListener('load', function () {
      if (document.readyState !== 'complete') return          // the real load event will do it
      var fn = window.onload
      if (typeof fn !== 'function' || fn === before) return
      try { fn.call(window, new Event('load')) } catch (e) { /* the script's own problem */ }
    })

    // A dynamically inserted script is async by nature; `defer` on it is
    // meaningless but harmless, and these four do not depend on each other.
    s.src = ph.getAttribute('src')
    ph.parentNode.insertBefore(s, ph)
    ph.parentNode.removeChild(ph)
  }

  function wakeAll(filter) {
    var list = document.querySelectorAll(SELECTOR)
    for (var i = 0; i < list.length; i++) {
      if (filter && !filter(list[i])) continue
      wake(list[i])
    }
  }

  var done = false
  function wakeEverything() {
    if (done) return
    done = true
    wakeAll(null)
    unlisten()
  }

  /* --- triggers ---------------------------------------------------------- */

  var EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart']
  function listen() {
    for (var i = 0; i < EVENTS.length; i++) {
      window.addEventListener(EVENTS[i], wakeEverything, { passive: true, capture: true })
    }
  }
  function unlisten() {
    for (var i = 0; i < EVENTS.length; i++) {
      window.removeEventListener(EVENTS[i], wakeEverything, { passive: true, capture: true })
    }
  }

  function afterLoad() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(wakeEverything, { timeout: IDLE_FALLBACK_MS })
    } else {
      setTimeout(wakeEverything, IDLE_FALLBACK_MS)
    }
  }

  listen()
  if (document.readyState === 'complete') afterLoad()
  else window.addEventListener('load', afterLoad)

  /*
   * reCAPTCHA gets one extra, earlier trigger: someone starting to fill in a
   * form. No form on the site has a captcha field today, but if one is added
   * in Forminator the API has to be present before the field is rendered, and
   * focus landing in a form is the earliest sign that matters.
   */
  document.addEventListener('focusin', function (e) {
    var t = e.target
    if (!t || !t.closest || !t.closest('form')) return
    wakeAll(function (ph) { return /recaptcha/i.test(ph.getAttribute('src') || '') })
  }, { passive: true, capture: true })
})()
