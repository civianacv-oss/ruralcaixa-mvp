# -*- coding: utf-8 -*-
"""
CORRIGE app/services/mensagem_handler.py: quando o OCR não consegue
decidir compra vs venda pelo CPF (_ambiguo_cpf), tenta primeiro cruzar os
itens da nota com o catálogo de insumos (inferir_operacao_por_itens). Se
bater, sugere a classificação direto com SIM/NAO curto, em vez de sempre
pedir o wizard completo de histórico -> tipo -> conta.

Rodar localmente:
    python3 integrar_inferencia_insumo_ocr_ambiguo_v1.py            # dry-run
    python3 integrar_inferencia_insumo_ocr_ambiguo_v1.py --aplicar   # aplica
"""
import sys
import difflib

CAMINHO = "app/services/mensagem_handler.py"

ANTIGO = '''            if dados_ocr.get("_ambiguo_cpf"):
                emitente = dados_ocr.get("emitente") or "não identificado"
                destinatario = dados_ocr.get("destinatario") or "não identificado"
                valor = dados_ocr.get("valor_total") or 0
                sessoes[key] = {
                    "_aguardando_historico_ocr_ambiguo": True,
                    "_ocr_valor": valor,
                    "_ocr_data": dados_ocr.get("data") or date.today().isoformat(),
                    "_midia": msg.midia_bytes,
                    "_mime": msg.mime_type,
                }
                return (
                    f"📄 Documento identificado, mas não consegui saber se você é quem "
                    f"vendeu ou quem comprou nele:\\n"
                    f"Emitente: {emitente}\\n"
                    f"Destinatário: {destinatario}\\n"
                    f"Valor: R$ {valor:.2f}\\n\\n"
                    f"Antes de lançar, me conta rapidinho: qual é o histórico/motivo "
                    f"desse lançamento? (ou digite CANCELAR)"
                )'''

NOVO = '''            if dados_ocr.get("_ambiguo_cpf"):
                emitente = dados_ocr.get("emitente") or "não identificado"
                destinatario = dados_ocr.get("destinatario") or "não identificado"
                valor = dados_ocr.get("valor_total") or 0
                itens_ocr = dados_ocr.get("itens", [])

                # Antes de pedir o wizard completo, tenta um sinal
                # independente do CPF: os itens da nota batem com insumos
                # já cadastrados? (achado 30/07: nota real de ração caiu
                # em CPF ambíguo por causa de leitura errada da imagem,
                # mesmo os itens claramente sendo compra de insumo)
                if itens_ocr:
                    auth_ocr = _autorizar_numero(msg.numero, msg.canal)
                    imovel_id_ocr = auth_ocr.get("imovel_id")
                    if imovel_id_ocr:
                        from app.services.ocr_handler import inferir_operacao_por_itens
                        inferencia = inferir_operacao_por_itens(itens_ocr, imovel_id_ocr)
                        if inferencia:
                            itens_txt = "; ".join(i["descricao"] for i in inferencia["itens_batidos"])
                            from app.db import buscar_descricao_conta
                            desc_conta = buscar_descricao_conta(inferencia["conta"])
                            conta_txt = f"{inferencia['conta']} - {desc_conta}" if desc_conta else inferencia["conta"]
                            sessoes[key] = {
                                "conta": inferencia["conta"],
                                "tipo": "despesa",
                                "valor": valor,
                                "data": dados_ocr.get("data") or date.today().isoformat(),
                                "confianca": 70,
                                "produto": itens_txt,
                                "atividade": "rural",
                                "_ocr": dados_ocr,
                                "_midia": msg.midia_bytes,
                                "_mime": msg.mime_type,
                            }
                            return (
                                f"📄 Não consegui confirmar pelo CPF se você comprou ou vendeu, "
                                f"mas os itens da nota ({itens_txt}) batem com insumos que você "
                                f"já usa.\\n\\n"
                                f"Parece ser compra de insumo, conta {conta_txt}.\\n"
                                f"Valor: R$ {valor:.2f}\\n\\n"
                                f"Responda SIM para confirmar como despesa, ou NAO se não for isso."
                            )

                sessoes[key] = {
                    "_aguardando_historico_ocr_ambiguo": True,
                    "_ocr_valor": valor,
                    "_ocr_data": dados_ocr.get("data") or date.today().isoformat(),
                    "_midia": msg.midia_bytes,
                    "_mime": msg.mime_type,
                }
                return (
                    f"📄 Documento identificado, mas não consegui saber se você é quem "
                    f"vendeu ou quem comprou nele:\\n"
                    f"Emitente: {emitente}\\n"
                    f"Destinatário: {destinatario}\\n"
                    f"Valor: R$ {valor:.2f}\\n\\n"
                    f"Antes de lançar, me conta rapidinho: qual é o histórico/motivo "
                    f"desse lançamento? (ou digite CANCELAR)"
                )'''


def main():
    aplicar = "--aplicar" in sys.argv
    with open(CAMINHO, "r", encoding="utf-8") as f:
        original = f.read()

    qtd = original.count(ANTIGO)
    if qtd != 1:
        print(f"✗ Esperava 1 ocorrência, achei {qtd}. Abortando sem gravar nada.")
        return

    corrigido = original.replace(ANTIGO, NOVO, 1)

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
