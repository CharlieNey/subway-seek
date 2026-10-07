#!/bin/bash
# Deploy the game server to the EC2 instance: build the image from the repo root, push it
# to ECR, copy the compose files over SSM, pull and restart. No SSH; everything goes
# through the AWS CLI and the instance's SSM agent. The same steps run in
# .github/workflows/deploy-server.yml on every push to main.
#
#   INSTANCE_ID=i-… ECR=123.dkr.ecr.us-east-1.amazonaws.com/stand-clear-server AWS_REGION=us-east-1 infra/aws/deploy.sh
#   … --first    also installs /opt/stand-clear/.env from your answers (never stored here)
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
: "${INSTANCE_ID:?set INSTANCE_ID (infra/aws/setup.sh prints it)}"
: "${ECR:?set ECR to the repository URI (infra/aws/setup.sh prints it)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"
PLATFORM="${PLATFORM:-linux/amd64}"   # linux/arm64 for a t4g instance
say() { echo "▸ $*" >&2; }

# --- Build and push --------------------------------------------------------------------
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR%%/*}"
say "building $ECR:$TAG for $PLATFORM"
docker buildx build --platform "$PLATFORM" -f "$ROOT/apps/server/Dockerfile" \
  -t "$ECR:$TAG" -t "$ECR:latest" --push "$ROOT"

# --- Run commands on the instance over SSM ----------------------------------------------
run() {
  local id
  id=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript --comment "stand-clear deploy $TAG" \
    --parameters "commands=$(python3 -c 'import json,sys; print(json.dumps([sys.argv[1]]))' "$1")" \
    --query 'Command.CommandId' --output text)
  aws ssm wait command-executed --region "$REGION" --command-id "$id" --instance-id "$INSTANCE_ID" || true
  aws ssm get-command-invocation --region "$REGION" --command-id "$id" --instance-id "$INSTANCE_ID" \
    --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
}

# The compose files travel as base64 inside the command (SSM has no file copy).
COMPOSE_B64=$(base64 < "$ROOT/infra/aws/docker-compose.yml" | tr -d '\n')
CADDY_B64=$(base64 < "$ROOT/infra/aws/Caddyfile" | tr -d '\n')
INSTALL="set -e; mkdir -p /opt/stand-clear && cd /opt/stand-clear
echo $COMPOSE_B64 | base64 -d > docker-compose.yml
echo $CADDY_B64 | base64 -d > Caddyfile"

if [ "${1:-}" = "--first" ]; then
  read -r -p "Server host (DNS name pointing at the Elastic IP): " SERVER_HOST
  read -r -s -p "DAILY_SECRET (blank to generate): " DAILY_SECRET; echo
  [ -z "$DAILY_SECRET" ] && DAILY_SECRET=$(openssl rand -base64 32)
  read -r -s -p "GOOGLE_STREETVIEW_SERVER_KEY: " SV_KEY; echo
  read -r -s -p "GOOGLE_MAPS_BROWSER_KEY: " BROWSER_KEY; echo
  read -r -s -p "STREETVIEW_SIGNING_SECRET: " SIGN; echo
  ENV_B64=$(printf 'IMAGE=%s:latest\nSERVER_HOST=%s\nDAILY_SECRET=%s\nGOOGLE_STREETVIEW_SERVER_KEY=%s\nGOOGLE_MAPS_BROWSER_KEY=%s\nSTREETVIEW_SIGNING_SECRET=%s\n' \
    "$ECR" "$SERVER_HOST" "$DAILY_SECRET" "$SV_KEY" "$BROWSER_KEY" "$SIGN" | base64 | tr -d '\n')
  INSTALL="$INSTALL
echo $ENV_B64 | base64 -d > .env && chmod 600 .env"
fi

say "installing compose files on $INSTANCE_ID"
run "$INSTALL"

say "pulling $TAG and restarting"
run "set -e; cd /opt/stand-clear
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ECR%%/*}
sed -i 's#^IMAGE=.*#IMAGE=$ECR:$TAG#' .env
docker compose pull --quiet
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
sleep 5
docker compose ps
docker compose logs --tail 5 server"

say "deployed $TAG"
