#!/bin/sh
# Run one ai-compare script with the live keys it needs and nothing that writes.
#
#   scripts/ai-compare/run.sh steve.ts cases.json out.json
#
# Needs `railway link` to the TLE-OS project in this folder. The database is
# the live one through its public proxy in a READ-ONLY session; REX writes,
# email, texts, DocuSeal, Outlook and Propoly are left out of the environment.
# The scripts never print a key.
set -e
here=$(cd "$(dirname "$0")" && pwd)
script="$1"; shift
dburl=$(railway run -s Postgres -- sh -c 'printf %s "$DATABASE_PUBLIC_URL"')
export RO_DB="${dburl}?options=-c%20default_transaction_read_only%3Don"
railway run -s TLE-OS -- sh -c 'exec env -i PATH="$PATH" HOME="$HOME" NODE_PATH="$NODE_PATH" \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  REX_API_BASE="$REX_API_BASE" REX_API_EMAIL="$REX_API_EMAIL" REX_API_PASSWORD="$REX_API_PASSWORD" REX_ACCOUNT_ID="$REX_ACCOUNT_ID" \
  R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" R2_ACCOUNT_ID="$R2_ACCOUNT_ID" R2_BUCKET="$R2_BUCKET" R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  DATABASE_URL="$RO_DB" ASSISTANT_DAILY_TOKEN_CAP=100000000 BOND_ASK_DAILY_TOKEN_CAP=100000000 \
  MODELS="$MODELS" EFFORT="$EFFORT" ONLY="$ONLY" \
  npx tsx "$@"' -- "$here/$script" "$@"
