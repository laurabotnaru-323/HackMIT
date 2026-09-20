# THRESHOLD website: design package

The single creative document for the HackMIT site. Every viewer-facing line below ships verbatim. Band ranges are starting points, validated by the flick test.

## 1. Brand premise

One word from the subject's world: **quiet**. Not silence, the return of ordinary sound. A data center hums at one low tone, and that tone pushes life back from the fence line. THRESHOLD finds the tone, answers it with its inverse, and the fence line comes back to life. Every section teaches and sells that one idea: the hum leaves, the quiet returns, the birds return with it.

## 2. Palette as CSS tokens

Sampled from the world of the hero: a scraped-dirt site under gray haze at the top of the scroll, a green meadow under a clearing morning sky at the bottom.

```css
:root{
  --canvas:#0d1517;        /* pre-dawn blue-charcoal, never pure black */
  --panel:#13201f;         /* raised surfaces */
  --panel-2:#182827;
  --accent:#5ec98a;        /* meadow green: the CTA and rare emphasis */
  --accent-hover:#7fdba4;
  --accent-muted:rgba(94,201,138,.16);
  --haze:#b9b1a3;          /* the barren world's dust tone, used for "before" states */
  --dawn:#e8c079;          /* one warm note, the morning light, used once or twice */
  --text-primary:#eef3ef;
  --text-secondary:#a7b3ad;
  --line:rgba(238,243,239,.10);
}
```

## 3. Type trio

- Display: **Bricolage Grotesque** 500 and 700 (a grotesque with real character, sits well beside instrument readouts).
- Body: **Figtree** 400 and 500 (quiet, round, readable at small sizes).
- Mono: **JetBrains Mono** 400 and 500 (readouts, chips, table numbers).

## 4. Band map (hero, 520vh pinned)

| Band | Range (starting point) | Footage moment | Copy (verbatim) | Entrance |
|---|---|---|---|---|
| 1 | 0.00 to 0.16 | Barren site, gray haze, hum rings pulsing from the rooftop fans | "Data centers hum. The land goes quiet." | Word-punch (the hum lands) |
| 2 | 0.20 to 0.38 | Hum rings widen, dust, no birds, the fence line empty | "Below 200 Hz the meters miss it. The neighbors do not." | Drift-down (the tone sinking in) |
| 3 | 0.42 to 0.62 | THRESHOLD unit lights at the fence, inverse wave meets the hum, rings fade | "THRESHOLD hears the tone and answers with its inverse." | Halves parting (two waves meeting) |
| 4 | 0.66 to 1.00 | Grass spreads, trees rise, birds cross, sky clears, deer at the treeline | "Quiet comes back to the fence line." then subline "Active noise cancellation for data centers, with the readings to prove it." then CTA "See the live dashboard" | Word-by-word rise into a staged settle |

## 5. Static-hero copy block (reduced motion)

Headline: "Quiet comes back to the fence line."
Subline: "Active noise cancellation for data centers, with the readings to prove it."
CTA: "See the live dashboard"

## 6. Below-fold outline

Every section funnels to one call to action: **See the live dashboard** (the login modal, which opens the operator dashboard).

1. **The hum** (problem). Kicker "The problem". Headline "It never switches off." Body: "Cooling fans, transformers and generators run all night at one low tone. Residents describe it as a sound they feel more than hear. It keeps people up, it drives down property values, and it is now the subject of lawsuits in Mississippi, Wisconsin and Michigan." Three stat chips: "3 active lawsuits", "Below 200 Hz", "Tested once, at permitting".
2. **How it works** (three steps, equal treatment, each with a drawn SVG figure). "Listen": "A microphone at the enclosure captures the dominant tone and its phase." "Cancel": "A speaker emits the matched inverse. Peaks cancel, the same physics used on industrial transformers and HVAC, proven to 20 dB." "Report": "Live readings compare against the local ordinance and flag when mitigation is maxed out and the limit is still close." Passive line: "Foam and cardboard absorption catches the broadband noise the cancellation cannot."
3. **The interactive moment**: "Hold to cancel the hum." A press-and-hold. While held, the inverse wave rises to meet the hum wave, the residual line flattens, and the readout falls from 66.6 dBA to 54.2 dBA. Release early and it eases back. Completing it lights the three readouts in sequence: "Dominant tone 120 Hz", "Phase 180°", "Attenuation 12.4 dB".
4. **Sustainability**. Kicker "Why it matters". Headline "Sensory danger zones." Body: "Data centers land on land that used to be quiet. Ecologists use the phrase sensory danger zone for what the hum does to predator and prey, and to birds trying to breed. Cutting noise at the source gives that ground back. The unit reports its own power draw, so the cost of the fix stays honest." Two figures: "Up to 20 dB" and "5.2 W".
5. **Compliance**. Headline "Measured against the rule that applies to you." A small table of three profiles: Prince William County (60 day / 55 night), Divide County (50 / 45), PennFuture model ordinance (55 / 50). Line: "Prototype readings are not certified compliance measurements."
6. **Pricing**. Headline "Who pays. Who doesn't." Three plans: **Residents**, Free, "Public readings for the site near you. Alerts when the night limit is at risk." **Government**, "Per site, on request", "Continuous ordinance monitoring, exceedance log, official alerts by text." **Operators**, "Per enclosure", "The full unit: cancellation hardware, energy transparency, compliance reporting and site intelligence."
7. **FAQ** (buyers' objections in their words): "Is this a certified sound level meter?" "Does the cancellation itself make noise or use a lot of power?" "Why not just build a wall?" "Can residents see the readings?"
8. **Closing CTA**: "See what quiet looks like on a dashboard." Button "See the live dashboard".
9. **Footer**: "THRESHOLD is a HackMIT 2026 prototype built for the sustainability track. Dashboard data is simulated until the hardware is connected. Prototype readings are not certified compliance measurements."

**Form handling**: the login is a JS-only demo. Any email and password open the operator dashboard; nothing is sent anywhere, and the modal says so.

## 7. Vector layer plan

- The hero scene is drawn by hand as SVG: sky, haze, far ridge, the long low data center with rooftop cooling units, fence, cracked ground, grass tufts, three tree groups, birds, one deer, hum rings, the THRESHOLD unit and its inverse wave. All scroll-driven through one `--p` variable, transform and opacity only.
- Section dividers: a self-drawing waveform line (hum) that draws on scroll, and an inverse copy under it.
- Whisper particles: dust motes in the barren half, pollen in the living half, at 4 percent opacity.
- Reduced motion: final (living) state shown, drives stopped.

## 8. Engineering list

Pinned 520vh hero with a sticky stage; dt-normalized lerp in a rAF loop that rests; delta-gated DOM writes; band pacing with the flick test; four-layer legibility (base scrim, per-band scrim, text-shadow token, chips); five static-hero gates kept live; video loader ready but dormant until footage is approved (the vector scene carries the journey alone today); overflow-x clip on html and body; reduced-motion honored live in both directions; semantic landmarks, skip link, focus-visible in the accent, 44px touch targets.

## 9. Copy gate

Every viewer-facing line above ships verbatim. The built pages pass the grep gate: zero em dashes, zero of leverage, seamless, empower, unlock, robust, actionable, data-driven, solutions, plus the body-copy sweep for AI tells. Designed devices (the three-word step names, the "Who pays. Who doesn't." punch) are craft and stay.
