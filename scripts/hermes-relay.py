#!/usr/bin/env python3
"""Hermes Bridge Socket Relay (Sofia v6 Spec E.4.2)

Forwards traffic from Coolify bridge gateway (10.0.1.1:8644) to host loopback (127.0.0.1:8643).
Allows containerized Sofia to access host-bound Hermes gateway safely.
"""

import socket
import threading
import select
import sys

LISTEN = ("0.0.0.0" if "--all" in sys.argv else "10.0.1.1", 8644)
TARGET = ("127.0.0.1", 8643)

def pipe(a, b):
    try:
        while True:
            r, _, _ = select.select([a, b], [], [], 60)
            if not r:
                break
            for s in r:
                d = s.recv(65536)
                if not d:
                    return
                (b if s is a else a).sendall(d)
    except OSError:
        pass
    finally:
        try:
            a.close()
        except Exception:
            pass
        try:
            b.close()
        except Exception:
            pass

def main():
    print(f"Starting Hermes relay: listening on {LISTEN[0]}:{LISTEN[1]} -> target {TARGET[0]}:{TARGET[1]}")
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        srv.bind(LISTEN)
    except Exception as e:
        print(f"Failed to bind {LISTEN}: {e}. Trying 127.0.0.1:8644 for local testing...")
        srv.bind(("127.0.0.1", 8644))
    srv.listen(16)
    while True:
        try:
            c, _ = srv.accept()
            t = socket.create_connection(TARGET)
            threading.Thread(target=pipe, args=(c, t), daemon=True).start()
        except KeyboardInterrupt:
            print("\nShutting down relay.")
            break
        except Exception as e:
            print(f"Relay error: {e}")

if __name__ == "__main__":
    main()
