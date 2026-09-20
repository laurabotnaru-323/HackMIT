# THRESHOLD

Active noise cancellation for data centers, built for the HackMIT 2026
sustainability track.

Data center cooling fans, transformers and generators run all night at one low
tone. Residents describe a sound they feel more than hear, and it is now the
subject of nuisance lawsuits in Mississippi, Wisconsin and Michigan. Standard
dBA measurement misses the low-frequency tonal component, and testing happens
once at permitting rather than continuously.

THRESHOLD captures the tonal hum inside a confined enclosure and emits a matched
inverse waveform to cancel it, the same mechanism used on industrial HVAC and
transformer noise, proven to around 20 dB. Passive foam and cardboard absorption
catches the broadband noise cancellation cannot reach. A second layer compares
live readings against real jurisdiction thresholds and flags when mitigation is
maxed out and the limit is still close.

## What is in here

| Path | What it is |
|---|---|
| `website/` | The public site and the operator dashboard. Plain HTML, CSS and JavaScript, no build step. |
| `website/assets/` | The hero footage, its poster and ending frame, and the candidate-site renders. |
| `grafana/` | Grafana, Prometheus and a metrics exporter for real hardware. |
| `docs/` | The website design package the build was written from. |
| `tools/` | Headless Chrome scripts used to self-test the build. Not part of the site. |

## The site

```
cd website
python3 -m http.server 8000
```

Open http://localhost:8000. Scrolling the hero scrubs one continuous ten second
shot: a barren, scraped data center site under gray haze that comes back to life
as you scroll, until grass, trees, birds and deer fill the same frame. The
building never moves, so it reads as one place changed rather than two pictures
crossfaded. Over the footage sits an instrument layer, hum rings pulsing off the
roofline and then a glowing inverse waveform that answers them, with the readout
falling from 66.6 to 54.2 dBA.

Scroll maps to footage time through a curve rather than a straight line. The
regrowth in the shot runs faster than the story does, so the curve holds the
barren opening under the two problem beats, runs the melt under the cancellation
beat, and leaves the last quarter of the scroll for the settle. The keys live in
`TIMEMAP` in `index.html`.

Below that: the problem, how the unit works, a press-and-hold that cancels the
hum, the ecological case, the ordinance profiles, and pricing.

The login is a prototype. Any email and password open the dashboard, nothing is
sent anywhere, and the modal says so.

Opening `index.html` by double-clicking works and shows the still hero, because
browsers block `fetch` on `file://` URLs. Serve the folder for the full version.

### What each visitor gets

Phones, portrait tablets, coarse-pointer portrait, landscape phones and anyone
with reduced motion switched on get a composed static hero instead: the shot's
resting frame with the settle copy over it. No video is requested at all. The
five conditions live in one `GATES` list that drives both the scrub decision and
the CSS class, so the two sides cannot drift apart, and the list is re-evaluated
on every rotation, resize and preference flip rather than once at load.

If the video fails to load for anyone else, a hand-drawn SVG scene takes over and
carries the same barren-to-living journey on its own. The page is complete
without the footage.

### Regenerating the visuals

The hero footage and the candidate-site renders were generated with Higgsfield.
The hero was built as a composed pair: a barren start frame and a thriving end
frame from the same composition, interpolated into one continuous take, so both
ends of the scroll land on a frame that was designed rather than drifted to. The
encode that makes scrubbing smooth is a short keyframe interval:

```
ffmpeg -i raw.mp4 -vf scale=1600:-2 -c:v libx264 -crf 22 -preset slow \
  -g 8 -keyint_min 8 -pix_fmt yuv420p -movflags +faststart -an \
  website/assets/hero-scrub.mp4
```

After re-encoding, update `VIDEO_BYTES` in `index.html` and re-derive the poster
and ending frame.

### Self-testing

`tools/` holds the headless Chrome checks used on this build: the flick test on
the caption beat map at 120, 240 and 360 pixel steps, the worst-frame legibility
audit (hide the glyphs, screenshot the real composited page, measure the lightest
pixel under the text), the press-and-hold performed with a real mouse press,
reduced motion flipped live in both directions, and the page loaded with the
video blocked at the network.

```
cd website && python3 -m http.server 8000 &
npm i -D puppeteer-core && node tools/selftest.js
```

### The dashboard

Three tabs, styled after Grafana, with simulated data until hardware is attached:

1. **ANC live.** Status row with noise reduction as the headline number, the live
   spectrum with an ANC toggle and baseline capture, cancellation performance,
   and energy transparency with a power history.
2. **Financial and compliance.** Operating cost, projected avoided mitigation
   cost, and ordinance monitoring against Prince William County, Divide County
   or the PennFuture model ordinance, with day and night thresholds applied by
   clock. An exceedance texts the county noise officer and the site manager.
3. **Site intelligence.** Operator inputs, a transparent seven-factor disruption
   score with adjustable weights, three ranked candidate parcels on a map at
   real coordinates, and a model render of each site.

Every panel has a menu with Inspect data and Download CSV, so every number on
screen is reachable as a table.

## Real monitoring

`grafana/` holds a docker compose stack: an exporter that sits in front of the
existing ingest server and passes frames through untouched, Prometheus, and a
provisioned Grafana dashboard with alert rules. See `grafana/README.md`.

```
cd grafana && docker compose up -d
```

## Honest limits

The microphone is not a certified sound level meter. Readings are good for
trend, for alerting, and for knowing when to call a certified survey.

**Prototype readings are not certified compliance measurements.**

Dashboard data is simulated until the hardware is connected. The candidate
parcels sit at real coordinates, but their factor scores are estimates for the
prototype and the site renders are models, not photographs.

There is no Google Maps key in this build, so tab 3 draws its own map at real
coordinates rather than loading tiles. Each candidate still links out to Google
Maps at its exact latitude and longitude. To swap in real tiles, add a Maps
JavaScript API key and replace `drawMap` in `dashboard.html`.

The exceedance text is mocked. A real send needs Twilio credentials and a
verified recipient number; the alert log shows exactly what would go out.
