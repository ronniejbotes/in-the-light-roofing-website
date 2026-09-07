/*
 * Late loading for third-party scripts that have no business on the critical
 * path -- the chat widget, reCAPTCHA, review widgets. build/seo/perf.mjs
 * turns their <script> tags into inert placeholders at publish time; this
 * file wakes them once the page has loaded and the browser is idle, or on the
 * first interaction, whichever comes first.
 *
 * Injected by build/serve.mjs and baked in by build/publish.mjs, before
 * overrides.js. CallRail's number swap and Google Tag Manager are never
 * touched: one is the phone number a customer dials, the other is how the
 * client knows the phone rang.
 */
(function () {
  'use strict'
})()
