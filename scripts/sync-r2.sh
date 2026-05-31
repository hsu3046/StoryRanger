#!/usr/bin/env bash
#
# Mirror local static media (public/) → a Cloudflare R2 bucket.
#
# public/ stays the source of truth; this uploads a copy that the app serves
# from when NEXT_PUBLIC_ASSET_BASE_URL points at the bucket. Run it after
# adding/changing images or audio. No project dependency — uses the AWS CLI
# against R2's S3-compatible endpoint.
#
# Prereqs:
#   - awscli v2 installed (`brew install awscli`)
#   - .env.local has: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
#
# Usage:  ./scripts/sync-r2.sh           (sync changed files)
#         ./scripts/sync-r2.sh --dry-run (preview without uploading)
set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env.local (R2_* creds). Read the file directly (no process
# substitution — that interacts badly with `set -euo pipefail`) and export
# only the keys we need. `|| [[ -n "$key" ]]` processes a final line that has
# no trailing newline.
if [[ -f .env.local ]]; then
  while IFS='=' read -r key val || [[ -n "$key" ]]; do
    case "$key" in
      R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_BUCKET)
        val="${val%\"}"; val="${val#\"}" # strip optional surrounding quotes
        export "$key=$val" ;;
    esac
  done < .env.local
fi

: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID in .env.local}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID in .env.local}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY in .env.local}"
: "${R2_BUCKET:?set R2_BUCKET in .env.local}"

# R2 rejects the default integrity checksums newer aws-cli v2 sends; restrict
# them to when required so `s3 sync` works against R2.
export AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED
export AWS_RESPONSE_CHECKSUM_VALIDATION=WHEN_REQUIRED
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "Syncing ./public → s3://${R2_BUCKET} (R2)…"
aws s3 sync ./public "s3://${R2_BUCKET}" \
  --endpoint-url "$ENDPOINT" \
  --no-progress \
  --exclude "audio/sfx/misc/*" \
  --exclude "*.DS_Store" \
  "$@"

echo "Done. Asset base for the app: NEXT_PUBLIC_ASSET_BASE_URL=<your bucket's public URL>"
