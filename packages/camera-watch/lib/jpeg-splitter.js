'use strict';

// Splits a byte stream of back-to-back JPEG images (what `ffmpeg -f mjpeg pipe:1`
// writes) into whole frames. A frame starts at SOI (FF D8) and ends at EOI (FF D9).
// Entropy-coded JPEG data stuffs every 0xFF data byte as FF 00, so FF D9 inside a
// frame can only be the real end marker.

const SOI_0 = 0xff;
const SOI_1 = 0xd8;
const EOI_1 = 0xd9;
const MAX_FRAME_BYTES = 16 * 1024 * 1024;

class JpegSplitter {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.parts = [];
    this.size = 0;
    this.inFrame = false;
    this.prevByte = -1;
  }

  push(chunk) {
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i];
      const prev = i > 0 ? chunk[i - 1] : this.prevByte;
      if (!this.inFrame) {
        if (prev === SOI_0 && b === SOI_1) {
          this.inFrame = true;
          this.parts = [Buffer.from([SOI_0])];
          this.size = 1;
          start = i;
        }
      } else if (prev === SOI_0 && b === EOI_1) {
        this._append(chunk.subarray(start, i + 1));
        const frame = Buffer.concat(this.parts, this.size);
        this.parts = [];
        this.size = 0;
        this.inFrame = false;
        this.onFrame(frame);
      }
    }
    if (this.inFrame) {
      this._append(chunk.subarray(start));
      if (this.size > MAX_FRAME_BYTES) {
        // Not a JPEG stream after all; drop it instead of growing without bound.
        this.parts = [];
        this.size = 0;
        this.inFrame = false;
      }
    }
    this.prevByte = chunk.length ? chunk[chunk.length - 1] : this.prevByte;
  }

  _append(buf) {
    if (!buf.length) return;
    this.parts.push(buf);
    this.size += buf.length;
  }
}

module.exports = { JpegSplitter };
