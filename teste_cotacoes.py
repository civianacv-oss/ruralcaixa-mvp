import requests

TOKEN = "rc_Zk_XTIuk8TNO9oBWwdp6ggmtlrr4967o1kiYgbgw6vA"
BASE = "https://ruralcaixa-mvp-production.up.railway.app"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

print("=== 1. Listando fornecedores existentes ===")
r = requests.get(f"{BASE}/fornecedores/?fazenda_id=1", headers=HEADERS)
print(r.status_code, r.text[:500])
fornecedores = r.json()
if isinstance(fornecedores, dict):
    fornecedores = fornecedores.get("data", [])

if not fornecedores:
    print("\nNenhum fornecedor cadastrado — não dá pra testar. Cadastre um fornecedor primeiro.")
    exit()

fornecedor_ids = [f["id"] for f in fornecedores[:2]]
print(f"\nUsando fornecedor(es): {fornecedor_ids}")

print("\n=== 2. Criando cotação de teste ===")
r = requests.post(f"{BASE}/cotacoes/?fazenda_id=1", headers=HEADERS, json={
    "descricao_produto": "TESTE — Farelo de soja (simulação)",
    "quantidade": 100,
    "unidade": "kg",
    "observacoes": "Cotação de teste gerada por script — pode cancelar depois",
    "fornecedor_ids": fornecedor_ids,
})
print(r.status_code, r.text)
if r.status_code != 200:
    exit()
resultado = r.json()
cotacao_id = resultado["cotacao"]["id"]
print(f"\nCotação criada: id={cotacao_id}")

print("\n=== 3. Listando cotações ===")
r = requests.get(f"{BASE}/cotacoes/?fazenda_id=1", headers=HEADERS)
print(r.status_code, r.text[:800])

print(f"\n=== 4. Registrando resposta do fornecedor {fornecedor_ids[0]} ===")
r = requests.put(
    f"{BASE}/cotacoes/{cotacao_id}/fornecedores/{fornecedor_ids[0]}?fazenda_id=1",
    headers=HEADERS,
    json={"preco_unitario": 2.35, "prazo_entrega_dias": 5, "observacao_resposta": "Preço de teste"},
)
print(r.status_code, r.text)

print(f"\n=== 5. Detalhe da cotação {cotacao_id} ===")
r = requests.get(f"{BASE}/cotacoes/{cotacao_id}?fazenda_id=1", headers=HEADERS)
print(r.status_code, r.text)

print(f"\n=== 6. Fechando cotação (escolhendo vencedor, sem gerar pedido de compra) ===")
r = requests.post(f"{BASE}/cotacoes/{cotacao_id}/fechar?fazenda_id=1", headers=HEADERS, json={
    "fornecedor_vencedor_id": fornecedor_ids[0],
    "criar_pedido_compra": False,
})
print(r.status_code, r.text)

print("\n=== Teste concluído ===")
