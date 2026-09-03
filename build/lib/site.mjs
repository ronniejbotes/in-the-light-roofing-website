/** Site-wide constants and small shared helpers. */

export const ORIGIN = 'https://inthelightroofing.com'

/** Absolute URL for a site path. */
export const abs = (p) => (/^https?:/i.test(p) ? p : ORIGIN + (p.startsWith('/') ? p : '/' + p))

/** Icon set used across the templates. Inline SVG so there is no icon font
 *  request and no layout shift. `viewBox` is 0 0 24 24 for all of them. */
const ICONS = {
  phone: '<path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2z"/>',
  mail: '<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/>',
  pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>',
  check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
  arrow: '<path d="M13.2 5.2 11.8 6.6 16.2 11H4v2h12.2l-4.4 4.4 1.4 1.4L20 12z"/>',
  chevron: '<path d="M12 15.4 5.6 9l1.4-1.4 5 5 5-5L18.4 9z"/>',
  up: '<path d="M12 8.6 18.4 15 17 16.4l-5-5-5 5L5.6 15z"/>',
  clock: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.6V6h-2v7.4l5 3 1-1.7z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  facebook: '<path d="M22 12a10 10 0 1 0-11.6 9.9v-7h-2.5V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z"/>',
  instagram: '<path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.8-.1zM12 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4zm0 6.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4zm5.4-7.1a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>',
  youtube: '<path d="M21.6 7.2s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C15.9 4 12 4 12 4h-.1s-3.9 0-6.7.3c-.4 0-1.3 0-2 .9-.6.6-.8 2-.8 2S2.2 8.8 2.2 10.5v1.6c0 1.7.2 3.3.2 3.3s.2 1.4.8 2c.8.8 1.8.8 2.2.9 1.6.1 6.6.2 6.6.2s3.9 0 6.7-.3c.4-.1 1.3-.1 2-.9.6-.6.8-2 .8-2s.2-1.6.2-3.3v-1.6c0-1.6-.1-3.2-.1-3.2zM9.9 14.6V8.8l5.1 2.9-5.1 2.9z"/>',
}

export const icon = (name, cls = '') =>
  ICONS[name]
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name]}</svg>`
    : ''

/** Which icon to use for a social profile URL. */
export const socialIcon = (url) => {
  if (/facebook\.com/i.test(url)) return 'facebook'
  if (/instagram\.com/i.test(url)) return 'instagram'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  return 'arrow'
}

export const socialName = (url) => {
  if (/facebook\.com/i.test(url)) return 'Facebook'
  if (/instagram\.com/i.test(url)) return 'Instagram'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube'
  return 'Profile'
}

/** Human date, e.g. "28 August 2026". WordPress dates are local, no zone. */
export const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const isoDate = (iso) => (iso ? String(iso).slice(0, 10) : '')

/** Posts per archive page. Matches the live WordPress setting (verified: the
 *  blog paginates to /blog/page/20/ for 192 posts). */
export const PER_PAGE = 10
