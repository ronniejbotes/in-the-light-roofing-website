/**
 * Contact / quote form submission.
 *
 * The WordPress site posted these through Forminator to admin-ajax.php. There
 * is no WordPress behind the static site, so the endpoint is configured per
 * deployment via `data-endpoint` on the form (see DEPLOY.md). Until one is
 * set the form degrades to a mailto: link rather than silently failing.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function initForms() {
  for (const form of document.querySelectorAll('form[data-itlr-form]')) {
    const status = form.querySelector('.form__status')
    const submit = form.querySelector('[type="submit"]')

    form.addEventListener('submit', async (e) => {
      e.preventDefault()

      // Honeypot: a real person never fills this.
      if (form.querySelector('input[name="company_website"]')?.value) return

      const say = (msg, ok) => {
        if (!status) return
        status.textContent = msg
        status.className = `form__status ${ok ? 'form__status--ok' : 'form__status--err'}`
      }

      const data = new FormData(form)
      const name = (data.get('name') || '').toString().trim()
      const email = (data.get('email') || '').toString().trim()
      const phone = (data.get('phone') || '').toString().trim()

      if (!name) return say('Please tell us your name.', false)
      if (!phone && !email) return say('Please give us a phone number or an email address.', false)
      if (email && !EMAIL_RE.test(email)) return say('That email address does not look right.', false)

      const endpoint = form.getAttribute('data-endpoint')
      if (!endpoint) {
        // No handler configured yet: hand the enquiry to the mail client so a
        // real lead is never dropped on the floor.
        const to = form.getAttribute('data-fallback-email') || 'info@inthelightroofing.com'
        const body = [...data.entries()]
          .filter(([k]) => k !== 'company_website')
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
        location.href =
          `mailto:${to}?subject=${encodeURIComponent('Website enquiry')}&body=${encodeURIComponent(body)}`
        return say('Opening your email app to send this enquiry…', true)
      }

      submit && (submit.disabled = true)
      say('Sending…', true)

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          body: data,
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) throw new Error(String(res.status))
        const redirect = form.getAttribute('data-redirect')
        if (redirect) return void (location.href = redirect)
        form.reset()
        say('Thanks — we have your details and will be in touch shortly.', true)
      } catch {
        say('Sorry, that did not send. Please call (484) 553-0213 and we will help right away.', false)
      } finally {
        submit && (submit.disabled = false)
      }
    })
  }
}
