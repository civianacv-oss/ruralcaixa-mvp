import requests
import json

BASE = "https://ruralcaixa-mvp-production.up.railway.app/contratos-assistente"

casos = [
    {
        "nome": "Parceria agrícola",
        "respostas": {
            "vinculo": "autonomo",
            "relacao": "cede_uso",
            "remuneracao": "divisao_resultado",
            "atividade": "agricola",
            "risco": "dividido",
            "infraestrutura": "ambos",
        },
    },
    {
        "nome": "Arrendamento",
        "respostas": {
            "vinculo": "autonomo",
            "relacao": "cede_uso",
            "remuneracao": "valor_fixo",
            "prazo": "medio",
        },
    },
    {
        "nome": "Vínculo empregatício (deve barrar)",
        "respostas": {
            "vinculo": "subordinado_remuneracao_fixa",
            "relacao": "cede_uso",
            "remuneracao": "valor_fixo",
        },
    },
]

for caso in casos:
    r = requests.post(f"{BASE}/recomendar", json={"respostas": caso["respostas"]})
    print(f"--- {caso['nome']} ---")
    print("status:", r.status_code)
    if r.ok:
        data = r.json()
        if data.get("alerta_vinculo"):
            print("ALERTA VÍNCULO:", data["alerta_vinculo"][:100], "...")
        else:
            print("Recomendado:", data["recomendado"]["nome"], "| score:", data["recomendado"]["score"])
            print("Alternativas:", [a["nome"] for a in data["alternativas"]])
            print("Justificativa:", data["justificativa"])
    else:
        print(r.text)
    print()
