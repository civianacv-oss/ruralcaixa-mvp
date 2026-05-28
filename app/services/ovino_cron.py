"""
RuralCaixa — app/services/ovino_cron.py
Cron de alertas ovinos — roda junto com o cron existente de contratos.
Adicionar chamada em app/main.py no endpoint /processar-expirados ou criar rota própria.
"""

import os
import logging
import psycopg2
import psycopg2.extras
import httpx
from datetime import date

logger = logging.getLogger(__name__)

DB_URL = os.environ.get("DATABASE_URL", "")
WAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "")
PHONE_ID = os.environ.get("WHATSAPP_PHONE_ID", "")
GRAPH = "https://graph.facebook.com/v23.0"


def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def enviar_whatsapp(para: str, mensagem: str):
    """Envia mensagem WhatsApp usando a infra existente."""
    try:
        r = httpx.post(
            f"{GRAPH}/{PHONE_ID}/messages",
            headers={"Authorization": f"Bearer {WAPP_TOKEN}", "Content-Type": "application/json"},
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": para,
                "type": "text",
                "text": {"body": mensagem},
            },
            timeout=10,
        )
        return r.status_code == 200
    except Exception as e:
        logger.error("Erro WhatsApp: %s", e)
        return False


def processar_alertas_ovinos(imovel_id: int = None, dias_antecedencia: int = 1) -> dict:
    """
    Busca alertas vencendo hoje ou amanhã, envia WhatsApp para alertas de alta prioridade
    e marca como enviado.
    
    Chamado pelo cron existente a cada 30min ou pelo endpoint /processar-expirados.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Busca alertas pendentes vencendo nos próximos N dias
        filtro_imovel = "AND a.imovel_id = %s" if imovel_id else ""
        params = [dias_antecedencia]
        if imovel_id:
            params.insert(0, imovel_id)

        cur.execute(f"""
            SELECT
                a.id, a.imovel_id, a.animal_id, a.tipo_alerta, a.titulo,
                a.data_vencimento, a.prioridade, a.status,
                an.brinco AS animal_brinco,
                l.nome AS lote_nome,
                -- Telefone do produtor via imóvel
                p.telefone AS produtor_tel
            FROM ovino_alertas a
            LEFT JOIN ovino_animais an ON an.id = a.animal_id
            LEFT JOIN ovino_lotes l ON l.id = a.lote_id
            LEFT JOIN imoveis_rurais ir ON ir.id = a.imovel_id
            LEFT JOIN produtores p ON p.id = ir.produtor_id
            WHERE a.status = 'pendente'
              AND a.data_vencimento <= CURRENT_DATE + %s
              AND a.notificado_em IS NULL
              {filtro_imovel}
            ORDER BY a.prioridade DESC, a.data_vencimento ASC
            LIMIT 50
        """, params)

        alertas = cur.fetchall()
        enviados = 0
        ignorados = 0

        # Agrupa por produtor para mandar uma mensagem consolidada
        por_produtor: dict = {}
        for alerta in alertas:
            tel = alerta["produtor_tel"]
            if not tel:
                ignorados += 1
                continue
            if tel not in por_produtor:
                por_produtor[tel] = {"imovel_id": alerta["imovel_id"], "alertas": []}
            por_produtor[tel]["alertas"].append(alerta)

        for tel, dados in por_produtor.items():
            alta = [a for a in dados["alertas"] if a["prioridade"] == "alta"]
            media = [a for a in dados["alertas"] if a["prioridade"] == "media"]

            if not alta and not media:
                continue

            linhas = ["🐑 *RuralCaixa — Alertas Ovinos*\n"]

            if alta:
                linhas.append("🔴 *Alta prioridade:*")
                for a in alta[:5]:
                    venc = a["data_vencimento"].strftime("%d/%m") if a["data_vencimento"] else ""
                    brinco = f" ({a['animal_brinco']})" if a["animal_brinco"] else ""
                    linhas.append(f"• {a['titulo']}{brinco} — {venc}")

            if media:
                linhas.append("\n🟡 *Média prioridade:*")
                for a in media[:5]:
                    venc = a["data_vencimento"].strftime("%d/%m") if a["data_vencimento"] else ""
                    brinco = f" ({a['animal_brinco']})" if a["animal_brinco"] else ""
                    linhas.append(f"• {a['titulo']}{brinco} — {venc}")

            linhas.append(f"\nAcesse: ruralcaixa-mvp.vercel.app/ovino")
            msg = "\n".join(linhas)

            ok = enviar_whatsapp(tel, msg)
            if ok:
                ids = [a["id"] for a in dados["alertas"]]
                cur.execute("""
                    UPDATE ovino_alertas
                    SET status = 'enviado_whatsapp', notificado_em = NOW(), updated_at = NOW()
                    WHERE id = ANY(%s)
                """, (ids,))
                enviados += len(ids)

        conn.commit()
        logger.info("Cron alertas ovinos: %d enviados, %d ignorados", enviados, ignorados)
        return {"enviados": enviados, "ignorados": ignorados, "total_alertas": len(alertas)}

    except Exception as e:
        conn.rollback()
        logger.error("Erro cron alertas ovinos: %s", e, exc_info=True)
        return {"erro": str(e)}
    finally:
        conn.close()
