#!/usr/bin/env bash
# One-command order-pipeline test.
# Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... bash supabase/test-notify.sh [edge|direct]
#   edge   -> POST to the create-order Edge Function (validates + rate-limits)
#   direct -> POST straight to PostgREST (tests RLS INSERT policy)
set -u
MODE="${1:-edge}"
: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"
TOKEN="$(python3 -c 'import uuid; print(uuid.uuid4())')"

if [ "$MODE" = edge ]; then
  URL="$SUPABASE_URL/functions/v1/create-order"
else
  URL="$SUPABASE_URL/rest/v1/orders"
fi

echo "POST $URL"
curl -s -m 30 -X POST "$URL" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  $([ "$MODE" = direct ] && echo -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "Prefer: return=representation") \
  -d "{\"name\":\"تست\",\"phone\":\"09123456789\",\"service\":\"pc\",\"sub_service\":\"نصب ویندوز\",\"description\":\"سفارش تستی خط لوله\",\"track_token\":\"$TOKEN\",\"website\":\"\"}"
echo
echo "track_token=$TOKEN"
