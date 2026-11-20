#!/usr/bin/env bash
# Uploads the pages in content/ to Document Authoring (da.live), then previews
# and publishes them. Only for sites whose content source is da.live.
#
#   DA_TOKEN=<your IMS token> tools/publish-content.sh            # all pages
#   DA_TOKEN=<your IMS token> tools/publish-content.sh alphabet   # one page
#
# Get a token by signing in at https://da.live, then running
# `copy(adobeIMS.getAccessToken().token)` in the browser console.
set -euo pipefail
ORG=minioak
SITE=polish-practice
REF=main
: "${DA_TOKEN:?Set DA_TOKEN to your da.live access token}"
cd "$(dirname "$0")/../content"

pages=("$@")
if [ ${#pages[@]} -eq 0 ]; then
  pages=(nav footer index alphabet digraphs soft-sounds sound-pairs)
fi

for page in "${pages[@]}"; do
  path="/${page}"
  [ "$page" = "index" ] && path="/"
  echo "→ ${page}"
  curl -fsS -X PUT -H "Authorization: Bearer ${DA_TOKEN}" \
    -F "data=@${page}.html;type=text/html" \
    "https://admin.da.live/source/${ORG}/${SITE}/${page}.html" > /dev/null
  for stage in preview live; do
    curl -fsS -X POST -H "Authorization: Bearer ${DA_TOKEN}" \
      "https://admin.hlx.page/${stage}/${ORG}/${SITE}/${REF}${path}" > /dev/null
  done
done
echo "Done: https://${REF}--${SITE}--${ORG}.aem.live/"
