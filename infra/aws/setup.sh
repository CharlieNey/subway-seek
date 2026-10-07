#!/bin/bash
# One-time AWS setup for the game server, with the AWS CLI (`brew install awscli`, then
# `aws configure` or SSO). Creates: an ECR repository for the image, an IAM role the
# instance uses to pull from ECR and to be reached over SSM (no SSH key, no port 22), a
# security group open on 80 and 443, one EC2 instance in us-east-1 (New York's region)
# from the Amazon Linux 2023 image with infra/aws/user-data.sh, and an Elastic IP.
#
# Prints the IP to point the server's DNS A record at, and the instance id for deploy.sh.
# Idempotent enough to re-run: it reuses what already exists by name.
#
#   AWS_REGION=us-east-1 infra/aws/setup.sh
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
NAME="${NAME:-stand-clear-server}"
# t3.small: 2 vCPU, 2 GB, about $15/month on demand; the server idles at a few percent.
# t4g.small (ARM) is cheaper, but then build the image with --platform linux/arm64.
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
VOLUME_GB="${VOLUME_GB:-16}"
HERE="$(cd "$(dirname "$0")" && pwd)"

say() { echo "▸ $*" >&2; }

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
say "account $ACCOUNT, region $REGION"

# --- ECR ---------------------------------------------------------------------------
if ! aws ecr describe-repositories --region "$REGION" --repository-names "$NAME" >/dev/null 2>&1; then
  aws ecr create-repository --region "$REGION" --repository-name "$NAME" \
    --image-scanning-configuration scanOnPush=true >/dev/null
  say "created ECR repository $NAME"
fi
ECR="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$NAME"

# --- IAM role for the instance: pull from ECR, reachable over SSM --------------------
ROLE="$NAME-instance"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{ "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" }]
  }' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
  aws iam create-instance-profile --instance-profile-name "$ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  say "created IAM role $ROLE (SSM + ECR pull); waiting for it to propagate"
  sleep 12
fi

# --- Security group: HTTP and HTTPS from anywhere, nothing else ----------------------
VPC=$(aws ec2 describe-vpcs --region "$REGION" --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 describe-security-groups --region "$REGION" --filters Name=group-name,Values="$NAME" Name=vpc-id,Values="$VPC" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
if [ -z "$SG" ] || [ "$SG" = "None" ]; then
  SG=$(aws ec2 create-security-group --region "$REGION" --group-name "$NAME" \
    --description "Stand Clear game server: HTTP/HTTPS" --vpc-id "$VPC" --query GroupId --output text)
  for port in 80 443; do
    aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG" \
      --ip-permissions "IpProtocol=tcp,FromPort=$port,ToPort=$port,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]" >/dev/null
  done
  say "created security group $SG"
fi

# --- The instance ---------------------------------------------------------------------
INSTANCE=$(aws ec2 describe-instances --region "$REGION" \
  --filters Name=tag:Name,Values="$NAME" Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || true)
if [ -z "$INSTANCE" ] || [ "$INSTANCE" = "None" ]; then
  case "$INSTANCE_TYPE" in
    t4g*|m6g*|c6g*|m7g*|c7g*) AMI_PARAM=/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 ;;
    *) AMI_PARAM=/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 ;;
  esac
  AMI=$(aws ssm get-parameter --region "$REGION" --name "$AMI_PARAM" --query Parameter.Value --output text)
  INSTANCE=$(aws ec2 run-instances --region "$REGION" \
    --image-id "$AMI" --instance-type "$INSTANCE_TYPE" \
    --iam-instance-profile Name="$ROLE" --security-group-ids "$SG" \
    --user-data "file://$HERE/user-data.sh" \
    --block-device-mappings "DeviceName=/dev/xvda,Ebs={VolumeSize=$VOLUME_GB,VolumeType=gp3,DeleteOnTermination=false}" \
    --metadata-options HttpTokens=required \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" "ResourceType=volume,Tags=[{Key=Name,Value=$NAME}]" \
    --query 'Instances[0].InstanceId' --output text)
  say "launched $INSTANCE_TYPE $INSTANCE; waiting for it"
  aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE"
fi

# --- A fixed address for the DNS record ------------------------------------------------
ALLOC=$(aws ec2 describe-addresses --region "$REGION" --filters Name=tag:Name,Values="$NAME" \
  --query 'Addresses[0].AllocationId' --output text 2>/dev/null || true)
if [ -z "$ALLOC" ] || [ "$ALLOC" = "None" ]; then
  ALLOC=$(aws ec2 allocate-address --region "$REGION" --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" --query AllocationId --output text)
  say "allocated Elastic IP"
fi
aws ec2 associate-address --region "$REGION" --instance-id "$INSTANCE" --allocation-id "$ALLOC" --allow-reassociation >/dev/null
IP=$(aws ec2 describe-addresses --region "$REGION" --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)

cat <<EOF

Done.
  ECR image:      $ECR
  Instance:       $INSTANCE ($INSTANCE_TYPE, $REGION)
  Elastic IP:     $IP   ← point the server's A record here (e.g. play-api.<domain>)

Next: wait a minute for user-data to install Docker, then
  INSTANCE_ID=$INSTANCE ECR=$ECR AWS_REGION=$REGION infra/aws/deploy.sh --first
(the first deploy copies the compose files and asks for the .env values).
EOF
