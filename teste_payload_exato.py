import requests
import json

BASE = "https://ruralcaixa-mvp-production.up.railway.app/contratos-assistente"

respostas = {
    "vinculo": "autonomo",
    "relacao": "cede_uso",
    "remuneracao": "divisao_resultado",
    "atividade": "pecuaria",
    "prazo": "curto",
    "risco": "dividido",
    "infraestrutura": "ambos",
}

print("Payload enviado:")
print(json.dumps(respostas, indent=2, ensure_ascii=False))
print()

r = requests.post(f"{BASE}/recomendar", json={"respostas": respostas})
print("Status:", r.status_code)
print()
print("Resposta completa:")
print(json.dumps(r.json(), indent=2, ensure_ascii=False))
