#!/usr/bin/env bash
# Verify OpenWeather credentials and (optionally) the deployed /api/weather endpoint.
#
# Usage:
#   export OPENWEATHER_API_KEY="..."
#   ./scripts/verify-weather.sh
#
# Optional — same-origin weather as the kid app (CloudFront URL):
#   export APP_URL="https://xxxx.cloudfront.net"
#   ./scripts/verify-weather.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

ZIP="${WEATHER_ZIP:-02474,US}"

if [[ -z "${OPENWEATHER_API_KEY:-}" ]]; then
  echo "Error: OPENWEATHER_API_KEY is not set." >&2
  echo "Export your key, then re-run." >&2
  exit 1
fi

echo "→ OpenWeather 2.5 current weather (zip=${ZIP})"
CODE="$(curl -sS -o /tmp/ow-weather.json -w "%{http_code}" \
  "https://api.openweathermap.org/data/2.5/weather?zip=${ZIP}&appid=${OPENWEATHER_API_KEY}&units=imperial")"
echo "   HTTP ${CODE}"
if [[ "${CODE}" != "200" ]]; then
  cat /tmp/ow-weather.json >&2 || true
  exit 1
fi
node -e "
const o = JSON.parse(require('fs').readFileSync('/tmp/ow-weather.json','utf8'));
const t = o.main && o.main.temp;
console.log('   main.temp:', t, typeof t === 'number' ? '(OK)' : '(missing — check API key)');
"

echo "→ OpenWeather 2.5 forecast (same zip)"
CODE2="$(curl -sS -o /tmp/ow-forecast.json -w "%{http_code}" \
  "https://api.openweathermap.org/data/2.5/forecast?zip=${ZIP}&appid=${OPENWEATHER_API_KEY}&units=imperial")"
echo "   HTTP ${CODE2}"
if [[ "${CODE2}" != "200" ]]; then
  cat /tmp/ow-forecast.json >&2 || true
  exit 1
fi
echo "   OK (forecast received)"

if [[ -n "${APP_URL:-}" ]]; then
  base="${APP_URL%/}"
  echo "→ Deployed app ${base}/api/weather"
  CODE3="$(curl -sS -o /tmp/app-weather.json -w "%{http_code}" "${base}/api/weather")"
  echo "   HTTP ${CODE3}"
  node -e "
const fs = require('fs');
const raw = fs.readFileSync('/tmp/app-weather.json','utf8');
console.log(raw);
let o;
try { o = JSON.parse(raw); } catch (e) { process.exit(0); }
if (o.currentTempF === null || o.currentTempF === undefined) {
  console.error('   Note: all-null weather — redeploy CDK with OPENWEATHER_API_KEY set, or check Lambda env in AWS console.');
} else {
  console.error('   Lambda /api/weather returned currentTempF — UI should be able to show weather.');
}
"
else
  echo "→ Skip deployed check (set APP_URL to your CloudFront URL to test /api/weather)."
fi

echo "Done."
