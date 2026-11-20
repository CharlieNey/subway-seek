#!/bin/bash
# Give this repository's main branch short-lived AWS credentials for server deploys.
# Note: the GitHub workflow now deploys to Fly.io (docs/DEPLOY-PLAN.md). To deploy to AWS from
# Actions, restore the AWS deploy job from .github/workflows/deploy-server.yml before 2026-11-20.
# Run after setup.sh. If EC2 provisioning is still blocked, this configures the role
# and the other three secrets; rerun with INSTANCE_ID once the instance exists.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
NAME="${NAME:-stand-clear-server}"
REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ROLE="$NAME-github"
PROVIDER="arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
ECR="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$NAME"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER" >/dev/null 2>&1; then
  aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com >/dev/null
fi

python3 - "$WORK" "$ACCOUNT" "$REGION" "$NAME" "$REPO" "$PROVIDER" <<'PY'
import json, pathlib, sys
work, account, region, name, repo, provider = sys.argv[1:]
path = pathlib.Path(work)
trust = {
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow", "Principal": {"Federated": provider},
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {"StringEquals": {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": f"repo:{repo}:ref:refs/heads/main",
        }},
    }],
}
policy = {
    "Version": "2012-10-17",
    "Statement": [
        {"Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*"},
        {"Effect": "Allow", "Action": [
            "ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
            "ecr:CompleteLayerUpload", "ecr:PutImage",
        ], "Resource": f"arn:aws:ecr:{region}:{account}:repository/{name}"},
        {"Effect": "Allow", "Action": "ssm:SendCommand",
         "Resource": f"arn:aws:ssm:{region}::document/AWS-RunShellScript"},
        {"Effect": "Allow", "Action": "ssm:SendCommand",
         "Resource": f"arn:aws:ec2:{region}:{account}:instance/*",
         "Condition": {"StringEquals": {"ssm:resourceTag/Name": name}}},
        {"Effect": "Allow", "Action": "ssm:GetCommandInvocation", "Resource": "*"},
    ],
}
(path / "trust.json").write_text(json.dumps(trust))
(path / "policy.json").write_text(json.dumps(policy))
PY

if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "file://$WORK/trust.json"
else
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document "file://$WORK/trust.json" >/dev/null
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name stand-clear-deploy \
  --policy-document "file://$WORK/policy.json"

gh secret set AWS_ROLE_ARN --repo "$REPO" --body "arn:aws:iam::$ACCOUNT:role/$ROLE"
gh secret set AWS_REGION --repo "$REPO" --body "$REGION"
gh secret set ECR_REPOSITORY --repo "$REPO" --body "$ECR"

if [ -z "${INSTANCE_ID:-}" ]; then
  INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=$NAME" Name=instance-state-name,Values=pending,running,stopping,stopped \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)
fi
if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ]; then
  gh secret set INSTANCE_ID --repo "$REPO" --body "$INSTANCE_ID"
  echo "Configured all four deploy secrets for $REPO ($INSTANCE_ID)."
else
  echo "Configured AWS_ROLE_ARN, AWS_REGION and ECR_REPOSITORY for $REPO."
  echo "No EC2 instance yet: rerun this script after setup.sh to set INSTANCE_ID."
fi
