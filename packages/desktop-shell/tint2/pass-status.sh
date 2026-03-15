#!/usr/bin/env bash
# pass-status.sh — outputs pass lock status for Conky widget

CACHE_DIR="$HOME/.cache/robos"
UNLOCK_FILE="$CACHE_DIR/pass-unlock-time"
ACCESS_LOG="$CACHE_DIR/pass-access.log"
PASS_STORE="$HOME/.password-store"

# Not initialized?
if [ ! -f "$PASS_STORE/.gpg-id" ]; then
  echo ">> Pass: not initialized"
  exit 0
fi

# Check if gpg-agent has cached passphrase
CACHED=$(gpg-connect-agent 'keyinfo --list' /bye 2>/dev/null | \
  awk 'NF>=7 && $7=="1"{found=1} END{print (found ? "yes" : "no")}')

# Today's access count
TODAY=$(date +%Y-%m-%d)
if [ -f "$ACCESS_LOG" ]; then
  COUNT=$(grep "^${TODAY}" "$ACCESS_LOG" | wc -l)
  AGENTS=$(grep "^${TODAY}" "$ACCESS_LOG" | awk -F'|' '$2=="agent"' | wc -l)
else
  COUNT=0; AGENTS=0
fi

if [ "$CACHED" = "yes" ] && [ -f "$UNLOCK_FILE" ]; then
  UNLOCK_TS=$(cat "$UNLOCK_FILE")
  NOW=$(date +%s)
  # default-cache-ttl is 86400 (all day)
  REMAINING=$(( UNLOCK_TS + 86400 - NOW ))
  if [ $REMAINING -gt 0 ]; then
    HRS=$(( REMAINING / 3600 ))
    MINS=$(( (REMAINING % 3600) / 60 ))
    if [ $HRS -gt 0 ]; then
      echo ">> Pass: unlocked ~${HRS}h ${MINS}m left"
      echo "   Agents need user in ~${HRS}h ${MINS}m"
    else
      echo ">> Pass: unlocked ~${MINS}m left"
      echo "   Agents need user in ~${MINS}m"
    fi
  else
    echo ">> Pass: unlocked"
    echo "   Agents need user soon"
  fi
elif [ "$CACHED" = "yes" ]; then
  echo ">> Pass: unlocked"
  echo "   Agents need user when cache expires"
else
  echo ">> Pass: LOCKED"
  echo "   Agents need user interaction now"
fi

# Access stats
if [ "$COUNT" -gt 0 ]; then
  USER=$(( COUNT - AGENTS ))
  echo "   ${COUNT} access today (${AGENTS} agents, ${USER} you)"
fi
