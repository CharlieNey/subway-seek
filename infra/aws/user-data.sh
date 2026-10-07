#!/bin/bash
# EC2 user data for the game server (Amazon Linux 2023). Installs Docker and the compose
# plugin and prepares /opt/stand-clear; the first deploy (infra/aws/deploy.sh) copies the
# compose files in and starts the stack. Runs once, as root, at first boot.
set -euo pipefail
dnf update -y
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user

# Docker Compose v2 plugin (AL2023's repos don't carry it).
mkdir -p /usr/local/lib/docker/cli-plugins
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) COMPOSE_ARCH=x86_64 ;;
  aarch64) COMPOSE_ARCH=aarch64 ;;
  *) echo "unexpected arch $ARCH" >&2; exit 1 ;;
esac
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${COMPOSE_ARCH}" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/stand-clear
chown ec2-user:ec2-user /opt/stand-clear
echo "stand-clear: docker ready" > /var/log/stand-clear-setup.log
