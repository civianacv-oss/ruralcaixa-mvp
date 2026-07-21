"""
RuralCaixa — Identificar telegram_chat_id a partir das ultimas mensagens do bot

Uso:
  1. Pegue o TELEGRAM_BOT_TOKEN no Railway (Variables do servico backend)
  2. $env:TELEGRAM_BOT_TOKEN = "..."
  3. python identificar_telegram_chat_id_v1.py

So LEITURA -- so consulta o Telegram, nao mexe no banco.
"""
import os
import urllib.request
import json

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TOKEN:
    print("ERRO: defina $env:TELEGRAM_BOT_TOKEN antes de rodar este script.")
    raise SystemExit(1)

url = f"https://api.telegram.org/bot{TOKEN}/getUpdates"

with urllib.request.urlopen(url) as resp:
    data = json.loads(resp.read().decode("utf-8"))

if not data.get("ok"):
    print("Erro na API do Telegram:", data)
    raise SystemExit(1)

results = data.get("result", [])
if not results:
    print("Nenhuma mensagem recente encontrada. Peca pro Ubiratan mandar uma mensagem")
    print("pro bot (@ruralcaixa_alertas_bot) e rode este script de novo.")
    raise SystemExit(0)

print(f"{'chat_id':<15} {'nome':<30} {'username':<20} {'mensagem'}")
print("-" * 90)
vistos = set()
for upd in results:
    msg = upd.get("message") or upd.get("edited_message")
    if not msg:
        continue
    chat = msg.get("chat", {})
    chat_id = chat.get("id")
    if chat_id in vistos:
        continue
    vistos.add(chat_id)
    nome = f"{chat.get('first_name','')} {chat.get('last_name','')}".strip()
    username = chat.get("username", "")
    texto = msg.get("text", "")
    print(f"{chat_id:<15} {nome:<30} {username:<20} {texto[:40]}")

print()
print("Identifique a linha do Ubiratan e me passe o chat_id pra eu gerar o UPDATE.")
