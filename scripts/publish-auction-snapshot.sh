#!/usr/bin/env bash
set -euo pipefail

data_dir=$1
candidate=$2
collection_result=$3
cd "$data_dir"

failures=0
if test -f consecutive-failures.txt; then
  failures=$(cat consecutive-failures.txt)
fi
if ! [[ "$failures" =~ ^(0|[1-9][0-9]{0,8})$ ]]; then
  echo '::error::Invalid consecutive-failures.txt on auction-data.'
  exit 1
fi

if test "$collection_result" = success; then
  cp "$candidate" auction-prices.json
  failures=0
  message='chore: refresh auction snapshot and reset failures'
else
  failures=$((failures + 1))
  message="chore: record auction collection failure $failures"
fi
echo "$failures" > consecutive-failures.txt
echo "failure_count=$failures" >> "$GITHUB_OUTPUT"
git add consecutive-failures.txt
if test "$collection_result" = success; then git add auction-prices.json; fi
# The reservation already republishes the branch; never alter an old snapshot's timestamps.
if ! git diff --cached --quiet; then
  git commit -m "$message"
fi
git push origin HEAD:auction-data

if test "$collection_result" != success; then
  if ! test -s auction-prices.json; then
    echo '::error::Collection failed and no previous snapshot exists to retain.'
    exit 1
  fi
  if (( failures >= 3 )); then
    echo "::error::Auction collection has failed $failures consecutive times. Previous snapshot retained."
    exit 1
  fi
  echo "::notice::Collection failure $failures of 3. Previous snapshot retained."
fi
