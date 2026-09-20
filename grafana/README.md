# THRESHOLD monitoring stack

Grafana, Prometheus and a metrics exporter for the active noise cancellation
unit. This is the production path: the same numbers the demo site shows, coming
from real hardware instead of the browser.

## Run it

```
cd grafana
docker compose up -d
```

Open http://localhost:3000. The dashboard is provisioned, so it is there on the
first load, under the THRESHOLD folder. Anonymous viewing is on, which means a
judge or a reviewer can open the link without a login. The admin account is
`admin` / `threshold` unless you set `GRAFANA_USER` and `GRAFANA_PASSWORD`.

With no hardware attached the exporter simulates the tonal hum, so every panel
has data immediately.

## Attach the hardware

The exporter sits in front of the existing ingest server and passes frames
through untouched, so nothing in `threshold-ml` changes.

```
Pi  ->  exporter :5000  ->  ingest_raw_server.py :5001
                  |
                  +-- /metrics :9109  ->  Prometheus  ->  Grafana
```

1. Start `ingest_raw_server.py` on port 5001 instead of 5000.
2. Put these in a `.env` beside the compose file:

```
SIMULATE=
INGEST_FORWARD=host.docker.internal:5001
CALIBRATION_OFFSET=73
ORDINANCE_PROFILE=prince_william
```

3. Point the Pi at port 5000 on this host. `docker compose up -d` again.

`SIMULATE=` with nothing after it is what turns simulation off.

## Calibration, stated plainly

The microphone is not a certified sound level meter. The exporter turns raw
sensor units into a decibel figure and adds `--calibration-offset`. Set that
offset by holding a calibrated meter beside the microphone and matching the
numbers. Until you do, treat the readings as trend, not as evidence.

Prototype readings are not certified compliance measurements.

## Ordinance profiles

`ORDINANCE_PROFILE` picks which limits the margin and the alert use:

| Profile | Day | Night |
|---|---|---|
| `prince_william` | 60 dBA | 55 dBA |
| `divide` | 50 dBA | 45 dBA |
| `pennfuture` | 55 dBA | 50 dBA |

Night runs 22:00 to 07:00 in the container's local time.

## Alerts and the text message

Two rules are provisioned. "Noise limit exceeded" fires when the mean margin
stays below zero for a minute. "Hardware feed lost" fires when no frame has
arrived for two minutes.

Both route to a webhook contact point, because Grafana has no built-in Twilio
notifier. Set `TWILIO_WEBHOOK_URL` to a small relay that turns the POST into a
Twilio message and holds the credentials. Keeping the account SID and auth token
in the relay rather than in this repo is the point.

## Metrics

| Metric | Meaning |
|---|---|
| `threshold_baseline_dba` | Level at the reference microphone |
| `threshold_residual_dba` | Level after cancellation |
| `threshold_attenuation_db` | Baseline minus residual |
| `threshold_dominant_hz` | Dominant tone below 400 Hz |
| `threshold_power_watts` | Power drawn by the unit |
| `threshold_margin_db` | Headroom below the limit, negative means exceeding |
| `threshold_limit_dba` | The limit in force, labelled with profile and period |
| `threshold_spectrum_baseline_db` | Band level, labelled `freq_hz`, 32 bands |
| `threshold_spectrum_current_db` | Same bands after cancellation |
| `threshold_exceedances_total` | Counter, three consecutive samples over the limit |
| `threshold_feed_age_seconds` | Seconds since the last frame |

The exporter also accepts `POST /anc/on` and `/anc/off` to flip the simulated
controller, which is how you demonstrate a cancellation step on the Grafana
time series.

## What was not tested here

The exporter was run and its output checked. Grafana, Prometheus and the
provisioning files were written but never started, because the machine that
built this had every Grafana host blocked by an egress policy. Run
`docker compose up -d` once before you need it in front of anyone. If the
"Live noise spectrum" bar chart comes up empty, open the panel and set its x
field to `freq_hz`; every other panel uses plain time series queries.
