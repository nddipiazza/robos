# RobOS E2E Headless Test Environment (Option 1: Docker + Xvfb + Picom/Mutter)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV DISPLAY=:99

# Install base OS, X11, window manager/compositor, and Electron dependencies
RUN apt-get update -qq && apt-get install -y -qq \
    curl \
    wget \
    gnupg \
    ca-certificates \
    git \
    unzip \
    python3 \
    xvfb \
    dbus-x11 \
    picom \
    mutter \
    xdotool \
    wmctrl \
    x11-utils \
    x11-xserver-utils \
    xclip \
    xsel \
    pass \
    openssh-client \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2t64 \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS
RUN mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update -qq && \
    apt-get install -y -qq nodejs && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspace

# Copy and set permissions for entrypoint script
COPY infra/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
