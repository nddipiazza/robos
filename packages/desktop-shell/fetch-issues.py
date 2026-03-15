#!/usr/bin/env python3
# Default: fetch open issues assigned to @me via gh CLI.
import subprocess, json, sys
result = subprocess.run(
    ["gh", "issue", "list", "--assignee", "@me", "--state", "open",
     "--json", "number,title,url,state", "--limit", "50"],
    capture_output=True, text=True, timeout=20
)
if result.returncode != 0:
    sys.exit(0)
for item in json.loads(result.stdout):
    num = item["number"]
    print(json.dumps({"id": "#" + str(num), "title": item["title"],
                      "url": item.get("url", ""), "state": item.get("state", "OPEN")}))
