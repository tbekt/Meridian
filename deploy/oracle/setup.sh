#!/usr/bin/env bash
# Installs the Meridian live-data server on a fresh Ubuntu server (made for an
# Oracle Cloud "Always Free" ARM VM, works on any Ubuntu 22.04/24.04 machine).
#
#   curl -fsSLO https://raw.githubusercontent.com/tbekt/Meridian/main/deploy/oracle/setup.sh
#   bash setup.sh
#
# What it does:
#   1. installs Docker and git
#   2. opens ports 80 and 443 in the server's own firewall (Oracle's Ubuntu
#      images block everything except SSH)
#   3. downloads the code to /opt/meridian, builds it and starts it; it restarts
#      by itself after a crash or reboot
#   4. starts Caddy in front of it, with a free HTTPS certificate for
#      <your-ip>.sslip.io (no domain name needed)
# At the end it prints the address to put in vercel.json.
#
# Run it again at any time to update to the latest code from GitHub.
set -euo pipefail

REPO=https://github.com/tbekt/Meridian.git
DIR=/opt/meridian

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

say "Installing Docker and git"
export DEBIAN_FRONTEND=noninteractive
# keep the current firewall rules when iptables-persistent asks (no prompt)
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
sudo -E apt-get update -y
sudo -E apt-get install -y docker.io git curl iptables-persistent
sudo systemctl enable --now docker

say "Opening ports 80 and 443"
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    # before Oracle's catch-all REJECT rule, if there is one
    reject=$(sudo iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
    if [ -n "$reject" ]; then
      sudo iptables -I INPUT "$reject" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    else
      sudo iptables -A INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  fi
done
sudo netfilter-persistent save

say "Downloading the latest code"
if [ -d "$DIR/.git" ]; then
  sudo git -C "$DIR" pull --ff-only
else
  sudo git clone --depth 1 "$REPO" "$DIR"
fi

say "Building (the first time takes a few minutes)"
sudo docker build -t meridian "$DIR"

say "Starting the server"
sudo docker rm -f meridian >/dev/null 2>&1 || true
# tokens and other private settings: $DIR/.env.local (never in the image)
env_args=()
if [ -f "$DIR/.env.local" ]; then env_args=(--env-file "$DIR/.env.local"); fi
# the cache volume keeps GeoNames, the translation models and collected posts
# across updates and reboots
sudo docker run -d --name meridian --restart unless-stopped \
  -p 127.0.0.1:7860:7860 \
  -v meridian-cache:/app/.cache \
  "${env_args[@]}" \
  meridian

say "Setting up HTTPS"
IP=$(curl -fsS https://api.ipify.org)
HOST="$(echo "$IP" | tr . -).sslip.io"
sudo mkdir -p /etc/meridian
printf '%s {\n\treverse_proxy 127.0.0.1:7860\n}\n' "$HOST" | sudo tee /etc/meridian/Caddyfile >/dev/null
sudo docker rm -f caddy >/dev/null 2>&1 || true
sudo docker run -d --name caddy --restart unless-stopped --network host \
  -v /etc/meridian/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy-data:/data \
  caddy:2

say "Waiting for the server to answer"
for _ in $(seq 1 60); do
  if curl -fsS -m 5 http://127.0.0.1:7860/api/status >/dev/null 2>&1; then break; fi
  sleep 5
done

cat <<EOF

────────────────────────────────────────────────────────────────────
 Meridian is running.

 Check it in your browser (give the HTTPS certificate a minute):
   https://$HOST/api/status

 Put this address in vercel.json (the "destination" line):
   https://$HOST/api/:path*

 The first start downloads place names and translation models; live
 events appear within a few minutes.

 Logs:    sudo docker logs -f meridian
 Update:  run this script again
────────────────────────────────────────────────────────────────────
EOF
