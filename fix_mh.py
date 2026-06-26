# force rebuild
content = open("app/services/mensagem_handler.py", encoding="utf-8", errors="replace").read()

old = """    if is_contrato_ativo(sessoes, key):
        if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
            ok, resp = await confirmar_contrato(sessoes, key, msg.numero)
            return resp
        elif texto_up in ("NAO", "N", "CANCELA"):
            sessoes.pop(key, None)
            return "Cancelado. Pode começar de novo quando quiser."
        else:
            return await processar_etapa_contrato(sessoes, key, texto)

        # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") not in ("cadastro", "contrato"):"""

new = """    if is_contrato_ativo(sessoes, key):
        if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
            ok, resp = await confirmar_contrato(sessoes, key, msg.numero)
            return resp
        elif texto_up in ("NAO", "N", "CANCELA"):
            sessoes.pop(key, None)
            return "Cancelado. Pode começar de novo quando quiser."
        else:
            return await processar_etapa_contrato(sessoes, key, texto)

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") not in ("cadastro", "contrato"):"""

if old in content:
    content = content.replace(old, new)
    open("app/services/mensagem_handler.py", "w", encoding="utf-8").write(content)
    print("OK")
else:
    print("ERRO — bloco nao encontrado")