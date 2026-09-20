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
| `grafana/` | Grafana, Prometheus and a metrics exporter for real hardware. |
| `threshold-ml/` | The prediction and control research code, datasets, baselines and evaluation. |
| `LCD_Test/` | Arduino sketch for the unit's display. |
| `docs/` | The website design package. |

## The site

```
cd website
python3 -m http.server 8000
```

Open http://localhost:8000. Scrolling the hero melts a barren data center site
into living land as cancellation engages. Below that: the problem, how the unit
works, a press-and-hold that cancels the hum, the ecological case, the ordinance
profiles, and pricing.

The login is a prototype. Any email and password open the dashboard, nothing is
sent anywhere, and the modal says so.

Opening `index.html` by double-clicking works and shows the still hero, because
browsers block `fetch` on `file://` URLs. Serve the folder for the full version.

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
