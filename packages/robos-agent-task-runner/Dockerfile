FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap procps git openssh-client ca-certificates xvfb xauth gh python3 build-essential && apt-get clean
RUN useradd --uid 15000 --create-home --home-dir /home/agent agent
USER 15000:15000
ENV HOME=/home/agent DISPLAY=:99
WORKDIR /home/agent
