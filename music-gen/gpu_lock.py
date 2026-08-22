# Gemeinsame GPU-Dateisperre für image-gen und music-gen.
# Identisch halten mit music-gen/gpu_lock.py (getrennte Docker-Build-Kontexte).
import fcntl
import os
import time
import urllib.error
import urllib.request
from contextlib import contextmanager

GPU_LOCK_PATH = (os.getenv("GPU_LOCK_PATH") or "").strip()
GPU_LOCK_TIMEOUT = float(os.getenv("GPU_LOCK_TIMEOUT", "180"))
VLLM_METRICS_URL = (os.getenv("VLLM_METRICS_URL") or "").strip()
VLLM_IDLE_TIMEOUT = float(os.getenv("VLLM_IDLE_TIMEOUT", "60"))
VLLM_API_KEY = (os.getenv("VLLM_API_KEY") or "").strip()


class GpuLockTimeout(Exception):
    pass


@contextmanager
def gpu_file_lock(timeout=None):
    if not GPU_LOCK_PATH:
        yield
        return
    limit = GPU_LOCK_TIMEOUT if timeout is None else timeout
    folder = os.path.dirname(GPU_LOCK_PATH)
    if folder:
        os.makedirs(folder, exist_ok=True)
    fh = open(GPU_LOCK_PATH, "a+")
    deadline = time.monotonic() + max(0.0, limit)
    try:
        while True:
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise GpuLockTimeout(f"GPU-Sperre nach {limit:.0f}s nicht frei")
                time.sleep(0.25)
        yield
    finally:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        fh.close()


def gpu_lock_is_held():
    if not GPU_LOCK_PATH or not os.path.exists(GPU_LOCK_PATH):
        return False
    fh = open(GPU_LOCK_PATH, "a+")
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        return False
    except BlockingIOError:
        return True
    finally:
        fh.close()


def vllm_running_requests(url=None):
    target = (url or VLLM_METRICS_URL).strip()
    if not target:
        return None
    try:
        req = urllib.request.Request(target)
        if VLLM_API_KEY:
            req.add_header("Authorization", f"Bearer {VLLM_API_KEY}")
        with urllib.request.urlopen(req, timeout=2) as r:
            body = r.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"vLLM-Metriken nicht lesbar: {e}")
        return None
    total = 0.0
    found = False
    for line in body.splitlines():
        if line.startswith("#"):
            continue
        if "num_requests_running" not in line:
            continue
        found = True
        parts = line.rsplit(None, 1)
        if len(parts) == 2:
            try:
                total += float(parts[1])
            except ValueError:
                pass
    return total if found else None


def wait_for_vllm_idle(timeout=None):
    if not VLLM_METRICS_URL:
        return
    limit = VLLM_IDLE_TIMEOUT if timeout is None else timeout
    deadline = time.monotonic() + max(0.0, limit)
    while True:
        running = vllm_running_requests()
        if running is None or running <= 0:
            return
        if time.monotonic() >= deadline:
            print(f"vLLM nach {limit:.0f}s noch beschäftigt ({running:.0f} Anfragen) – erzeuge trotzdem")
            return
        time.sleep(0.4)
