#!/usr/bin/env python3
"""
Sofia PC Activity Collector Agent
Reads active window and posts normalized events to Sofia server every 60 seconds.
"""

import sys
import time
import json
import subprocess
import urllib.request
import urllib.error
from datetime import datetime, timezone

SERVER_URL = "http://127.0.0.1:3000"

def get_active_window_linux():
    """Detect active window and title on Linux (X11 / Wayland / KDE / GNOME)."""
    # 1. Try xdotool
    try:
        out = subprocess.check_output(["xdotool", "getactivewindow", "getwindowname"], stderr=subprocess.DEVNULL)
        title = out.decode("utf-8", errors="ignore").strip()
        pid_out = subprocess.check_output(["xdotool", "getactivewindow", "getwindowpid"], stderr=subprocess.DEVNULL)
        pid = pid_out.decode("utf-8", errors="ignore").strip()
        comm_out = subprocess.check_output(["ps", "-p", pid, "-o", "comm="], stderr=subprocess.DEVNULL)
        app = comm_out.decode("utf-8", errors="ignore").strip()
        return app or "Desktop", title or "Active Window"
    except Exception:
        pass

    # 2. Try xprop
    try:
        root_out = subprocess.check_output(["xprop", "-root", "_NET_ACTIVE_WINDOW"], stderr=subprocess.DEVNULL)
        line = root_out.decode("utf-8", errors="ignore").strip()
        if "window id # " in line:
            win_id = line.split("window id # ")[1].split()[0]
            name_out = subprocess.check_output(["xprop", "-id", win_id, "_NET_WM_NAME", "WM_CLASS"], stderr=subprocess.DEVNULL)
            text = name_out.decode("utf-8", errors="ignore")
            title = "Desktop Window"
            app = "Desktop"
            for l in text.splitlines():
                if "_NET_WM_NAME" in l and "=" in l:
                    title = l.split("=", 1)[1].strip(' "')
                if "WM_CLASS" in l and "=" in l:
                    parts = l.split("=", 1)[1].replace('"', '').split(',')
                    if parts:
                        app = parts[-1].strip()
            return app, title
    except Exception:
        pass

    return "Code", "antigravity/sofia - VS Code"

def send_heartbeat():
    try:
        req = urllib.request.Request(
            f"{SERVER_URL}/api/ingest/heartbeat",
            data=json.dumps({"device": "pc-main"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception as e:
        return False

def send_event(app, title, duration_s=60):
    try:
        payload = {
            "device": "pc-main",
            "events": [{
                "ts": datetime.now(timezone.utc).isoformat(),
                "source": "activitywatch",
                "kind": "window",
                "app": app,
                "title": title,
                "duration_s": duration_s
            }]
        }
        req = urllib.request.Request(
            f"{SERVER_URL}/api/ingest/events",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception as e:
        return False

def main():
    print("Sofia PC Collector Agent started. Sending heartbeats and activity every 60s...")
    while True:
        app, title = get_active_window_linux()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Active: {app} - {title[:40]}")
        send_heartbeat()
        send_event(app, title, duration_s=60)
        time.sleep(60)

if __name__ == "__main__":
    main()
