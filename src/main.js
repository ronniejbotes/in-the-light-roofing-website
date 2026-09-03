import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/chrome.css'
import './styles/pages.css'
import './styles/motion.css'

import { initReveal } from './scripts/reveal.js'
import { initHeader } from './scripts/header.js'
import { initAccordion } from './scripts/accordion.js'
import { initCarousel } from './scripts/carousel.js'
import { initVideo } from './scripts/video.js'
import { initForms } from './scripts/forms.js'
import { initToTop } from './scripts/to-top.js'
import { initThirdParty } from './scripts/third-party.js'

const boot = () => {
  initHeader()
  initReveal()
  initAccordion()
  initCarousel()
  initVideo()
  initForms()
  initToTop()
  initThirdParty()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
