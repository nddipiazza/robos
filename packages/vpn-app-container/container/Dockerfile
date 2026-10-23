FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    openvpn iptables iproute2 curl ca-certificates python3 qbittorrent-nox transmission-daemon \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10000 vpnapp && useradd -u 10000 -g 10000 -d /data vpnapp
COPY supervisor.py /opt/robos/supervisor.py
COPY run-app.py /opt/robos/run-app.py
ENTRYPOINT ["python3", "-u", "/opt/robos/supervisor.py"]
