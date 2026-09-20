#!/usr/bin/env python3
"""Prometheus exporter for the THRESHOLD active noise cancellation unit.

Two modes:

  tee       Accepts the Pi's raw TCP frame stream on --listen, computes metrics
            from every frame, and forwards the bytes unchanged to the real
            ingest server on --forward. Nothing in the existing pipeline
            changes; point the Pi at this port and this at the ingest port.

  simulate  No hardware needed. Generates the same tonal-hum physics the web
            demo uses, so Grafana has data the moment it starts.

Standard library only, so it runs under a bare python:3.12-slim image with no
install step. Frame framing matches threshold_ml.ingest.raw_protocol.

  python3 threshold_exporter.py --simulate
  python3 threshold_exporter.py --listen 0.0.0.0:5000 --forward 127.0.0.1:5001

Levels are computed from uncalibrated sensor units. --calibration-offset shifts
them onto a sound level meter's scale; without a calibrated reference the
readings are trend indicators, not certified compliance measurements.
"""
import argparse
import math
import socket
import struct
import threading
import time
import zlib
from array import array
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAGIC = b"THRS"
VERSION = 1
HEADER_FMT = ">4s B B q H H H I"
HEADER_SIZE = struct.calcsize(HEADER_FMT)

# log-spaced analysis bands, 20 Hz to 2 kHz
N_BANDS = 32
BANDS = [20.0 * (2000.0 / 20.0) ** (i / (N_BANDS - 1)) for i in range(N_BANDS)]

DAY_START, NIGHT_START = 7, 22
PROFILES = {
    "prince_william": {"label": "Prince William County, VA", "day": 60.0, "night": 55.0},
    "divide": {"label": "Divide County, ND", "day": 50.0, "night": 45.0},
    "pennfuture": {"label": "PennFuture model ordinance", "day": 55.0, "night": 50.0},
}


class Metrics:
    """Everything the dashboard reads. One lock, one snapshot per scrape."""

    def __init__(self, profile, offset, price):
        self.lock = threading.Lock()
        self.profile = profile
        self.offset = offset
        self.price = price
        self.baseline = 0.0
        self.residual = 0.0
        self.dominant = 0.0
        self.phase = 180.0
        self.power = 0.0
        self.anc = 1
        self.spectrum_base = [0.0] * N_BANDS
        self.spectrum_now = [0.0] * N_BANDS
        self.frames = 0
        self.crc_errors = 0
        self.dropped = 0
        self.exceedances = 0
        self.energy_wh = 0.0
        self.streak = 0
        self.last_update = 0.0
        self._last_energy = time.time()

    def limit(self, now=None):
        hour = time.localtime(now or time.time()).tm_hour
        p = PROFILES[self.profile]
        night = hour >= NIGHT_START or hour < DAY_START
        return (p["night"] if night else p["day"]), night

    def accrue_energy(self):
        now = time.time()
        self.energy_wh += self.power * (now - self._last_energy) / 3600.0
        self._last_energy = now

    def note_level(self):
        limit, _ = self.limit()
        if self.residual > limit:
            self.streak += 1
            if self.streak == 3:
                self.exceedances += 1
        else:
            self.streak = 0


def rms_db(samples, offset):
    """Root mean square of a block, in dB, shifted onto the meter's scale."""
    if not samples:
        return 0.0
    total = 0.0
    for v in samples:
        total += v * v
    mean = total / len(samples)
    if mean <= 1e-20:
        return 0.0
    return 10.0 * math.log10(mean) + offset


def goertzel_power(samples, freq, rate):
    """Single-bin DFT magnitude. Cheaper than a full FFT for a handful of bins."""
    n = len(samples)
    if n == 0 or freq <= 0 or freq >= rate / 2:
        return 0.0
    k = 2.0 * math.cos(2.0 * math.pi * freq / rate)
    s1 = s2 = 0.0
    for v in samples:
        s0 = v + k * s1 - s2
        s2, s1 = s1, s0
    return (s1 * s1 + s2 * s2 - k * s1 * s2) / (n * n)


def analyse(metrics, reference, error, rate):
    """Turn one frame into levels, a dominant tone and a band spectrum."""
    base_db = rms_db(reference, metrics.offset)
    res_db = rms_db(error, metrics.offset)
    base_bands, now_bands = [], []
    best_power, best_freq = 0.0, 0.0
    for f in BANDS:
        pb = goertzel_power(reference, f, rate)
        pn = goertzel_power(error, f, rate)
        base_bands.append(10.0 * math.log10(pb + 1e-20) + metrics.offset)
        now_bands.append(10.0 * math.log10(pn + 1e-20) + metrics.offset)
        if f <= 400.0 and pb > best_power:
            best_power, best_freq = pb, f
    if best_freq:
        # refine to the nearest hertz, the log bands are too coarse to name a tone
        lo, hi = best_freq / 1.16, best_freq * 1.16
        step = max(0.5, (hi - lo) / 24.0)
        f = lo
        while f <= hi:
            p = goertzel_power(reference, f, rate)
            if p > best_power:
                best_power, best_freq = p, f
            f += step
        best_freq = round(best_freq)
    with metrics.lock:
        metrics.baseline = base_db
        metrics.residual = res_db
        metrics.dominant = best_freq
        metrics.spectrum_base = base_bands
        metrics.spectrum_now = now_bands
        metrics.frames += 1
        metrics.last_update = time.time()
        metrics.accrue_energy()
        metrics.note_level()


def tee_server(metrics, listen, forward, rate):
    """Accept the Pi stream, measure each frame, pass the bytes straight on."""
    host, port = listen.rsplit(":", 1) if ":" in listen else (listen, "5000")
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((host, int(port)))
    srv.listen(1)
    print(f"exporter listening on {host}:{port}, forwarding to {forward or 'nowhere'}")
    while True:
        conn, addr = srv.accept()
        print(f"pi connected from {addr}")
        out = None
        if forward:
            fh, fp = forward.rsplit(":", 1)
            try:
                out = socket.create_connection((fh, int(fp)), timeout=5)
            except OSError as exc:
                print(f"forward to {forward} failed, measuring only: {exc}")
        buf = b""
        try:
            while True:
                while len(buf) < HEADER_SIZE:
                    chunk = conn.recv(65536)
                    if not chunk:
                        raise ConnectionResetError
                    buf += chunk
                magic, ver, hlen, _idx, L, M, _H, crc = struct.unpack(HEADER_FMT, buf[:HEADER_SIZE])
                if magic != MAGIC or ver != VERSION or hlen != HEADER_SIZE:
                    with metrics.lock:
                        metrics.dropped += 1
                    buf = buf[1:]
                    continue
                total = HEADER_SIZE + (L * 2 + (L + M - 1) + M) * 4
                while len(buf) < total:
                    chunk = conn.recv(65536)
                    if not chunk:
                        raise ConnectionResetError
                    buf += chunk
                frame, buf = buf[:total], buf[total:]
                if out:
                    try:
                        out.sendall(frame)
                    except OSError:
                        out = None
                payload = frame[HEADER_SIZE:]
                if zlib.crc32(payload) & 0xFFFFFFFF != crc:
                    with metrics.lock:
                        metrics.crc_errors += 1
                    continue
                reference = array("f")
                reference.frombytes(payload[: L * 4])
                error = array("f")
                error.frombytes(payload[L * 4 : L * 8])
                analyse(metrics, reference, error, rate)
        except (ConnectionResetError, OSError):
            print("pi disconnected")
        finally:
            conn.close()
            if out:
                out.close()


def simulate(metrics, rate):
    """The same tonal hum the web demo shows, so Grafana is never empty."""
    block = 512
    t0 = time.time()
    phase = 0.0
    while True:
        now = time.time()
        drift = math.sin((now - t0) / 40.0)
        dominant = 120.0 + drift * 1.5
        amp = 0.62 + 0.02 * math.sin((now - t0) / 17.0)
        with metrics.lock:
            anc = metrics.anc
        depth = 0.80 if anc else 0.0
        reference = array("f", [0.0] * block)
        error = array("f", [0.0] * block)
        for i in range(block):
            phase_i = phase + 2.0 * math.pi * dominant * i / rate
            tone = amp * math.sin(phase_i)
            harm = amp * 0.3 * math.sin(2 * phase_i) + amp * 0.16 * math.sin(3 * phase_i)
            broadband = 0.05 * math.sin(i * 12.9898 + now)
            reference[i] = tone + harm + broadband
            error[i] = tone * (1 - depth) + harm * (1 - depth * 0.55) + broadband
        phase = (phase + 2.0 * math.pi * dominant * block / rate) % (2.0 * math.pi)
        analyse(metrics, reference, error, rate)
        with metrics.lock:
            metrics.power = 5.2 + 0.12 * math.sin((now - t0) / 9.0) if anc else 0.4
        time.sleep(block / rate)


def render(metrics):
    with metrics.lock:
        limit, night = metrics.limit()
        attenuation = max(0.0, metrics.baseline - metrics.residual)
        efficiency = attenuation / metrics.power if metrics.power > 0.05 else 0.0
        profile = PROFILES[metrics.profile]
        snapshot = dict(
            baseline=metrics.baseline, residual=metrics.residual, dominant=metrics.dominant,
            phase=metrics.phase if metrics.anc else 0.0, power=metrics.power, anc=metrics.anc,
            frames=metrics.frames, crc=metrics.crc_errors, dropped=metrics.dropped,
            exceedances=metrics.exceedances, energy=metrics.energy_wh, age=time.time() - metrics.last_update,
            base_bands=list(metrics.spectrum_base), now_bands=list(metrics.spectrum_now),
        )
    lines = []

    def g(name, help_text, value, labels=""):
        lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} gauge")
        lines.append(f"{name}{labels} {value:.6g}")

    def c(name, help_text, value):
        lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} counter")
        lines.append(f"{name} {value:.6g}")

    g("threshold_baseline_dba", "Level at the reference microphone, uncalibrated", snapshot["baseline"])
    g("threshold_residual_dba", "Level at the error microphone after cancellation", snapshot["residual"])
    g("threshold_attenuation_db", "Baseline minus residual", max(0.0, snapshot["baseline"] - snapshot["residual"]))
    g("threshold_dominant_hz", "Dominant tonal frequency below 400 Hz", snapshot["dominant"])
    g("threshold_cancellation_hz", "Frequency the controller is cancelling", snapshot["dominant"] if snapshot["anc"] else 0.0)
    g("threshold_phase_degrees", "Phase adjustment applied to the inverse", snapshot["phase"])
    g("threshold_power_watts", "Power drawn by the cancellation unit", snapshot["power"])
    g("threshold_anc_active", "1 when cancellation is running, 0 on standby", snapshot["anc"])
    g("threshold_efficiency_db_per_watt", "Attenuation achieved per watt drawn", efficiency)
    g("threshold_limit_dba", "Ordinance limit in force right now", limit,
      '{profile="%s",period="%s"}' % (profile["label"], "night" if night else "day"))
    g("threshold_margin_db", "Headroom below the limit in force, negative means exceeding", limit - snapshot["residual"])
    g("threshold_energy_wh", "Energy drawn since this exporter started", snapshot["energy"])
    g("threshold_feed_age_seconds", "Seconds since the last frame was measured", snapshot["age"])
    for i, freq in enumerate(BANDS):
        g("threshold_spectrum_baseline_db", "Baseline band level", snapshot["base_bands"][i], '{freq_hz="%.0f"}' % freq)
    for i, freq in enumerate(BANDS):
        g("threshold_spectrum_current_db", "Current band level", snapshot["now_bands"][i], '{freq_hz="%.0f"}' % freq)
    c("threshold_frames_total", "Frames measured", snapshot["frames"])
    c("threshold_crc_errors_total", "Frames dropped on a CRC mismatch", snapshot["crc"])
    c("threshold_malformed_total", "Bytes dropped looking for a frame header", snapshot["dropped"])
    c("threshold_exceedances_total", "Times the level held above the limit in force", snapshot["exceedances"])
    return "\n".join(lines) + "\n"


class Handler(BaseHTTPRequestHandler):
    metrics = None

    def do_GET(self):
        if self.path.startswith("/metrics"):
            body = render(self.metrics).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path.startswith("/anc/"):
            want = 1 if self.path.rstrip("/").endswith("on") else 0
            with self.metrics.lock:
                self.metrics.anc = want
            self.send_response(204)
            self.end_headers()
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<h1>THRESHOLD exporter</h1><p>Metrics at <a href='/metrics'>/metrics</a>.</p>")

    def log_message(self, *args):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--listen", default="0.0.0.0:5000", help="where the Pi connects")
    ap.add_argument("--forward", default="", help="host:port of the real ingest server, blank to measure only")
    ap.add_argument("--metrics-port", type=int, default=9109)
    ap.add_argument("--rate", type=float, default=16000.0, help="sample rate of the incoming frames")
    ap.add_argument("--profile", default="prince_william", choices=sorted(PROFILES))
    ap.add_argument("--calibration-offset", type=float, default=73.0,
                    help="dB added to the raw level so readings sit on a meter's scale. Set it by reading a calibrated meter beside the microphone and matching the numbers.")
    ap.add_argument("--price", type=float, default=0.14, help="energy price per kWh")
    ap.add_argument("--simulate", action="store_true", help="generate data instead of waiting for hardware")
    args = ap.parse_args()

    metrics = Metrics(args.profile, args.calibration_offset, args.price)
    worker = simulate if args.simulate else tee_server
    target = (metrics, args.rate) if args.simulate else (metrics, args.listen, args.forward, args.rate)
    threading.Thread(target=worker, args=target, daemon=True).start()

    Handler.metrics = metrics
    server = ThreadingHTTPServer(("0.0.0.0", args.metrics_port), Handler)
    print(f"metrics on http://0.0.0.0:{args.metrics_port}/metrics ({'simulated' if args.simulate else 'live'})")
    server.serve_forever()


if __name__ == "__main__":
    main()
