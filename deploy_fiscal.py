"""
Dispara o deploy no Railway do commit ATUAL (HEAD), sempre.
"""
import os
import sys
import subprocess
import requests

RAILWAY_TOKEN = os.environ.get("RAILWAY_TOKEN")
if not RAILWAY_TOKEN:
    print("ERRO: defina $env:RAILWAY_TOKEN antes de rodar este script.")
    sys.exit(1)

PROJECT_ID = "2c044ba2-866a-49de-8390-591278dcb47a"
SERVICE_ID = "1ec2bc7e-ae5a-4730-8c24-e728b3c51cf7"
ENVIRONMENT_ID = "f58c68ac-a7fa-4ce2-984f-6d51313e6f09"

COMMIT_SHA = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], text=True
).strip()

print(f"Deployando commit atual: {COMMIT_SHA}")

try:
    remote_sha = subprocess.check_output(
        ["git", "rev-parse", "origin/main"], text=True
    ).strip()
    if remote_sha != COMMIT_SHA:
        print(f"AVISO: HEAD local ({COMMIT_SHA[:8]}) e diferente de origin/main ({remote_sha[:8]}).")
        print("Rode 'git push origin main' antes de deployar.")
except Exception:
    pass

query = """
mutation($serviceId: String!, $environmentId: String!, $commitSha: String) {
  serviceInstanceDeploy(
    serviceId: $serviceId
    environmentId: $environmentId
    commitSha: $commitSha
  )
}
"""
resp = requests.post(
    "https://backboard.railway.app/graphql/v2",
    json={
        "query": query,
        "variables": {
            "serviceId": SERVICE_ID,
            "environmentId": ENVIRONMENT_ID,
            "commitSha": COMMIT_SHA,
        },
    },
    headers={"Authorization": f"Bearer {RAILWAY_TOKEN}"},
)
print("Status:", resp.status_code)
print(resp.text)
