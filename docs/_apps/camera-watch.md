---
title: "RobOS Camera Watch"
package: camera-watch
category: household
icon: camera-watch.svg
summary: "Watches and records the IP cameras on your network: finds ONVIF cameras, shows a live grid, detects motion, records clips and drives pan/tilt/zoom cameras."
description: "RobOS Camera Watch is a local network video recorder in the spirit of iSpy. It finds ONVIF cameras with WS-Discovery, shows any RTSP or MJPEG camera in a live grid, detects motion on your computer, records motion and manual clips, and moves PTZ cameras. Video stays on your machine."
related:
  - /apps/smart-home/
  - /apps/movie-player/
  - /apps/robos-tv/
---

RobOS Camera Watch (`packages/camera-watch`) watches the IP cameras on your home or office network. It uses two open-source pieces: the [`onvif`](https://github.com/agsh/onvif) package (MIT) for everything ONVIF, and `ffmpeg` for video. Nothing goes through a vendor cloud.

## What you need

- `ffmpeg` on the machine (`sudo apt install ffmpeg` on Ubuntu). **Settings** shows whether Camera Watch can find it, and you can enter a full path.
- Cameras on the same network. ONVIF cameras can be found automatically. Many brands ship with ONVIF turned off, so turn it on in the camera's own settings first.

## Adding cameras

- **Find cameras** sends a WS-Discovery probe (UDP multicast `239.255.255.250:3702`) and lists the ONVIF cameras that answer, with their names and models. Pick one, enter its user name and password, and Camera Watch asks the camera for its stream address, snapshot address, profiles and PTZ support.
- **Add camera → Stream address** takes any address ffmpeg can open: `rtsp://`, `rtsps://` or an MJPEG `http://` stream. Use this for cameras without ONVIF.
- **Test connection** grabs one frame and shows it, so a wrong address or password shows up before you save. For ONVIF cameras you can pick the stream profile here (for example the camera's lower-resolution sub stream, which uses less CPU).

Camera passwords are saved in `~/.config/robos/camera-watch/cameras.json` (readable only by you) and are never sent to the window or included in Config Sync backups.

## Live view

The **Live** tab shows every camera that is on, in a 1, 2×2, 3×3 or 4×4 grid. Each tile shows the camera's state, frames per second, a motion meter and REC when it is recording. Click a tile to open it large with its controls; double-click for full screen.

One ffmpeg process per camera reads the stream and writes JPEG frames for the live view and tiny grey frames for motion detection. A camera that drops off the network is retried with a growing delay, and the live view picks up again when it comes back.

## Motion detection

Motion is detected on your computer by comparing each small grey frame with a slowly-updated background picture:

- **Sensitivity** sets how much a pixel must change to count.
- **Area that must change** sets how much of the picture (or of the zones) must change, and it must happen in two frames in a row.
- **Draw zones** limits detection to rectangles you drag on the picture, for example the path to the door but not the street.
- A change over most of the picture at once (lights switching on, the camera flipping to night mode) resets the background instead of counting as motion.
- ONVIF cameras can also send their own motion alarms (**Also use the camera's own motion alarms**).

Each motion event is listed under **Motion events** with a picture from the moment it started, how long it lasted and the clip, and a desktop notification appears when the window is not in front.

## Recording

With **Record when motion starts** on, a clip starts when motion starts and stops a set number of seconds after it ends. **Record** in the camera view records by hand, and **Snapshot** saves a still. RTSP cameras are recorded by copying the camera's own H.264 or H.265 stream into an MP4, so recording uses little CPU; MJPEG cameras are encoded to H.264.

Recordings go to `~/Videos/Camera Watch/<camera>/<date>/` by default. The **Recordings** tab plays clips and shows stills, and Camera Watch deletes its own clips and stills older than the number of days set in **Settings** (14 by default, 0 keeps everything). Other files in that folder are left alone.

## Pan, tilt and zoom

For ONVIF cameras with PTZ, hold an arrow or zoom button to move and release to stop. Moves time out on the camera after two seconds in case the stop request is lost. Presets saved on the camera appear in **Go to preset**.

## Limits

- Browsers inside Electron play H.264 clips; H.265 clips may need an external player (**Show in folder**).
- There is no pre-motion buffer yet: a clip starts at the moment motion is detected.
- Two-way audio, camera settings and NVR playback (ONVIF Profile G) are not supported.
