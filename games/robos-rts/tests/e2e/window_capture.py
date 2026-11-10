"""Record the Windows game window without requesting screenshots from Godot."""
import ctypes
from ctypes import wintypes
import subprocess
from threading import Event, Thread
import time


WIDTH, HEIGHT = 1280, 720


def offscreen_position():
    metrics = ctypes.windll.user32.GetSystemMetrics
    virtual_left, virtual_top = metrics(76), metrics(77)
    return f"{virtual_left - WIDTH - 40},{virtual_top + 80}"


def window_for_process(pid):
    user32 = ctypes.windll.user32
    windows = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def find(hwnd, _):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value == pid and user32.IsWindowVisible(hwnd) and user32.GetWindowTextLengthW(hwnd):
            windows.append(hwnd)
        return True

    user32.EnumWindows(find, 0)
    if not windows:
        raise RuntimeError("No visible window found for the isolated Godot process")
    return windows[0]


class WindowCapture:
    def __init__(self, ffmpeg, pid, output):
        self.ffmpeg = ffmpeg
        self.pid = pid
        self.video = output / "walkthrough.mp4"
        self.log = output / "encoding.log"
        self.process = None
        self.started = None

    def start(self):
        hwnd = window_for_process(self.pid)
        source = (f"gfxcapture=hwnd={hwnd}:capture_cursor=0:max_framerate=60:"
                  f"width={WIDTH}:height={HEIGHT}:resize_mode=scale_aspect,hwdownload,format=bgra")
        command = [self.ffmpeg, "-hide_banner", "-loglevel", "warning", "-y", "-stats_period", "0.2",
                   "-progress", "pipe:1", "-f", "lavfi", "-i", source,
                   "-an", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast",
                   "-crf", "18", "-movflags", "+faststart", str(self.video)]
        with self.log.open("wb") as log:
            self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                            stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
        ready = Event()
        Thread(target=self._read_progress, args=(self.process.stdout, ready), daemon=True).start()
        if not ready.wait(8) or self.started is None:
            self.stop()
            raise RuntimeError(f"FFmpeg did not receive game frames. See {self.log}")

    def _read_progress(self, stream, ready):
        with stream:
            for line in stream:
                key, _, value = line.strip().partition(b"=")
                if self.started is None and key == b"out_time_us" and value.isdigit() and int(value) > 0:
                    self.started = time.monotonic() - int(value) / 1_000_000
                    ready.set()
        ready.set()

    def stop(self):
        process = self.process
        if process is None:
            return
        self.process = None
        try:
            with process.stdin:
                if process.poll() is None:
                    process.stdin.write(b"q\n")
        except BrokenPipeError:
            pass
        try:
            process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise RuntimeError(f"FFmpeg could not finish the recording. See {self.log}")
        if process.returncode != 0 or not self.video.is_file() or self.video.stat().st_size == 0:
            raise RuntimeError(f"FFmpeg did not write a valid recording. See {self.log}")
