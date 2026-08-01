# -*- coding: utf-8 -*-
"""
Integra o comando de produção agrícola ("colhi/produzi/ensilei X de
CULTURA") no app/services/mensagem_handler.py (Telegram).

Faz 3 coisas:
  1. Insere a checagem do comando logo após o comando de cadastro de
     colaborador (mesmo ponto de entrada, antes da sessão de lançamento).
  2. Insere 2 novos sub-fluxos de sessão (escolha de safra ambígua,
     pergunta de destino) logo após o sub-fluxo de escolha de insumo
     ambíguo já existente.
  3. Anexa as funções novas no final do arquivo.

Sempre roda em dry-run primeiro. Rodar localmente:
    python3 integrar_producao_agricola_mensagem_handler_v1.py            # dry-run
    python3 integrar_producao_agricola_mensagem_handler_v1.py --aplicar   # aplica
"""
import sys
import difflib

CAMINHO = "app/services/mensagem_handler.py"

# ── Âncora 1: comando de cadastro de colaborador já existente ──────────────
ANCORA_COMANDO = '''    if _eh_comando_cadastro_colaborador(texto):
        return await _processar_cadastro_colaborador(texto, msg.numero, msg.canal)'''

NOVO_COMANDO = '''    if _eh_comando_cadastro_colaborador(texto):
        return await _processar_cadastro_colaborador(texto, msg.numero, msg.canal)

    if _eh_comando_producao_agricola(texto):
        return await _processar_producao_agricola(texto, msg.numero, msg.canal, sessoes, key)'''

# ── Âncora 2: fim do sub-fluxo de escolha de insumo ambíguo já existente ──
ANCORA_SUBFLUXO = '''            novo_resultado = _montar_resultado_insumo(row, quantidade)
            auth_local = _autorizar_numero(msg.numero, msg.canal)
            return _avancar_consumo_insumo(sessoes, key, novo_resultado, auth_local.get("imovel_id"))'''

NOVO_SUBFLUXO = '''            novo_resultado = _montar_resultado_insumo(row, quantidade)
            auth_local = _autorizar_numero(msg.numero, msg.canal)
            return _avancar_consumo_insumo(sessoes, key, novo_resultado, auth_local.get("imovel_id"))

        # Sub-fluxo: escolha de safra ambígua na produção agrícola
        if sessoes[key].get("_tipo") == "aguardando_escolha_safra":
            if texto_up in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo especificando melhor a cultura."
            safras_cand = sessoes[key]["_safras_candidatas"]
            if not texto_up.isdigit() or not (1 <= int(texto_up) <= len(safras_cand)):
                linhas = ["Não entendi a escolha. Qual dessas safras?\\n"]
                for i, s in enumerate(safras_cand, start=1):
                    linhas.append(f"{i}. {s['cultura']} {s['ano_safra']} ({s['area_ha']:g} ha)")
                linhas.append("\\n0. Cancelar")
                return "\\n".join(linhas)
            safra_escolhida = safras_cand[int(texto_up) - 1]
            dados_prod = sessoes[key]["_producao_dados"]
            imovel_id_prod = sessoes[key]["_producao_imovel_id"]
            produtor_id_prod = sessoes[key]["_producao_produtor_id"]
            sessoes.pop(key, None)
            if not dados_prod.get("destino"):
                sessoes[key] = {
                    "_tipo": "aguardando_destino_producao",
                    "_producao_safra": safra_escolhida,
                    "_producao_dados": dados_prod,
                    "_producao_imovel_id": imovel_id_prod,
                    "_producao_produtor_id": produtor_id_prod,
                }
                return _texto_pergunta_destino_producao()
            return await _finalizar_producao_agricola(safra_escolhida, dados_prod, imovel_id_prod, produtor_id_prod)

        # Sub-fluxo: pergunta de destino da produção (venda/consumo/estoque)
        if sessoes[key].get("_tipo") == "aguardando_destino_producao":
            from app.services.producao_agricola_service import DESTINOS_VALIDOS
            escolha_destino = DESTINOS_VALIDOS.get(texto_up)
            if not escolha_destino:
                return _texto_pergunta_destino_producao(prefixo="Não entendi. ")
            dados_prod = sessoes[key]["_producao_dados"]
            dados_prod["destino"] = escolha_destino[0]
            safra_atual = sessoes[key]["_producao_safra"]
            imovel_id_prod = sessoes[key]["_producao_imovel_id"]
            produtor_id_prod = sessoes[key]["_producao_produtor_id"]
            sessoes.pop(key, None)
            return await _finalizar_producao_agricola(safra_atual, dados_prod, imovel_id_prod, produtor_id_prod)'''

# ── Funções novas, anexadas no final do arquivo ────────────────────────────
FUNCOES_NOVAS = '''

def _eh_comando_producao_agricola(texto: str) -> bool:
    from app.services.producao_agricola_service import detectar_producao_agricola
    return detectar_producao_agricola(texto) is not None


def _texto_pergunta_destino_producao(prefixo: str = "") -> str:
    from app.services.producao_agricola_service import DESTINOS_VALIDOS
    linhas = [f"{prefixo}Qual foi o destino dessa produção?\\n"]
    for k_opt, (_, label) in DESTINOS_VALIDOS.items():
        linhas.append(f"{k_opt}. {label}")
    return "\\n".join(linhas)


async def _processar_producao_agricola(texto: str, numero: str, canal: str, sessoes: dict, key: str) -> str:
    """
    Comando de bot: "colhi/produzi/ensilei X kg/toneladas/sacas de CULTURA
    [pra venda/silo/estoque]". Resolve a safra ativa dessa cultura, registra
    a colheita (producao_agricola) e, se o destino for estoque, dá entrada
    no insumo "Silagem de CULTURA" com custo calculado a partir do gasto
    real da safra (vw_dre_safra).
    """
    from app.services.producao_agricola_service import (
        detectar_producao_agricola, resolver_safras_ativas,
    )

    dados = detectar_producao_agricola(texto)
    if not dados:
        return "Não entendi o lançamento. Tente: 'colhi 5000 kg de milho pra silagem'"

    autorizacao = _autorizar_numero(numero, canal)
    if not autorizacao.get("autorizado"):
        return "Não consegui confirmar seu cadastro. Fale com o responsável pela propriedade."

    imovel_id = autorizacao.get("imovel_id")
    if not imovel_id:
        return "Não consegui identificar a propriedade pra vincular essa produção."

    produtor_id = autorizacao.get("produtor_id")
    if not produtor_id:
        # colaborador_operacional não tem produtor_id -- usa o dono do imóvel
        from app.db import engine
        from sqlalchemy import text as sqlt
        with engine.connect() as conn:
            row_dono = conn.execute(sqlt(
                "SELECT produtor_id FROM imoveis_rurais WHERE id = :iid"
            ), {"iid": imovel_id}).fetchone()
            produtor_id = row_dono[0] if row_dono else None
    if not produtor_id:
        return "Não consegui identificar o produtor responsável por essa propriedade."

    safras = resolver_safras_ativas(imovel_id, dados["cultura"])
    if not safras:
        return (
            f"Não encontrei nenhuma safra em andamento de \\"{dados['cultura']}\\" "
            f"cadastrada nessa propriedade. Cadastre a safra no app antes de registrar a colheita."
        )

    if len(safras) > 1:
        sessoes[key] = {
            "_tipo": "aguardando_escolha_safra",
            "_safras_candidatas": safras,
            "_producao_dados": dados,
            "_producao_imovel_id": imovel_id,
            "_producao_produtor_id": produtor_id,
        }
        linhas = [f"Encontrei mais de uma safra de \\"{dados['cultura']}\\" em andamento:\\n"]
        for i, s in enumerate(safras, start=1):
            linhas.append(f"{i}. {s['cultura']} {s['ano_safra']} ({s['area_ha']:g} ha)")
        linhas.append("\\n0. Cancelar")
        linhas.append("\\nDigite só o número.")
        return "\\n".join(linhas)

    safra = safras[0]
    if not dados.get("destino"):
        sessoes[key] = {
            "_tipo": "aguardando_destino_producao",
            "_producao_safra": safra,
            "_producao_dados": dados,
            "_producao_imovel_id": imovel_id,
            "_producao_produtor_id": produtor_id,
        }
        return _texto_pergunta_destino_producao()

    return await _finalizar_producao_agricola(safra, dados, imovel_id, produtor_id)


async def _finalizar_producao_agricola(safra: dict, dados: dict, imovel_id: int, produtor_id: int) -> str:
    from app.services.producao_agricola_service import (
        registrar_producao, dar_entrada_estoque_producao_propria,
    )
    from datetime import date

    registrar_producao(
        safra_id=safra["id"], quantidade_kg=dados["quantidade_kg"],
        destino=dados["destino"], data_colheita=date.today(),
        produtor_id=produtor_id,
    )

    texto_estoque = ""
    if dados["destino"] == "estoque":
        info_estoque = dar_entrada_estoque_producao_propria(
            imovel_id=imovel_id, cultura=dados["cultura"],
            quantidade_kg=dados["quantidade_kg"], safra_id=safra["id"],
        )
        if info_estoque.get("custo_unitario"):
            custo_txt = f"R$ {info_estoque['custo_unitario']:.2f}/kg"
        else:
            custo_txt = "custo ainda não calculado (safra sem despesas lançadas ainda)"
        texto_estoque = f"\\n📦 Entrada no estoque: {info_estoque['nome']} — {custo_txt}"

    return (
        f"✅ Produção registrada!\\n"
        f"Safra: {safra['cultura']} {safra['ano_safra']}\\n"
        f"Quantidade: {dados['quantidade_kg']:g} kg\\n"
        f"Destino: {dados['destino']}"
        f"{texto_estoque}"
    )
'''


def main():
    aplicar = "--aplicar" in sys.argv
    with open(CAMINHO, "r", encoding="utf-8") as f:
        original = f.read()

    corrigido = original
    for nome, antigo, novo in [
        ("comando de entrada", ANCORA_COMANDO, NOVO_COMANDO),
        ("sub-fluxos de sessão", ANCORA_SUBFLUXO, NOVO_SUBFLUXO),
    ]:
        qtd = corrigido.count(antigo)
        if qtd != 1:
            print(f"✗ '{nome}': esperava 1 ocorrência, achei {qtd}. Abortando sem gravar nada.")
            return
        corrigido = corrigido.replace(antigo, novo, 1)

    corrigido = corrigido.rstrip("\n") + "\n" + FUNCOES_NOVAS

    if aplicar:
        with open(CAMINHO, "w", encoding="utf-8") as f:
            f.write(corrigido)
        print("✓ Arquivo corrigido e gravado.")
    else:
        print(">>> DRY-RUN — diff do que seria alterado:\n")
        diff = difflib.unified_diff(
            original.splitlines(keepends=True),
            corrigido.splitlines(keepends=True),
            fromfile="antes", tofile="depois",
        )
        sys.stdout.writelines(diff)
        print("\n\nSe fizer sentido, rode de novo com --aplicar.")


if __name__ == "__main__":
    main()
