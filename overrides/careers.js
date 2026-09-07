/*
 * Careers: a card per open role, and Careers as its own nav item.
 *
 * Injected by build/serve.mjs so mirror/ stays a byte-faithful clone. To move
 * this to WordPress: this file into a footer snippet (Elementor -> Custom
 * Code) and careers.css into Site Settings -> Custom CSS.
 *
 * NO NEW PAGES ARE CREATED. Each role already has its own page and the
 * "Apply Now" buttons already point at it:
 *   /project-manager-bethlehem-center-valley/
 *   /roof-repair-technician-bethlehem-center-valley/
 *   /outside-sales-representative-bethlehem-center-valley/
 *   /inside-sales-representative-bethlehem-center-valley/
 * All four return 200. The cards link to those existing URLs rather than
 * inventing new ones, so nothing gets a competing duplicate or needs a
 * redirect later.
 *
 * EVERY FACT ON A CARD IS READ OFF THE PAGE. Nothing about a job is inferred:
 * these are real vacancies and an invented requirement or a made-up salary is
 * not a cosmetic error. Pay is stated nowhere on the page, so no card shows
 * pay. "Full-time" is only shown because the Open Positions intro says "All
 * positions offer full-time hours" -- and only if that sentence is still there.
 */
(function () {
  'use strict'

  /** Roles are matched on their own headings, not on generated element ids. */
  var JOB_RE = /(Project Manager|Roof Repair Technician|Outside Sales Representative|Inside Sales Representative)/i

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  /**
   * Years of experience, taken from the role's own qualification bullets.
   *
   * The four listings phrase this three different ways -- "3 years of...",
   * "At least 2 years of...", "1 to 2 years in..." -- so each is matched on its
   * own terms rather than normalised into a house style that would overstate
   * one of them. Outside Sales states that experience is required but gives no
   * duration, so it says exactly that.
   */
  function experienceFrom(quals) {
    for (var i = 0; i < quals.length; i++) {
      var q = quals[i]
      var m = q.match(/(\d+)\s*(?:to|–|-)\s*(\d+)\s*years?/i)
      if (m) return m[1] + '–' + m[2] + ' years'
      m = q.match(/at\s+least\s+(\d+)\s*years?/i)
      if (m) return m[1] + '+ years'
      m = q.match(/(\d+)\s*years?/i)
      if (m) return m[1] + ' years'
    }
    for (var j = 0; j < quals.length; j++) {
      if (/experience/i.test(quals[j])) return 'Experience required'
    }
    return ''
  }

  /** A simple mark per role. Decorative only, so it is aria-hidden. */
  var ICONS = {
    'project manager':
      '<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="17" r="3"/>',
    'roof repair technician':
      '<path d="M3 12l9-7 9 7"/><path d="M6 11v8h12v-8"/><path d="M10 19v-4h4v4"/>',
    'outside sales representative':
      '<circle cx="12" cy="10" r="3"/><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"/>',
    'inside sales representative':
      '<path d="M4 5h16v11H8l-4 4z"/><path d="M9 10h6"/>',
  }

  function iconFor(title) {
    var t = String(title).toLowerCase()
    for (var k in ICONS) if (t.indexOf(k) > -1) return ICONS[k]
    return ICONS['inside sales representative']
  }

  /** Read one role out of its section. */
  function readJob(h) {
    var sec = h.closest('.elementor-top-section, .elementor-section, .e-con-parent')
    if (!sec) return null

    var full = h.textContent.replace(/\s+/g, ' ').trim()
    // "Project Manager – Bethlehem / Center Valley" -> role, then where.
    var parts = full.split(/\s*[–—-]\s*/)
    var role = parts[0].trim()
    var where = parts.length > 1 ? parts.slice(1).join(' - ').trim() : ''

    var quals = []
    var lis = sec.querySelectorAll('li')
    for (var i = 0; i < lis.length; i++) {
      var t = lis[i].textContent.replace(/\s+/g, ' ').trim()
      if (t) quals.push(t)
    }

    var apply = null
    var as = sec.querySelectorAll('a[href]')
    for (var a = 0; a < as.length; a++) {
      var href = as[a].getAttribute('href') || ''
      if (href && href !== '#' && href.indexOf('/careers') !== 0 && /^\//.test(href)) { apply = href; break }
    }

    // What to hide is not always what to read from. Three of the four listings
    // put their heading straight into a top-level section; the fourth nests it
    // in an inner one, so the nearest-section rule above hid the inner block
    // and left the top-level section standing -- empty, but still drawing its
    // own padding as a gap between Our Culture and How to Apply. Hide the
    // outermost section that holds this role and no other.
    var hide = sec
    var top = h.closest('.elementor-top-section')
    if (top) {
      var others = 0
      var hs = top.querySelectorAll('h2, h3')
      for (var x = 0; x < hs.length; x++) {
        if (hs[x] !== h && JOB_RE.test(hs[x].textContent)) others++
      }
      if (!others) hide = top
    }

    return { section: sec, hide: hide, role: role, where: where, full: full, quals: quals, apply: apply }
  }

  function buildCard(job, fullTime) {
    // Location is the subtitle directly above, so it is not repeated here --
    // in a third of a card "Bethlehem / Center Valley" broke mid-word.
    var stats = []
    if (fullTime) stats.push({ k: 'Hours', v: 'Full-time' })
    var exp = experienceFrom(job.quals)
    if (exp) stats.push({ k: 'Experience', v: exp })

    var statHtml = ''
    for (var i = 0; i < stats.length; i++) {
      statHtml += '<div class="itlr-job__stat">'
        + '<span class="itlr-job__statv">' + esc(stats[i].v) + '</span>'
        + '<span class="itlr-job__statk">' + esc(stats[i].k) + '</span>'
        + '</div>'
    }

    var qualHtml = ''
    for (var q = 0; q < Math.min(job.quals.length, 3); q++) {
      qualHtml += '<li>' + esc(job.quals[q]) + '</li>'
    }

    var href = job.apply || '/careers/'
    return '<article class="itlr-job">'
      + '<div class="itlr-job__banner" aria-hidden="true"></div>'
      + '<span class="itlr-job__badge" aria-hidden="true">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"'
        + ' stroke-linecap="round" stroke-linejoin="round">' + iconFor(job.full) + '</svg>'
      + '</span>'
      + '<div class="itlr-job__body">'
        + '<h3 class="itlr-job__title">' + esc(job.role) + '</h3>'
        + (job.where ? '<p class="itlr-job__where">' + esc(job.where) + '</p>' : '')
        + (statHtml ? '<div class="itlr-job__stats">' + statHtml + '</div>' : '')
        + (qualHtml ? '<ul class="itlr-job__quals">' + qualHtml + '</ul>' : '')
        + '<a class="itlr-job__cta" href="' + esc(href) + '">View role'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M5 12h14M13 6l6 6-6 6"/></svg></a>'
      + '</div>'
      + '</article>'
  }

  function buildCareerCards() {
    if (document.querySelector('.itlr-jobs')) return true
    if (!/\/careers\/?$/.test(location.pathname)) return false

    var heads = document.querySelectorAll('h2')
    var jobs = []
    for (var i = 0; i < heads.length; i++) {
      if (!JOB_RE.test(heads[i].textContent)) continue
      var j = readJob(heads[i])
      if (j && j.quals.length) jobs.push(j)
    }
    if (jobs.length < 2) return false

    // Only claim full-time if the page still says it. It is a section-level
    // statement covering all four roles, not something any listing says itself.
    var fullTime = /all positions offer full-time hours/i.test(document.body.textContent || '')

    var grid = document.createElement('div')
    grid.className = 'itlr-jobs'
    var html = ''
    for (var k = 0; k < jobs.length; k++) html += buildCard(jobs[k], fullTime)
    grid.innerHTML = html

    // The grid goes where the first listing was, and the long stacked listings
    // are hidden -- their content now lives on the role's own page, which is
    // where the card sends you.
    var first = jobs[0].hide || jobs[0].section
    first.parentNode.insertBefore(grid, first)
    for (var s = 0; s < jobs.length; s++) {
      var box = jobs[s].hide || jobs[s].section
      box.style.display = 'none'
      box.setAttribute('aria-hidden', 'true')
    }
    liftJobsToTop(grid)
    return true
  }

  /**
   * Move the roles to the top of the page.
   *
   * Someone on a careers page is there for the jobs, and as built the page opens
   * with two paragraphs of introduction and a culture section before the first
   * role appears. The "Open Positions" section carries the heading and the line
   * naming the towns, so it travels with the grid; both land directly under the
   * page title, and the introduction and culture follow.
   *
   * Nothing is deleted and nothing is rewritten -- the same sections in a
   * different order.
   */
  function liftJobsToTop(grid) {
    var h1 = document.querySelector('h1')
    var titleSec = h1 && h1.closest ? h1.closest('.elementor-top-section') : null
    if (!titleSec || !titleSec.parentNode) return

    var openSec = null
    var hs = document.querySelectorAll('h1, h2, h3')
    for (var i = 0; i < hs.length; i++) {
      if (!/open positions/i.test(hs[i].textContent)) continue
      openSec = hs[i].closest ? hs[i].closest('.elementor-top-section') : null
      break
    }

    var parent = titleSec.parentNode
    var anchor = titleSec.nextSibling
    if (openSec && openSec.parentNode === parent && openSec !== titleSec) {
      parent.insertBefore(openSec, anchor)
      // Inside the section, not after it. That section is a dark band sized for
      // the listings that used to follow it, so leaving the cards outside left
      // a stretch of empty dark above them and put the cards on bare white.
      // Appended as a direct child of the section rather than into its
      // container, which is a flex row the grid would have joined as one item.
      openSec.appendChild(grid)
      grid.setAttribute('data-in-section', 'true')
    } else if (grid.parentNode === parent) {
      parent.insertBefore(grid, anchor)
    }
  }

  /* -------------------------------------------------------------------------
   * Careers out of the About Us dropdown, into the top level.
   *
   * Five copies of the menu exist: desktop, mobile, two sticky clones that
   * Elementor Pro builds after load, and the footer's HFE menu. The clones are
   * why this keeps re-running rather than doing the move once -- a menu that
   * appears later has to be moved too, or the sticky header disagrees with the
   * one you scrolled past.
   *
   * Matched on the WordPress menu-item post ids, which are the only stable
   * hooks here; Elementor regenerates its own element ids on every save.
   * ---------------------------------------------------------------------- */
  function liftCareersOutOfAboutUs() {
    var moved = 0
    var careers = document.querySelectorAll('li.menu-item-8293, li#menu-item-8293')
    for (var i = 0; i < careers.length; i++) {
      var li = careers[i]
      if (li.getAttribute('data-itlr-lifted') === '1') continue
      var subMenu = li.parentElement
      if (!subMenu) continue
      // Already top level: its parent list is not a submenu.
      var isNested = /sub-menu|children|elementor-nav-menu--dropdown-.*sub/i.test(subMenu.className || '')
        || subMenu.closest('li') !== null
      if (!isNested) { li.setAttribute('data-itlr-lifted', '1'); continue }

      var parentLi = subMenu.closest('li')
      if (!parentLi || !parentLi.parentElement) continue

      li.setAttribute('data-itlr-lifted', '1')
      // Straight after About Us, so the order reads Home / Services / Past Work
      // / About Us / Careers / Service Area / Contact.
      parentLi.parentElement.insertBefore(li, parentLi.nextSibling)

      // It is a top-level item now, so drop the submenu-child classes and any
      // dropdown affordance it inherited.
      li.className = (li.className || '')
        .replace(/menu-item-in-sub-menu|sub-menu__item|elementor-item--sub|menu-item-has-children/g, '')
        .replace(/\s+/g, ' ').trim()
      moved++

      // About Us may now have no children left; if so it should stop behaving
      // like a dropdown.
      if (!parentLi.querySelector('ul li')) {
        parentLi.className = (parentLi.className || '').replace(/menu-item-has-children/g, '').replace(/\s+/g, ' ').trim()
        var pArrow = parentLi.querySelector(':scope > a .sub-arrow, :scope > a .sub-menu-toggle')
        if (pArrow && pArrow.parentNode) pArrow.parentNode.removeChild(pArrow)
        var emptyUl = parentLi.querySelector(':scope > ul')
        if (emptyUl && !emptyUl.querySelector('li') && emptyUl.parentNode) emptyUl.parentNode.removeChild(emptyUl)
      }
    }
    return moved > 0
  }

  /**
   * Strip the dropdown affordance from Careers, every tick.
   *
   * SmartMenus (the `sm-...` ids on these anchors) re-initialises the menu
   * after the move and puts `has-submenu`, aria-haspopup, aria-controls and a
   * .sub-arrow caret back on the anchor. Doing this once during the move was
   * not enough -- the caret reappeared and Careers looked like a dropdown that
   * opens nothing. It is idempotent and cheap, so it runs alongside the move.
   */
  function tidyLiftedItems() {
    var items = document.querySelectorAll('li[data-itlr-lifted="1"]')
    for (var i = 0; i < items.length; i++) {
      var li = items[i]
      var arrows = li.querySelectorAll(':scope > a .sub-arrow, :scope > a .sub-menu-toggle, :scope > a .fa-caret-down')
      for (var k = 0; k < arrows.length; k++) {
        if (arrows[k].parentNode) arrows[k].parentNode.removeChild(arrows[k])
      }
      var a = li.querySelector(':scope > a')
      if (!a) continue
      if (/has-submenu|sub-menu__item|elementor-sub-item/.test(a.className || '')) {
        a.className = (a.className || '')
          .replace(/has-submenu|sub-menu__item|elementor-sub-item/g, '')
          .replace(/\s+/g, ' ').trim()
      }
      // A top-level anchor has to keep elementor-item or it loses the theme's
      // nav styling entirely -- it is what carries the colour, weight and
      // hover state.
      if (!/elementor-item/.test(a.className || '')) {
        a.className = ('elementor-item ' + (a.className || '')).trim()
      }
      a.removeAttribute('aria-haspopup')
      a.removeAttribute('aria-controls')
      a.removeAttribute('aria-expanded')
      // SmartMenus hangs a submenu <ul> off it when it thinks it is a parent.
      var stray = li.querySelector(':scope > ul')
      if (stray && !stray.querySelector('li') && stray.parentNode) stray.parentNode.removeChild(stray)
    }
  }

  function init() {
    liftCareersOutOfAboutUs()
    tidyLiftedItems()
    buildCareerCards()
    return true
  }

  // Elementor's sticky header clones the menu after load, so this keeps
  // asserting rather than running once.
  var tries = 0
  var timer = setInterval(function () {
    init()
    if (++tries > 60) clearInterval(timer)
  }, 250)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
