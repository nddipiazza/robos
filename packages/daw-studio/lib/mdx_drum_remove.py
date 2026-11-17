#!/usr/bin/env python3
"""
RobOS DAW Studio — Neural MDX-Net (kuielab_b_drums.onnx) + STFT HPSS Drum Remover

Separates and subtracts the drum stem from a 16/24/32-bit RIFF WAV file while
preserving exact sample count, sample rate, channel count, and zero-phase alignment
(`drumless = original_mix - compensation * predicted_drums`).
"""

import json
import math
import os
import subprocess
import sys
import wave
import numpy as np


def read_wav_float32(path, target_sr=None):
    """Decode any WAV file via ffmpeg into float32 stereo (2, N) + sample_rate."""
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=sample_rate,channels",
            "-of", "json", path,
        ],
        capture_output=True, text=True, check=True,
    )
    info = json.loads(probe.stdout or "{}")
    streams = info.get("streams") or [{}]
    orig_sr = int(streams[0].get("sample_rate") or 48000)
    orig_ch = max(1, min(2, int(streams[0].get("channels") or 2)))
    sr = target_sr or orig_sr

    cmd = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-i", path,
        "-vn", "-ar", str(sr), "-ac", "2",
        "-f", "f32le", "pipe:1",
    ]
    proc = subprocess.run(cmd, capture_output=True, check=True)
    raw = np.frombuffer(proc.stdout, dtype=np.float32)
    frames = len(raw) // 2
    stereo = raw[: frames * 2].reshape(frames, 2).T.copy()  # (2, frames)
    return stereo, sr, orig_sr, orig_ch


def resample_array_via_ffmpeg(stereo_arr, src_sr, dst_sr, exact_frames):
    """High-quality sinc resample (2, N) float32 from src_sr to dst_sr with exact frame count."""
    if src_sr == dst_sr:
        cur = stereo_arr.shape[1]
        if cur >= exact_frames:
            return stereo_arr[:, :exact_frames]
        return np.pad(stereo_arr, ((0, 0), (0, exact_frames - cur)))

    interleaved = stereo_arr.T.astype(np.float32).tobytes()
    cmd = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-f", "f32le", "-ar", str(src_sr), "-ac", "2", "-i", "pipe:0",
        "-ar", str(dst_sr), "-ac", "2", "-f", "f32le", "pipe:1",
    ]
    proc = subprocess.run(cmd, input=interleaved, capture_output=True, check=True)
    out = np.frombuffer(proc.stdout, dtype=np.float32)
    frames = len(out) // 2
    res = out[: frames * 2].reshape(frames, 2).T.copy()
    if res.shape[1] >= exact_frames:
        return res[:, :exact_frames]
    return np.pad(res, ((0, 0), (0, exact_frames - res.shape[1])))


def write_wav_pcm24(path, stereo_arr, sr, channels=2):
    """Write float32 (2, N) to 24-bit PCM RIFF WAV via ffmpeg for bit-exact studio quality."""
    if channels == 1:
        mono = (0.5 * (stereo_arr[0] + stereo_arr[1])).astype(np.float32)
        payload = np.clip(mono, -0.995, 0.995).tobytes()
        in_ch = "1"
    else:
        clipped = np.clip(stereo_arr.T, -0.995, 0.995).astype(np.float32)
        payload = clipped.tobytes()
        in_ch = "2"

    cmd = [
        "ffmpeg", "-nostdin", "-y", "-v", "error",
        "-f", "f32le", "-ar", str(sr), "-ac", in_ch, "-i", "pipe:0",
        "-fflags", "+bitexact", "-map_metadata", "-1",
        "-c:a", "pcm_s24le", path,
    ]
    subprocess.run(cmd, input=payload, capture_output=True, check=True)


def predict_drums_mdx_onnx(stereo_44k, model_path):
    """Run Kuielab MDX-Net ONNX drum stem extraction at 44.1 kHz with 50% overlap-add."""
    import onnxruntime as ort

    sess_opts = ort.SessionOptions()
    cpus = max(1, os.cpu_count() or 4)
    sess_opts.intra_op_num_threads = cpus
    sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(model_path, sess_options=sess_opts, providers=["CPUExecutionProvider"])

    n_fft = 4096
    hop = 1024
    dim_f = 2048
    dim_t = 128
    chunk_size = hop * (dim_t - 1)  # 130,048 samples (~2.95s)
    step_size = chunk_size // 2     # 50% overlap for seamless crossfades
    norm_scale = 1.0 / math.sqrt(n_fft)

    win = (0.5 - 0.5 * np.cos(2.0 * math.pi * np.arange(n_fft, dtype=np.float32) / n_fft)).astype(np.float32)
    win_sq = win * win

    orig_len = stereo_44k.shape[1]
    pad_left = n_fft
    pad_right = chunk_size + n_fft
    padded = np.pad(stereo_44k, ((0, 0), (pad_left, pad_right)), mode="reflect")
    total_len = padded.shape[1]

    # Triangular/raised-cosine chunk blending window across chunk_size + n_fft
    seg_len = chunk_size + n_fft
    fade = np.hanning(seg_len).astype(np.float32)
    fade = np.maximum(fade, 1e-4)

    out_acc = np.zeros((2, total_len), dtype=np.float32)
    weight_acc = np.zeros(total_len, dtype=np.float32)

    starts = list(range(0, max(1, total_len - seg_len + 1), step_size))
    batch_size = 4

    for b0 in range(0, len(starts), batch_size):
        batch_starts = starts[b0 : b0 + batch_size]
        batch_inputs = []
        for s in batch_starts:
            seg = padded[:, s : s + seg_len]  # (2, seg_len)
            frames = np.lib.stride_tricks.sliding_window_view(seg, n_fft, axis=-1)[:, ::hop, :][:, :dim_t, :]
            spec = np.fft.rfft(frames * win, axis=-1) * norm_scale  # (2, dim_t, 2049)
            spec = np.transpose(spec[:, :, :dim_f], (0, 2, 1))      # (2, 2048, 128)
            inp = np.stack([spec[0].real, spec[0].imag, spec[1].real, spec[1].imag], axis=0)
            batch_inputs.append(inp)

        inp_tensor = np.stack(batch_inputs, axis=0).astype(np.float32)
        ort_outs = sess.run(None, {"input": inp_tensor})[0]  # (B, 4, 2048, 128)

        for idx, s in enumerate(batch_starts):
            pred = ort_outs[idx]
            spec_L = np.pad((pred[0] + 1j * pred[1]) / norm_scale, ((0, 1), (0, 0)))
            spec_R = np.pad((pred[2] + 1j * pred[3]) / norm_scale, ((0, 1), (0, 0)))

            frames_L = np.fft.irfft(spec_L, n=n_fft, axis=0) * win[:, None]  # (4096, 128)
            frames_R = np.fft.irfft(spec_R, n=n_fft, axis=0) * win[:, None]

            seg_ola = np.zeros((2, seg_len), dtype=np.float32)
            seg_w = np.zeros(seg_len, dtype=np.float32)
            for f in range(dim_t):
                p = f * hop
                seg_ola[0, p : p + n_fft] += frames_L[:, f]
                seg_ola[1, p : p + n_fft] += frames_R[:, f]
                seg_w[p : p + n_fft] += win_sq

            seg_wav = seg_ola / np.maximum(seg_w[None, :], 1e-8)
            out_acc[:, s : s + seg_len] += seg_wav * fade[None, :]
            weight_acc[s : s + seg_len] += fade

    full_drums = out_acc / np.maximum(weight_acc[None, :], 1e-8)
    return full_drums[:, pad_left : pad_left + orig_len]


def hpss_remove_drums_fallback(stereo, sr):
    """Pure NumPy Fitzgerald (2010) 2D STFT Harmonic-Percussive Wiener Masking fallback."""
    n_fft = 2048
    hop = 512
    win = np.hanning(n_fft).astype(np.float32)
    win_sq = win * win
    orig_len = stereo.shape[1]
    padded = np.pad(stereo, ((0, 0), (n_fft, n_fft)), mode="reflect")

    out = np.zeros_like(padded)
    for ch in range(2):
        frames = np.lib.stride_tricks.sliding_window_view(padded[ch], n_fft)[::hop]
        spec = np.fft.rfft(frames * win, axis=-1)  # (T, F)
        mag = np.abs(spec)

        # Horizontal median across time (harmonic) vs vertical median across frequency (percussive)
        k_t = 17
        k_f = 17
        pad_t = np.pad(mag, ((k_t // 2, k_t // 2), (0, 0)), mode="edge")
        harm = np.median(np.lib.stride_tricks.sliding_window_view(pad_t, k_t, axis=0), axis=-1)

        pad_f = np.pad(mag, ((0, 0), (k_f // 2, k_f // 2)), mode="edge")
        perc = np.median(np.lib.stride_tricks.sliding_window_view(pad_f, k_f, axis=1), axis=-1)

        # Soft Wiener mask favoring harmonic instruments (margin p=2.2)
        h2 = (harm ** 2.2) + 1e-10
        p2 = ((perc * 1.25) ** 2.2) + 1e-10
        mask_h = h2 / (h2 + p2)
        harm_spec = spec * mask_h

        rec_frames = np.fft.irfft(harm_spec, n=n_fft, axis=-1) * win[None, :]
        wsum = np.zeros(padded.shape[1], dtype=np.float32)
        for i in range(rec_frames.shape[0]):
            p = i * hop
            out[ch, p : p + n_fft] += rec_frames[i]
            wsum[p : p + n_fft] += win_sq
        out[ch] /= np.maximum(wsum, 1e-8)

    return out[:, n_fft : n_fft + orig_len]


def main():
    cfg = json.loads(sys.argv[1])
    src_path = cfg["srcWav"]
    dst_path = cfg["dstWav"]
    model_path = cfg.get("modelPath") or ""
    compensation = float(cfg.get("compensation") or 1.028)
    force_hpss = bool(cfg.get("forceHpss") or False)

    orig_stereo, orig_sr, _, orig_ch = read_wav_float32(src_path, target_sr=None)
    exact_frames = orig_stereo.shape[1]

    method = "hpss-stft"
    if not force_hpss and model_path and os.path.isfile(model_path):
        try:
            stereo_44k = resample_array_via_ffmpeg(orig_stereo, orig_sr, 44100, max(2048, round(exact_frames * 44100 / orig_sr)))
            drums_44k = predict_drums_mdx_onnx(stereo_44k, model_path)
            drums_orig_sr = resample_array_via_ffmpeg(drums_44k, 44100, orig_sr, exact_frames)
            drumless = orig_stereo - (compensation * drums_orig_sr)
            method = "mdx-net-onnx"
        except Exception:
            drumless = hpss_remove_drums_fallback(orig_stereo, orig_sr)
    else:
        drumless = hpss_remove_drums_fallback(orig_stereo, orig_sr)

    write_wav_pcm24(dst_path, drumless, orig_sr, channels=orig_ch)
    orig_rms = float(np.sqrt(np.mean(orig_stereo ** 2)) + 1e-9)
    out_rms = float(np.sqrt(np.mean(drumless ** 2)) + 1e-9)
    print(json.dumps({
        "ok": True,
        "method": method,
        "frames": exact_frames,
        "sampleRate": orig_sr,
        "channels": orig_ch,
        "origRmsDb": round(20.0 * math.log10(orig_rms), 2),
        "outRmsDb": round(20.0 * math.log10(out_rms), 2),
    }))


if __name__ == "__main__":
    main()
