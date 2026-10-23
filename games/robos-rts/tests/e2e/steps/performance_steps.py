import json
import socket
import time
from behave import when, then


@when("control clients deliver incomplete requests while the live game runs")
def fragmented_requests(context):
    client = context.client
    assert client.set_playback(False, 1)["ok"]
    time.sleep(.5)
    client._request("POST", "/performance", {"reset": True})
    start = client.health()["tick"]
    peers = []
    try:
        # Neither peer sends a complete HTTP request. The former server waited
        # 50/100 ms per peer, repeatedly blocking input and simulation.
        for fragment in (b"GET /health HTTP/1.1\r\n", b"POST /action HTTP/1.1\r\nContent-Length: 100\r\n\r\n{"):
            peer = socket.create_connection(("127.0.0.1", context.port))
            peer.sendall(fragment)
            peers.append(peer)
        time.sleep(.8)
        context.slow_client_ticks = client.health()["tick"] - start
        context.slow_client_performance = client._request("GET", "/performance")
        peers[0].sendall(b"\r\n")
        peers[0].settimeout(5)
        response = b""
        while chunk := peers[0].recv(65536):
            response += chunk
        assert json.loads(response.split(b"\r\n\r\n", 1)[1])["ok"]
        # Deliberately split a multibyte character between TCP packets.
        body = json.dumps({"step": "Map \u2605"}, ensure_ascii=False).encode("utf-8")
        cut = body.index("\u2605".encode("utf-8")) + 1
        with socket.create_connection(("127.0.0.1", context.port)) as peer:
            header = f"POST /overlay HTTP/1.1\r\nContent-Length: {len(body)}\r\n\r\n".encode()
            peer.sendall(header + body[:cut])
            time.sleep(.1)
            peer.sendall(body[cut:])
            peer.settimeout(5)
            response = b""
            while chunk := peer.recv(65536):
                response += chunk
            assert json.loads(response.split(b"\r\n\r\n", 1)[1])["ok"]
    finally:
        for peer in peers:
            peer.close()


@then("incomplete requests did not block the simulation or frame loop")
def responsive(context):
    assert context.slow_client_ticks >= 40, context.slow_client_ticks
    assert context.slow_client_performance["frame"]["max_ms"] < 100, context.slow_client_performance


@when("a rendered frame is encoded asynchronously during live play")
def capture_live(context):
    if context.live_headless:
        context.capture_ticks = None
        return
    client = context.client
    context.live.drain_capture(wait=True)
    obs = client.get_observation()
    context.live.follow_camera(obs)
    client.set_overlay("Live play continues during frame encoding", "Asynchronous capture | 1 player vs built-in AI")
    path = context.live.output / "responsiveness.png"
    start = client.health()["tick"]
    result = client.screenshot(path.as_posix(), asynchronous=True)
    assert result["ok"] and result["pending"], result
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        status = client.capture_status()
        if not status["pending"]:
            assert status["ok"], status
            break
        time.sleep(.02)
    else:
        raise AssertionError("Frame encoding never completed")
    time.sleep(.1)
    context.capture_ticks = client.health()["tick"] - start
    assert path.stat().st_size > 0
    context.capture_performance = client._request("GET", "/performance")


@then("the capture completed while simulation ticks continued")
def captured(context):
    if context.capture_ticks is not None:
        assert context.capture_ticks >= 5, context.capture_ticks
        assert context.capture_performance["frame"]["max_ms"] < 100, context.capture_performance
    assert context.client.health()["manual_step_requests"] == 0
    context.live.final = context.client.get_observation()
    context.live.performance.append(context.slow_client_performance)
    if context.capture_ticks is not None:
        context.live.performance.append(context.capture_performance)
    context.live.wall_seconds = time.monotonic() - context.live.created
    context.live.autonomous_ticks = context.live.final["tick"]
    context.client.set_playback(True, 1)
