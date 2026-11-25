# Tablo DVR post: cross-post drafts

Source: https://rowbose.com/blog/#tablo-dvr-smart-tv-and-roku

---

## Medium / dev.to / Hashnode (full article, canonical URL points at rowbose.com)

**Title:** Getting my Tablo DVR to play on Linux and my Roku, no cloud involved

I have a Tablo 4th Gen DVR recording over-the-air TV in the living room. It works fine with the Tablo apps, but Tablo doesn't make one for Linux, and I wanted to watch recordings from my desk. Including the ones still being recorded, like a World Series game that was halfway through.

So I wrote my own client. A few things surprised me along the way.

### Every request has to be signed

The Tablo has a local HTTP API on port 8887, and it ignores anything that isn't signed. Each request needs an HMAC-MD5 signature over four lines: the method, the path, an MD5 of the body, and the date. Once I had that working, the rest was pretty normal REST. I could list recordings by category, pull the channel guide, and ask for a watch token for a specific recording.

### Browsers won't play broadcast TV

Over-the-air TV in the US is still MPEG-2 video with Dolby AC-3 audio. Chromium won't decode either one, and my app is Electron, so playing the stream directly wasn't an option.

I ended up running it through ffmpeg into H.264 and AAC, packaged as fragmented MP4 so playback can start before anything is finished:

```
ffmpeg -i <tablo stream> -c:v libx264 -preset ultrafast -tune zerolatency \
  -c:a aac -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof pipe:1
```

One bug worth mentioning. My Content-Security-Policy had `http://192.168.*` in it to allow LAN addresses. That isn't valid CSP. The browser doesn't complain, it just ignores the entry and blocks the stream. Replacing it with plain `http:` fixed it.

### The Roku was the easy part

My TV is a TCL Roku, and Roku can decode MPEG-2 and AC-3 in hardware. So for the TV I don't transcode at all. The Tablo returns an HLS playlist with relative segment paths. I rewrite those to absolute LAN addresses and the Roku pulls the segments straight from the Tablo at 60fps. My computer barely does anything.

I'd already been building a Roku channel for my movie library, so the DVR recordings got their own tab next to Movies and TV Shows.

### Thumbnails for shows still recording

Finished recordings come with a snapshot image. Recordings in progress don't. The field is just null until the broadcast ends, which made the live game look broken in the list. For those I open the live stream, grab a single frame with `ffmpeg -frames:v 1`, and use that until the real snapshot shows up.

### The code

This is part of RobOS, an open source app suite I've been working on. The Tablo client is `packages/robos-lib/tablo-client.js` on GitHub (github.com/nddipiazza/robos) if you want to read it or lift it for your own project. The original post has the architecture diagram and screenshots: https://rowbose.com/blog/#tablo-dvr-smart-tv-and-roku

I've only tested this on firmware 2.2.54. If you have a 4th Gen Tablo and try it, let me know how it goes.

---

## LinkedIn

Tablo doesn't make a Linux app for their OTA DVR, so I wrote a client for it.

Two things I didn't expect. The local API rejects every request that isn't HMAC-MD5 signed. And broadcast TV is still MPEG-2 with AC-3 audio, which Chromium won't play, so the desktop side runs through ffmpeg to H.264.

The Roku TV was easier. It decodes MPEG-2 in hardware, so I just rewrite the HLS playlist and it streams straight off the Tablo.

Write-up here: https://rowbose.com/blog/#tablo-dvr-smart-tv-and-roku

---

## Facebook

Got my Tablo DVR recordings playing on my Linux desktop and on the Roku in the living room, including a World Series game while it was still recording. Tablo doesn't make a Linux app so I ended up writing my own. Nerdy details if you're into that: https://rowbose.com/blog/#tablo-dvr-smart-tv-and-roku

---

## Hacker News

**Title:** Getting a Tablo OTA DVR to stream on Linux and Roku without the cloud
**URL:** (the Medium or dev.to copy, or the rowbose.com link directly)
**First comment (optional, posted after submitting):**

Author here. Tablo has no Linux client, so I wrote one. The interesting parts were the HMAC-MD5 signing on the local API and the fact that Chromium can't play MPEG-2/AC-3, while the Roku decodes it in hardware with no transcoding. Happy to answer questions.
