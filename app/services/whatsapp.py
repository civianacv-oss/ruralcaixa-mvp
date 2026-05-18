# app/services/whatsapp.py
import httpx, os

TOKEN    = os.getenv("WHATSAPP_TOKEN")
PHONE_ID = os.getenv("WHATSAPP_PHONE_ID")
BASE     = f"https://graph.facebook.com/v19.0/{PHONE_ID}/messages"

async def enviar_texto(para: str, texto: str):
    async with httpx.AsyncClient() as client:
        await client.post(BASE,
            headers={"Authorization": f"Bearer {TOKEN}"},
            json={"messaging_product": "whatsapp", "to": para,
                  "type": "text", "text": {"body": texto}}
        )

async def baixar_midia(media_id: str) -> bytes:
    async with httpx.AsyncClient() as client:
        # 1. pegar URL da mídia
        r = await client.get(
            f"https://graph.facebook.com/v19.0/{media_id}",
            headers={"Authorization": f"Bearer {TOKEN}"}
        )
        url = r.json()["url"]
        # 2. baixar o arquivo
        r2 = await client.get(url, headers={"Authorization": f"Bearer {TOKEN}"})
        return r2.content