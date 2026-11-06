#!/usr/bin/env python3
"""
Sofia PC Collector Agent (scripts/agent-pc.py)
Polls ActivityWatch (localhost:5600) or OS window hooks.
Batches events to /api/ingest/events (every 60s).
Sends heartbeats to /api/ingest/heartbeat (every 30s).
"""

import os
import sys
import time
import json
import socket
import logging
import urllib.request
import urllib.error
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger("sofia-agent-pc")

SOFIA_HOST = os.getenv("SOFIA_HOST", "http://localhost:3000").rstrip('/')
DEVICE_TOKEN = os.getenv("SOFIA_DEVICE_TOKEN", "sofia-device-primary")
DEVICE_ID = os.getenv("SOFIA_DEVICE_ID", socket.gethostname() or "pc-main")
AW_HOST = os.getenv("AW_HOST", "http://localhost:5600").rstrip('/')

HEARTBEAT_INTERVAL_S = 30
EVENT_SYNC_INTERVAL_S = 60

last_aw_event_id = None

def post_json(endpoint: str, data: dict) -> dict:
    url = f"{SOFIA_HOST}{endpoint}"
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Device-Token": DEVICE_TOKEN,
            "User-Agent": "Sofia-PC-Collector/1.0"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.URLError as e:
        logger.debug(f"Failed to post to {url}: {e}")
        return {"error": str(e)}

def fetch_json(url: str):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Sofia-PC-Collector/1.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        logger.debug(f"AW fetch failed for {url}: {e}")
        return None

def check_aw_status() -> bool:
    res = fetch_json(f"{AW_HOST}/api/0/info")
    return res is not None

def send_heartbeat():
    now_iso = datetime.now(timezone.utc).isoformat()
    # Check if user is AFK via ActivityWatch afk bucket if available
    is_afk = False
    buckets = fetch_json(f"{AW_HOST}/api/0/buckets")
    if buckets:
        afk_bucket = next((k for k in buckets.keys() if "afk" in k), None)
        if afk_bucket:
            events = fetch_json(f"{AW_HOST}/api/0/buckets/{afk_bucket}/events?limit=1")
            if events and isinstance(events, list) and len(events) > 0:
                status = events[0].get("data", {}).get("status", "not-afk")
                if status == "afk":
                    is_afk = True

    payload = {
        "device": DEVICE_ID,
        "status": "afk" if is_afk else "active",
        "ts": now_iso
    }
    logger.debug(f"Sending heartbeat: {payload}")
    post_json("/api/ingest/heartbeat", payload)

def poll_and_send_events():
    global last_aw_event_id
    buckets = fetch_json(f"{AW_HOST}/api/0/buckets")
    if not buckets:
        logger.debug("No ActivityWatch buckets found or AW not running.")
        return

    window_bucket = next((k for k in buckets.keys() if "window" in k), None)
    if not window_bucket:
        logger.debug("No ActivityWatch window bucket found.")
        return

    events = fetch_json(f"{AW_HOST}/api/0/buckets/{window_bucket}/events?limit=50")
    if not events or not isinstance(events, list):
        return

    sofia_events = []
    for evt in reversed(events):
        evt_id = f"aw-{evt.get('id', '')}"
        data = evt.get("data", {})
        app = data.get("app", "unknown")
        title = data.get("title", "")
        duration_s = int(evt.get("duration", 0))
        ts = evt.get("timestamp", datetime.now(timezone.utc).isoformat())

        # Category mapping heuristics
        app_lower = app.lower()
        title_lower = title.lower()
        if any(w in app_lower for w in ["code", "terminal", "nvim", "tmux", "bash", "sublime", "webstorm"]):
            category = "work"
        elif any(w in app_lower or w in title_lower for w in ["youtube", "netflix", "twitch", "reddit", "twitter", "x.com", "steam"]):
            category = "leisure"
        else:
            category = "neutral"

        sofia_events.append({
            "id": evt_id,
            "ts": ts,
            "source": "activitywatch",
            "kind": "window",
            "category": category,
            "app": app,
            "title": title[:200],
            "duration_s": max(1, duration_s)
        })

    if sofia_events:
        res = post_json("/api/ingest/events", {"events": sofia_events})
        logger.info(f"Ingested {len(sofia_events)} events from ActivityWatch: {res}")

def main():
    logger.info(f"Starting Sofia PC Collector for device '{DEVICE_ID}' targeting '{SOFIA_HOST}'")
    last_heartbeat = 0
    last_event_sync = 0

    while True:
        now = time.time()
        try:
            if now - last_heartbeat >= HEARTBEAT_INTERVAL_S:
                send_heartbeat()
                last_heartbeat = now

            if now - last_event_sync >= EVENT_SYNC_INTERVAL_S:
                poll_and_send_events()
                last_event_sync = now
        except Exception as e:
            logger.error(f"Collector loop iteration failed: {e}")

        time.sleep(2)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Collector stopped by user.")
        sys.exit(0)
