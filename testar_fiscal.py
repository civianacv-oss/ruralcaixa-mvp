import requests

token = "rc_Zk_XTIuk8TNO9oBWwdp6ggmtlrr4967o1kiYgbgw6vA"
url = "https://ruralcaixa-mvp-production.up.railway.app/fiscal/resumo/1"

resp = requests.get(url, headers={"Authorization": f"Bearer {token}"})
print("Status:", resp.status_code)
print(resp.text)