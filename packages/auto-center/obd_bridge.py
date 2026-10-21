"""Bluetooth serial (RFCOMM) bridge to an ELM327 OBD adapter.

Usage: obd_bridge.py <bluetooth address> <rfcomm channel>
Reads one JSON request per line on stdin: {"cmd": "ATZ", "timeout": 4.0}
Writes one JSON reply per line on stdout: {"ok": true, "text": "..."} with everything before the '>' prompt.
The first line written is {"ready": true} once connected, or {"error": "..."}.
"""
import json
import re
import socket
import sys
import time


def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    address, channel = sys.argv[1], int(sys.argv[2])
    if not re.fullmatch(r"[0-9A-F]{2}(:[0-9A-F]{2}){5}", address, re.I):
        out({"error": "Invalid Bluetooth address"})
        return 2
    try:
        sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
        sock.settimeout(15)
        sock.connect((address, channel))
    except OSError as e:
        out({"error": str(e)})
        return 1
    out({"ready": True})
    for line in sys.stdin:
        req = json.loads(line)
        cmd = str(req.get("cmd", ""))
        if not re.fullmatch(r"[A-Z0-9 @]{1,24}", cmd):
            out({"ok": False, "error": "Invalid adapter command"})
            continue
        try:
            sock.settimeout(0.05)  # drop anything left over from a timed-out command
            try:
                while sock.recv(1024):
                    pass
            except (socket.timeout, BlockingIOError):
                pass
            sock.sendall((cmd + "\r").encode("ascii"))
            buf, deadline = b"", time.time() + float(req.get("timeout", 5))
            sock.settimeout(0.2)
            while b">" not in buf and time.time() < deadline:
                try:
                    chunk = sock.recv(1024)
                except socket.timeout:
                    continue
                if not chunk:
                    out({"ok": False, "error": "The adapter closed the connection"})
                    return 1
                buf += chunk
            text = buf.decode("ascii", "replace").split(">")[0]
            out({"ok": b">" in buf, "text": text, **({} if b">" in buf else {"error": "The adapter did not answer in time"})})
        except OSError as e:
            out({"ok": False, "error": str(e)})
            return 1
    sock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
