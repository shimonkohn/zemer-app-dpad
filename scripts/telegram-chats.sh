#!/usr/bin/env bash
# List Telegram chats that have recently messaged the Zemer build bot, so you can add someone to
# the recipient list (the TELEGRAM_CHAT_IDS repo variable:
# Settings > Secrets and variables > Actions > Variables).
#
# Notes:
#   - A new USER must first open the bot and press Start (or send any message) — Telegram bots can
#     only DM users who have started them. Then run this to grab their numeric chat_id.
#   - For a GROUP/CHANNEL: add the bot to it, then use -100 + the number from the t.me/c/<id>/...
#     link (e.g. t.me/c/4251718348/2  ->  -1004251718348). No need for this script.
#
# Usage:
#   TELEGRAM_BOT_TOKEN=123456:ABC... ./scripts/telegram-chats.sh
set -euo pipefail
: "${TELEGRAM_BOT_TOKEN:?set TELEGRAM_BOT_TOKEN to the bot token}"

curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 - <<'PY'
import json, sys
data = json.load(sys.stdin)
chats = {}
for upd in data.get("result", []):
    msg = upd.get("message") or upd.get("edited_message") or upd.get("channel_post") or {}
    chat = msg.get("chat") or {}
    cid = chat.get("id")
    if cid is None:
        continue
    label = (chat.get("username")
             or " ".join(filter(None, [chat.get("first_name"), chat.get("last_name")]))
             or chat.get("title")
             or chat.get("type", ""))
    chats[cid] = label
if not chats:
    print("No recent chats. Have the user open the bot and press Start, then re-run.")
else:
    print("chat_id\tname   (add the chat_id to the TELEGRAM_CHAT_IDS repo variable)")
    for cid, label in chats.items():
        print(f"{cid}\t{label}")
PY
