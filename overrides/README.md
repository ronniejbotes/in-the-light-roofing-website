# `overrides/`

Fixes layered over the mirrored WordPress markup. `build/serve.mjs` injects them
into every HTML response.

```bash
npm run dev        # mirror + these fixes
npm run dev:raw    # the mirror exactly as captured (OVERRIDES=off)
```

`mirror/` is never edited. Its value is that it records what the live site
actually serves, defects included, so fixes live here instead. With
`OVERRIDES=off` the served bytes are identical to the committed file.

Everything here is plain CSS and ES5-ish JS with no build step, because that is
what can be pasted into WordPress: CSS into Elementor → Site Settings → Custom
CSS, JS into a footer snippet (Elementor → Custom Code, or a snippets plugin).

| File | What it does |
|---|---|
| `overrides.css` / `overrides.js` | Service-grid icon sizing; Past Work carousel as a full-width continuous crawl, with rounded cards, hover-to-hold and an estimate prompt beneath it |
| `reviews.css` / `reviews.js` | 3D testimonial marquee replacing the Trustindex widget |
| `process.css` / `process.js` | The 5-step process section as a scroll-driven stage |
| `team.css` / `team.js` | The crew carousel as a photo stack, and the founder/team section order |
| `assets/` | The five step renders (generated; see below) |
| `reviews.json` | The nine Google reviews, captured verbatim |

## The Past Work strip

A seamless, full-bleed crawl of real job photographs. **It no longer runs on
Swiper.** Elementor's carousel is loop-mode Swiper, which fakes an infinite loop
by cloning slides and then teleporting the wrapper back to the start
(`loopFix`). That teleport is the jump, and it is not tunable away — it is how
the mode works. So `buildMarquee()` destroys the Swiper instance and rebuilds
the strip as a plain track.

- **Seamless.** The track holds N whole copies of the seven photographs and is
  animated from `0` to `-50%` of its own width. Half the track is exactly the
  copies in the first half, so the last frame is pixel-identical to the first.
  Measured over a full period: 106 px/s, no speed spike at the loop point.
- **No `gap`.** Spacing is `margin-right` on each item so every item contributes
  the same pitch. A `gap` is also dropped *between the two halves*, which makes
  `-50%` land a few pixels off one whole copy and puts the seam straight back.
- **Copy count is measured, not assumed.** It grows in pairs until one half is
  wider than the viewport, or a gap opens at the right edge on a wide screen.
  1440px gets 2 copies; 2560px gets 4.
- **Speed.** `PX_PER_SEC` in `overrides.js`, currently 106. It was 163 when the
  photographs were 460px wide; they are now 299px (35% smaller), so holding 163
  would have pushed each one past the eye 35% sooner. 106 keeps the time a
  photograph spends on screen unchanged. Set it back to 163 for a constant
  travel speed instead.
- **Tilt.** Alternating ±2.5°, straightening to 0° and growing to 1.25 on hover.
  The class is assigned in JS from the index within one copy, **not** with
  `:nth-child` — there are seven photographs, an odd number, so `:nth-child`
  would land on different photographs in each copy and the tilt pattern would
  visibly change at the loop point.
- **Hover stops it,** via `animation-play-state`, which halts on the exact frame
  under the pointer. Nothing dims.

## The estimate prompt

Injected after the carousel widget, so it sits back inside the 1170px column
while the strip stays full-bleed. It is a dark card rather than bare text
because the section below overlaps upward with a bright cyan band, and the seam
moves with the viewport.

Being injected, it is a conversion element and not an indexable one. If it earns
its keep, move it into Elementor as real markup.

## The 5-step process stage

One step on screen at a time as you scroll, with a render per step. Built from
the same text Elementor already renders — `process.js` reads the five headings
and sentences out of `.process-col` rather than hard-coding them, so editing the
step copy in Elementor still drives this.

**Why a fixed layer and not `position: sticky`.** The obvious build is a sticky
stage over a tall section. It does not work on this site: the theme sets
`overflow: hidden auto` on `<body>`, which makes the body a scroll container, and
a sticky descendant then resolves against a scrollport that never scrolls.
Probed on the real page before building — the element scrolls straight past
instead of pinning. So the stage is `position: fixed` and the scroll distance
comes from a stack of empty spacers beneath it, which is also what the reference
implementation does.

- **Which step is current** comes from one `IntersectionObserver` over the
  spacers with `rootMargin: '-50% 0px -50% 0px'`. That collapses the viewport to
  its centre line, so exactly one spacer can be intersecting — and because it is
  a margin rather than a threshold, it rewinds correctly on the way back up.
- **A lead-in spacer** sits before the five. Without it the first step's
  centre-line window opens before the runway has covered the viewport, and card
  01 gets roughly a quarter of the dwell the other four get.
- **The artwork reel** is driven by a continuous progress value `u`, smoothed
  frame-rate-independently and magnetised toward the nearest step so each render
  sits still for most of its runway. Per image, `k = i - u` drives a CSS 3D
  transform; anything past the second neighbour is dropped from the compositor.
  This is the reference's WebGL carousel maths with no WebGL.
- **The rAF loop only runs near the section**, gated by a second observer. A
  marketing homepage should not hold a frame loop open for the whole visit.
- **`z-index: 40`** — under the site's fixed header at 99, so the stage passes
  beneath it.

**Degradation.** Under 1025px, and for anyone with `prefers-reduced-motion`, the
same markup lays out as an ordinary stacked list with each render above its
step — no fixed stage, no runway, no scroll-jacking. Someone checking a roofer at
the kerb wants to read five steps, not scrub through them. With **JavaScript
off, Elementor's original grid is untouched**: the replacement is inserted first
and the original hidden only once it is in the document, so a failure anywhere
above leaves the section exactly as it was. Verified at 390/768/1440/1920, under
reduced motion, and with JS disabled.

## The step artwork

The five images in `assets/` were generated (Higgsfield, GPT Image 2), then
converted to webp — 173KB for all five.

They are deliberately **isometric illustrations rather than photographs**. The
site already carries real photographs of the actual crew and their actual jobs;
a synthetic photograph of "a roofer on a roof" sitting among them would read as
a claim about this company's work and its people. An obvious illustration of a
phone call, a calendar or a pallet of shingles claims nothing that isn't true.

To move them to WordPress: upload to the media library and repoint `SHOTS` at
the top of `process.js`.

## The crew photo stack

"Contact Our Roofing Team" was an Elementor carousel of crew portraits. It is
now a pile of photographs that fans out when you point at it; clicking one spins
it back to the top of the pile.

- **Only the carousel widget is replaced.** The section's `<h2>` is a sibling of
  it, not a child, so the heading stays exactly where it was.
- **Portraits are read from the DOM, not hard-coded.** They are CSS
  `background-image` on a container inside each slide -- no `<img>`, no alt --
  so computed style is the only place to get them. Reading them means a portrait
  swapped in Elementor still flows through, *and* it inherits the
  former-employee suppression for free: `overrides.css` sets `background-image:
  none` on his element, so he resolves to nothing and is skipped. `team.js` also
  carries an explicit `SEMI7879|SEMI7885` filename guard as a second lock.
- **The fan uses shuffled slots, not rejection sampling.** The original picks
  random positions and retries on collision; with five cards in a 1170px stage
  the last one ran out of retries and landed on a neighbour in roughly one
  layout in five. Each card now gets its own slot and jitters inside it, so
  overlap is impossible by construction, while shuffling which card lands in
  which slot keeps the arrangement different on every hover. Measured at 0
  heavy overlaps across 12 layouts, down from ~1 in 5.
- **The fan is biased clear of the bottom ~60px.** This section is a
  height-constrained flex column whose items deliberately overlap -- that is how
  the outlined heading sits *behind* the portraits -- and the section's
  "Contact Us Now" button is one of those items. Without the bias, two cards
  covered it on most layouts.
- **The card selector is doubled (`.itlr-team .itlr-team__card`).** These are
  `<button>` elements and the theme styles bare buttons at a specificity that
  beats a single class; the first build came out with the theme's padding. The
  narrow-screen rules are doubled to match, or the desktop rule would outrank
  them and the mobile grid would never happen.
- **Cards are dark, not the white of the original.** The portraits are shot
  against a pale studio backdrop, so a white frame lets the photograph bleed
  into the card. Navy is the site's own secondary colour.
- **No CTA of its own** -- the section already ends with a "Contact Us Now"
  button, and the carousel put the same link on all seven slides.

### The crew have no names, and none were invented

The card design has a caption slot and looks better filled. `CREW_NAMES` in
`team.js` is deliberately empty, because **this repository does not contain the
crew's names**. The slides are bare containers with the portrait as a CSS
background: no alt text, no caption, and `content/media.json` gives every one of
these files an empty alt and a title that is just the camera filename
(`SEMI7900`, `SEMI8023`...). The repo's own history confirms it -- commit
`2e1cd9d` had to open all twelve photographs to work out which were the former
employee's, because there was no name metadata to go on.

First names do appear in customer reviews (Luis, Keylor, John, Mike, Juan,
Adam), but nothing ties any of them to a face. Guessing which photograph is
which person is not something to ship on a real business's site.

**Fill `CREW_NAMES` with the five real names, in portrait order, and the caption
row appears by itself.** Anything left blank renders no caption.

## Founder section before the team carousel

`founderAboveTeamCarousel()` in `overrides.js` moves the founder section above
the crew carousel, so the owner's story introduces a named human before the page
asks you to pick one of five faces. Neither section is found by its Elementor id
-- the founder section carries a hand-written `founder-section` class and the
carousel is found by its heading.

Idempotent: `init()` re-runs on a 250ms timer, and the `compareDocumentPosition`
guard makes every tick after the first a no-op. **With JavaScript off the order
is unchanged**, so this belongs in Elementor for real.

## Why the marquee components were ported, not installed

Every supplied component so far — the testimonial marquee, the animated hero
marquee behind the Past Work treatment, and the interactive photo stack behind
the crew section — arrived as React + shadcn/ui + Tailwind + TypeScript. This
project is none of those:

- no `react` or `react-dom` — the only dependencies are `playwright-core`,
  `sharp` and `vite`
- no `tailwind.config.*`, no `@tailwind` directives
- no `tsconfig.json` — `src/` is nine plain `.js` files
- no `components.json`, no `@/lib/utils`, no `@/components/ui`

Installing React, Tailwind, shadcn and Radix so that one section of a static
WordPress mirror could render would add a component library, a utility-class
framework and a type system to a site that is otherwise HTML and CSS — and none
of it could be pasted into WordPress afterwards, which is where this fix has to
end up.

So the *design* was ported and the *stack* was not. Everything the original does
is here: the perspective container, columns scrolling vertically in alternating
directions, pause-on-hover, edge gradients masking the ends, and the card layout
of avatar, name, meta and quote. Two deliberate differences:

- **The tilt is softer.** The original's `perspective: 300px` with a 20°
  `rotateZ` threw the outer columns off-canvas at this card width and made the
  text unreadable. The angles are reduced so all four columns stay in frame.
- **Avatars are initials, not photographs.** Google reviewer avatars are not
  ours to copy, and inventing a face for a real named customer is not something
  to ship.

## The reviews are real

All nine come from the Google feed the live site already runs, captured verbatim
into `reviews.json` — names, dates and wording as the customers wrote them,
typos included. Nothing is written, trimmed or improved. They date from August
to October 2025.

The 16 testimonials in `content/testimonials.json` were **not** used: the newest
is 20 March 2024, and a proof section whose freshest review is two and a half
years old reads worse than none.

Two rules are load-bearing here:

- **No `Review` or `aggregateRating` markup is emitted, ever.** Self-serving
  review structured data makes the whole domain ineligible for review rich
  results. These are plain HTML; stars belong to the Business Profile.
- **No review count is printed.** The site currently shows four different totals
  (237, 232, 18, and 39 on `/past-work/`) and the Business Profile shows another
  again. A hard-coded number is what created that, and it rots by itself. The
  block links to Google instead.
