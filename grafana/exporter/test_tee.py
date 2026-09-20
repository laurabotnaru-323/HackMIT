"""Integration test: real frames through the exporter tee path.

    python3 grafana/exporter/test_tee.py

Needs numpy, which threshold-ml already depends on. Checks that frames are
parsed, that bytes reach the downstream ingest unchanged, and that the tone
and attenuation come out right.
"""
import math, socket, struct, subprocess, sys, threading, time, urllib.request, zlib
sys.path.insert(0, '/home/user/HackMIT/threshold-ml/src')
from threshold_ml.ingest.raw_protocol import pack_frame, HEADER_SIZE
import numpy as np

RATE, L, M = 16000, 2048, 64
received = []

def sink(port, ready):
    srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('127.0.0.1', port)); srv.listen(1); ready.set()
    conn, _ = srv.accept()
    while True:
        b = conn.recv(65536)
        if not b: break
        received.append(b)

ready = threading.Event()
threading.Thread(target=sink, args=(5099, ready), daemon=True).start()
ready.wait(5)

proc = subprocess.Popen([sys.executable, '/home/user/HackMIT/grafana/exporter/threshold_exporter.py',
                         '--listen', '127.0.0.1:5098', '--forward', '127.0.0.1:5099',
                         '--metrics-port', '9111', '--rate', str(RATE)],
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(2.0)

s = socket.create_connection(('127.0.0.1', 5098), timeout=5)
n = np.arange(L)
tone = 0.62 * np.sin(2 * np.pi * 120 * n / RATE)
harm = 0.19 * np.sin(2 * np.pi * 240 * n / RATE)
sent = 0
for i in range(14):
    reference = (tone + harm + 0.02 * np.random.randn(L)).astype('float32')
    error = (tone * 0.20 + harm * 0.45 + 0.02 * np.random.randn(L)).astype('float32')
    speaker = np.zeros(L + M - 1, dtype='float32')
    secondary = np.zeros(M, dtype='float32'); secondary[0] = 1.0
    frame = pack_frame(np.ascontiguousarray(reference), np.ascontiguousarray(error),
                       speaker, secondary, i)
    s.sendall(frame); sent += len(frame)
    time.sleep(0.12)
time.sleep(1.2)

body = urllib.request.urlopen('http://127.0.0.1:9111/metrics', timeout=5).read().decode()
vals = {}
for line in body.splitlines():
    if line.startswith('#') or not line.strip(): continue
    name, _, v = line.rpartition(' ')
    vals[name.strip()] = float(v)
fwd = sum(len(b) for b in received)
print(f"frames measured      {vals.get('threshold_frames_total')}")
print(f"crc errors           {vals.get('threshold_crc_errors_total')}")
print(f"malformed bytes      {vals.get('threshold_malformed_total')}")
print(f"baseline dBA         {vals.get('threshold_baseline_dba'):.1f}")
print(f"residual dBA         {vals.get('threshold_residual_dba'):.1f}")
print(f"attenuation dB       {vals.get('threshold_attenuation_db'):.1f}")
print(f"dominant Hz          {vals.get('threshold_dominant_hz'):.0f}")
print(f"bytes sent/forwarded {sent} / {fwd}")
ok = (vals.get('threshold_frames_total') == 14 and vals.get('threshold_crc_errors_total') == 0
      and vals.get('threshold_malformed_total') == 0 and fwd == sent
      and abs(vals.get('threshold_dominant_hz') - 120) <= 1
      and 10 <= vals.get('threshold_attenuation_db') <= 16)
print('TEE TEST', 'PASS' if ok else 'FAIL')
proc.terminate()
sys.exit(0 if ok else 1)
