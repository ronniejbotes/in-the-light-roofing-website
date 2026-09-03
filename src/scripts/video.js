/**
 * Click-to-load YouTube.
 *
 * The live site embeds YouTube iframes directly, which pulls ~900KB of
 * third-party JS on pages that have several of them. Here the page ships a
 * poster image and only creates the iframe once the visitor asks for it.
 */

export function initVideo() {
  for (const btn of document.querySelectorAll('[data-yt]')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-yt')
      if (!id) return

      const frame = document.createElement('iframe')
      frame.src =
        `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` +
        `?autoplay=1&rel=0&modestbranding=1`
      frame.title = btn.getAttribute('data-yt-title') || 'YouTube video player'
      frame.allow =
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
      frame.allowFullscreen = true
      frame.loading = 'eager'
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')

      const wrap = document.createElement('div')
      wrap.className = 'embed'
      wrap.appendChild(frame)
      btn.replaceWith(wrap)
      frame.focus?.()
    })
  }
}
