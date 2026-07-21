import requests

TOKEN = "rc_Zk_XTIuk8TNO9oBWwdp6ggmtlrr4967o1kiYgbgw6vA"
BASE = "https://ruralcaixa-mvp-production.up.railway.app"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

for meses in [3, 12, 36]:
    r = requests.get(f"{BASE}/bovino/leiteiro/iofc/1?meses={meses}", headers=HEADERS)
    dados = r.json()
    print(f"=== meses={meses} -> {len(dados)} linha(s) retornada(s) ===")
    for d in dados:
        print(" ", d)
    print()
