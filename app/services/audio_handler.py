import httpx
from app.services.classifier import classificar
from app.services.groq_stt import transcrever_audio

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

        texto = await transcrever_audio(audio_bytes)
        print(f"Transcricao: {texto}")

        # Tenta regras primeiro, fallback para AI
        resultado = classificar(texto)
        if not resultado:
            from app.services.classificador import classificar as classificar_ai
            resultado = await classificar_ai(texto)
            if resultado:
                resultado = _normalizar_ai(resultado)

        if not resultado:
            await send_msg_func(numero, "Nao entendi o audio. Digite o lancamento.")
            return

        sessoes[numero] = resultado

        if resultado["valor"] is None:
            sessoes[numero]["_tipo"] = "aguardando_valor"
            await send_msg_func(
                numero,
                f"🎙️ Audio recebido!\n"
                f"📝 Transcricao: {texto}\n\n"
                f"Nao consegui identificar o valor. Qual foi o valor (em R$)?"
            )
            return

        tipo_label = "[RECEITA]" if resultado["tipo"] == "receita" else "[DESPESA]" if resultado["tipo"] == "despesa" else "[INVESTIMENTO]"
        produto_txt = resultado.get("produto") or "N/A"
        await send_msg_func(numero,
            f"🎙️ Audio recebido!\n"
            f"📝 Transcricao: {texto}\n\n"
            f"{tipo_label} {resultado['tipo'].upper()}\n"
            f"Valor: R$ {resultado['valor']:,.2f}\n"
            f"Conta: {resultado['conta']}\n"
            f"Produto: {produto_txt}\n\n"
            f"Responda SIM para confirmar ou NAO para cancelar."
        )
    except Exception as e:
        print(f"Erro audio: {e}")
        await send_msg_func(numero, "Nao consegui processar o audio. Tente digitar.")


def _normalizar_ai(r: dict) -> dict:
    MAPA_CATEGORIA = {
        "venda_produto": "1.1.1", "servico_prestado": "1.2",
        "custeio": "3.1.1", "combustivel": "3.1.2",
        "manutencao": "3.1.5", "salario": "3.1.4",
        "investimento": "5.1", "outros": "3.9",
    }
    import datetime
    return {
        "conta": MAPA_CATEGORIA.get(r.get("categoria", "outros"), "3.9"),
        "tipo": r.get("tipo", "despesa"),
        "valor": float(r.get("valor", 0)),
        "data": r.get("data") or datetime.date.today().isoformat(),
        "confianca": 70 if r.get("confianca") == "alta" else 50,
        "produto": r.get("descricao"),
    }