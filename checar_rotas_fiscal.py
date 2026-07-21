import requests

resp = requests.get("https://ruralcaixa-mvp-production.up.railway.app/openapi.json")
print("Status:", resp.status_code)

if resp.status_code == 200:
    paths = resp.json().get("paths", {})
    fiscal_paths = [p for p in paths if "fiscal" in p]
    print("Rotas /fiscal encontradas:", fiscal_paths if fiscal_paths else "NENHUMA — deploy ainda não subiu ou router falhou ao carregar")
