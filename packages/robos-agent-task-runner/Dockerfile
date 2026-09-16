FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap procps git openssh-client ca-certificates xvfb xauth gh python3 build-essential cmake curl unzip pkg-config \
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    fonts-liberation fonts-noto-color-emoji && apt-get clean
RUN useradd --uid 15000 --create-home --home-dir /home/agent agent
USER 15000:15000
ENV HOME=/home/agent DISPLAY=:99
WORKDIR /home/agent
