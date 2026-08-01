"""
patch_recibo_telegram_v1.py

Fase 2 da unificação de bots — porta o wizard de Recibo (já isolado em
app/services/recibo_handler.py) para o canal Telegram (mensagem_handler.py),
reaproveitando as mesmas 4 funções que o WhatsApp já usa. Não duplica
lógica: só adiciona os pontos de chamada que faltam no Telegram.

O que este patch faz (3 edições em app/services/mensagem_handler.py):

  1. Logo após os comandos fixos (/SALDO, /DRE, /AJUDA, cadastro de
     colaborador) e ANTES do bloco grande de sessão pendente:
       - intercepta is_recibo_wizard_ativo() -> processar_etapa_recibo()
       - intercepta confirmação SIM/NAO de sessões _tipo == "recibo_pendente"
       - exclui "recibo_wizard" e "recibo_pendente" da condição do bloco
         grande de confirmação de lançamento (senão um "NAO" durante o
         wizard seria capturado por engano pelo fluxo de lançamento comum)

  2. Adiciona a função _confirmar_recibo_pendente(), que cria o recibo e
     dispara o OTP (sempre via WhatsApp para o destinatário — isso não
     muda, é o canal de assinatura estabelecido). Resolve o produtor via
     _autorizar_numero() (telegram_chat_id ou telefone conforme o canal),
     nunca via buscar_produtor_por_numero() puro — que só busca por
     telefone e quebraria no Telegram.

  3. No fallback de classificar() (quando "not resultado"), tenta
     detectar_intencao_recibo() -> iniciar_recibo_wizard() ANTES de cair
     no fluxo genérico de "não reconheci esse tipo de lançamento".

USO:
    1) Rode em modo dry-run primeiro (padrão, sem gravar nada):
         python3 patch_recibo_telegram_v1.py
    2) Revise o diff impresso.
    3) Só então aplique de fato:
         python3 patch_recibo_telegram_v1.py --aplicar

Faz backup automático em mensagem_handler.py.bak_recibo_v1 antes de gravar.
Cada bloco tem a contagem de ocorrências validada (precisa ser exatamente 1);
se não bater, o script aborta sem gravar nada.
"""

import sys
import shutil
from pathlib import Path

ARQUIVO = Path("app/services/mensagem_handler.py")
BACKUP = Path("app/services/mensagem_handler.py.bak_recibo_v1")

# ─────────────────────────────────────────────────────────────────────────
# BLOCO A — interceptação do wizard + confirmação de recibo_pendente,
# inserida antes do bloco grande de sessão pendente.
# ─────────────────────────────────────────────────────────────────────────
BLOCO_A_ANTIGO = '''    if _eh_comando_cadastro_colaborador(texto):
        return await _processar_cadastro_colaborador(texto, msg.numero, msg.canal)

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") != "cadastro":'''

BLOCO_A_NOVO = '''    if _eh_comando_cadastro_colaborador(texto):
        return await _processar_cadastro_colaborador(texto, msg.numero, msg.canal)

    # ── Assistente de Recibo (Fase 2 da unificação de bots) ─────────────
    # Reaproveita o MESMO módulo usado pelo WhatsApp (recibo_handler.py),
    # sem duplicar lógica. Precisa vir ANTES do bloco grande de sessão
    # pendente abaixo, senão uma sessão de wizard ativa (_tipo ==
    # "recibo_wizard"/"recibo_pendente", que é != "cadastro") cairia
    # dentro daquele bloco e um "NAO" durante o wizard seria capturado
    # por engano pelo cancelamento genérico de lançamento.
    from app.services.recibo_handler import (
        is_recibo_wizard_ativo, processar_etapa_recibo,
    )
    if is_recibo_wizard_ativo(sessoes, key):
        resposta = processar_etapa_recibo(sessoes, key, texto)
        return resposta or ""

    if sessoes.get(key, {}).get("_tipo") == "recibo_pendente":
        if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
            sess_recibo = sessoes.pop(key)
            return await _confirmar_recibo_pendente(sess_recibo, msg.numero, msg.canal)
        elif texto_up in ("NAO", "N", "CANCELA"):
            sessoes.pop(key, None)
            return "❌ Recibo cancelado."
        else:
            return "Não entendi. Responda SIM para confirmar ou NAO para cancelar."

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") not in ("cadastro", "recibo_wizard", "recibo_pendente"):'''

# ─────────────────────────────────────────────────────────────────────────
# BLOCO B — nova função helper _confirmar_recibo_pendente, inserida antes
# de _resolver_imovel_id (ponto de inserção já usado como referência
# porque seu texto é estável e único no arquivo).
# ─────────────────────────────────────────────────────────────────────────
BLOCO_B_ANTIGO = '''def _resolver_imovel_id(numero: str) -> int:'''

BLOCO_B_NOVO = '''async def _confirmar_recibo_pendente(sess: dict, numero: str, canal: str) -> str:
    """Cria e envia o recibo (OTP sempre via WhatsApp pro destinatário —
    isso não muda, é o canal de assinatura já validado ponta a ponta).
    Origem da sessão tanto faz (wizard ou detecção direta via
    classificar_recibo), o formato de sess é o mesmo nos dois casos.

    Resolve o produtor via _autorizar_numero() em vez de
    buscar_produtor_por_numero(), porque esta última só busca por
    telefone — no Telegram "numero" é o chat_id, não telefone, e a busca
    falharia silenciosamente."""
    auth = _autorizar_numero(numero, canal)
    produtor_id = auth.get("produtor_id")
    if not produtor_id:
        return "Não encontrei seu cadastro de produtor. Envie CADASTRAR para se registrar primeiro."

    from app.db import engine
    from sqlalchemy import text as sqlt
    with engine.connect() as conn:
        row = conn.execute(
            sqlt("SELECT nome FROM produtores WHERE id = :pid"), {"pid": produtor_id}
        ).fetchone()
    produtor_nome = row[0] if row else "Produtor"

    try:
        from app.routers.recibos import (
            get_db as recibos_get_db, gerar_otp, hash_otp,
            _enviar_contexto_whatsapp, _enviar_otp_whatsapp,
        )
        from datetime import datetime as _dt, timedelta as _td

        conn = recibos_get_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO recibos (produtor_id, destinatario_nome, destinatario_documento,
                destinatario_telefone, objeto, valor, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'aguardando_assinatura')
            RETURNING id
        """, (produtor_id, sess["destinatario_nome"], sess["destinatario_documento"],
              sess["destinatario_telefone"], sess["objeto"], sess["valor"]))
        recibo_id = cur.fetchone()["id"]

        otp = gerar_otp()
        otp_hash_val = hash_otp(otp)
        expira = _dt.now() + _td(minutes=30)
        cur.execute(
            "UPDATE recibos SET otp_hash = %s, otp_expira_em = %s WHERE id = %s",
            (otp_hash_val, expira, recibo_id)
        )
        conn.commit()
        conn.close()

        _enviar_contexto_whatsapp(
            sess["destinatario_telefone"], sess["destinatario_nome"],
            produtor_nome, sess["valor"], sess["objeto"]
        )
        enviado, _detalhe = _enviar_otp_whatsapp(sess["destinatario_telefone"], otp)

        return (
            f"✅ Recibo criado! Código de confirmação enviado para {sess['destinatario_nome']}.\\n"
            f"Valor: R$ {sess['valor']:,.2f}\\n"
            f"Objeto: {sess['objeto']}"
            + ("" if enviado else "\\n\\n(Atenção: o envio do WhatsApp para o destinatário falhou)")
        )
    except Exception as e:
        logger.error("Erro ao criar recibo via %s: %s", canal, e)
        return "Erro ao criar o recibo. Tente novamente ou use o app."


def _resolver_imovel_id(numero: str) -> int:'''

# ─────────────────────────────────────────────────────────────────────────
# BLOCO C — fallback de detecção de recibo quando classificar() não
# reconhece nada, ANTES de cair no fluxo genérico "não reconheci".
# ─────────────────────────────────────────────────────────────────────────
BLOCO_C_ANTIGO = '''    if not resultado:
        sessoes[key] = {"_aguardando_tipo_novo_termo": True, "_texto_original": texto}
        return _texto_pergunta_tipo_lancamento(
            prefixo=f"Não reconheci esse tipo de lançamento (\\"{texto[:60]}\\"). "
        )'''

BLOCO_C_NOVO = '''    if not resultado:
        from app.services.recibo_handler import detectar_intencao_recibo, iniciar_recibo_wizard
        if detectar_intencao_recibo(texto):
            return iniciar_recibo_wizard(sessoes, key)
        sessoes[key] = {"_aguardando_tipo_novo_termo": True, "_texto_original": texto}
        return _texto_pergunta_tipo_lancamento(
            prefixo=f"Não reconheci esse tipo de lançamento (\\"{texto[:60]}\\"). "
        )'''

BLOCOS = [
    ("A — interceptação do wizard + confirmação recibo_pendente", BLOCO_A_ANTIGO, BLOCO_A_NOVO),
    ("B — função _confirmar_recibo_pendente", BLOCO_B_ANTIGO, BLOCO_B_NOVO),
    ("C — fallback detectar_intencao_recibo no classificar()", BLOCO_C_ANTIGO, BLOCO_C_NOVO),
]


def main():
    aplicar = "--aplicar" in sys.argv

    if not ARQUIVO.exists():
        print(f"ERRO: {ARQUIVO} não encontrado. Rode a partir da raiz do repo "
              f"(~/ruralcaixa/ruralcaixa-mvp).")
        sys.exit(1)

    conteudo = ARQUIVO.read_text(encoding="utf-8")
    conteudo_original = conteudo

    for nome, antigo, novo in BLOCOS:
        n_ocorrencias = conteudo.count(antigo)
        print(f"[{nome}] ocorrências encontradas: {n_ocorrencias}")
        if n_ocorrencias != 1:
            print(f"  ABORTANDO: esperava exatamente 1 ocorrência, achei {n_ocorrencias}.")
            print("  O arquivo pode ter mudado desde o diagnóstico. Nada foi gravado.")
            sys.exit(1)
        conteudo = conteudo.replace(antigo, novo)

    print()
    if not aplicar:
        print("=== DRY RUN (nada foi gravado) ===")
        print("Revise os 3 blocos acima. Se estiver tudo certo, rode de novo com --aplicar")
        print(f"Tamanho original: {len(conteudo_original)} chars -> novo: {len(conteudo)} chars")
        return

    shutil.copy2(ARQUIVO, BACKUP)
    print(f"Backup salvo em: {BACKUP}")
    ARQUIVO.write_text(conteudo, encoding="utf-8")
    print(f"Patch aplicado em: {ARQUIVO}")
    print()
    print("Próximo passo: revisar com 'git diff app/services/mensagem_handler.py',")
    print("testar localmente, depois commit + push + deploy Railway (SHA completo).")


if __name__ == "__main__":
    main()
