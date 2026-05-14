import httpx
from app.services.classifier import classificar
from app.services.stt import transcrever_audio

GRAPH = "https://graph.facebook.com/v23.0"

async def processar_audio(numero, msg, wapp_token, sessoes, send_msg_func):
    try:
        media_id = msg["audio"]["id"]
        mime = msg["audio"].get("mime_type", "audio/ogg")
        async with httpx.AsyncClient() as client:
            r1 = await client.get(f"{GRAPH}/{media_id}", headers={"Authorization": f"Bearer {wapp_token}"})
            url = r1.json()["url"]
            r2 = await client.get(url, headers={"Authorization": f"Bearer {wapp_token}"})
            audio_bytes = r2.content
        texto = await transcrever_audio(audio_bytes, mime)
        print(f"Transcricao: {texto}")
        resultado = classificar(texto)
        if not resultado:
            await send_msg_func(numero, "Nao entendi o audio. Digite o lancamento.")
            return
        sessoes[numero] = resultado
        tipo_label = "[RECEITA]" if resultado["tipo"] == "receita" else "[DESPESA]" if resultado["tipo"] == "despesa" else "[INVESTIMENTO]"
        await send_msg_func(numero, f"Audio recebido!\nTranscricao: {texto}\n\n{tipo_label} {resultado['tipo'].upper()}\nValor: R$ {resultado['valor']:,.2f}\nConta: {resultado['conta']}\n\nResponda SIM para confirmar ou NAO para cancelar.")
    except Exception as e:
        print(f"Erro audio: {e}")
        await send_msg_func(numero, "Nao consegui processar o audio. Tente digitar.")
