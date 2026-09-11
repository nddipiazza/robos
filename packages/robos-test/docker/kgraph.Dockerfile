FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends xvfb xauth dbus-x11 libgtk-3-0 libnss3 libgbm1 libasound2 libxss1 libatk-bridge2.0-0 ffmpeg xdotool
RUN mkdir -p /opt/robos-test && npm install --prefix /opt/robos-test --no-audit --no-fund electron@33.2.1 playwright-core@1.55.0
ENV NODE_PATH=/opt/robos-test/node_modules
ENV ELECTRON_BIN=/opt/robos-test/node_modules/electron/dist/electron
WORKDIR /workspace
