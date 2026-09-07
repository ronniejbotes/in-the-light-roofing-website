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

## Why the marquee components were ported, not installed

Both supplied components — the testimonial marquee and the animated hero
marquee the Past Work treatment came from — were React + shadcn/ui + Tailwind +
TypeScript. This project is none of those:

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
