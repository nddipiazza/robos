#!/bin/bash
# make-hero-gif.sh <actor.webm> <out.gif> "<start-end> <start-end> ..."   (seconds into the recording)
# Builds the landing-page hero GIF from a real E2E phone recording.
set -e
IN=$1; OUT=$2; SEGS=$3; SPEED=${SPEED:-2}; W=${W:-390}; FPS=${FPS:-12}
VW=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$IN")
CROP=""; [ "$VW" -gt 390 ] && CROP="crop=390:844:0:0,"
F=""; L=""; i=0
for s in $SEGS; do a=${s%-*}; b=${s#*-}
  F="$F[0:v]${CROP}trim=start=$a:end=$b,setpts=PTS-STARTPTS[s$i];"; L="$L[s$i]"; i=$((i+1)); done
F="${F}${L}concat=n=$i:v=1:a=0,setpts=PTS/$SPEED,fps=$FPS,scale=$W:-2:flags=lanczos,split[x][y];[x]palettegen=max_colors=${COLORS:-128}:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=${BAYER:-4}:diff_mode=rectangle"
ffmpeg -hide_banner -loglevel error -y -i "$IN" -filter_complex "$F" -loop 0 "$OUT"
ls -la "$OUT"
