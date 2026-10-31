#!/usr/bin/env bash
# Fails if anything tracked looks like a secret, or contains the value of a key in this shell's env.
set -u
bad=0
if git grep -nIE --cached '(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[bap]-)' -- . ':!scripts/check-secrets.sh' ':!packages/ingest/src/secrets.ts'; then bad=1; fi
for v in MODEL_API_KEY DEEPGRAM_API_KEY GITHUB_TOKEN; do
  val="${!v:-}"
  if [ -n "$val" ] && git grep -qF --cached -e "$val"; then echo "value of $v is committed"; bad=1; fi
done
[ $bad = 0 ] && echo "no secrets found"
exit $bad
