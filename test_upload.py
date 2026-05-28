import requests
with open("comprovante_test.pdf", "rb") as f:
    resp = requests.post(
        "https://ruralcaixa-mvp-production.up.railway.app/lancamentos/11/documento",
        files={"file": ("comprovante_estacas.pdf", f, "application/pdf")}
    )
print(resp.status_code, resp.text)
