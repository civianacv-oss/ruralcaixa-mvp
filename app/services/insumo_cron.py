# app/services/insumo_cron.py
import os, logging
import httpx
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_GROUP_ID  = os.getenv("TELEGRAM_GROUP_CHAT_ID", "-5457537054")
API_BASE = os.getenv("API_BASE_URL", "https://ruralcaixa-mvp-production.up.railway.app")

async def verificar_alertas_insumo():
    """Verifica insumos com estoque baixo e notifica no Telegram."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{API_BASE}/insumos/alertas")
            if r.status_code != 200:
                return
            alertas = r.json().get("data", [])
            if not alertas:
                return

            criticos = [a for a in alertas if a["status_estoque"] == "critico"]
            baixos   = [a for a in alertas if a["status_estoque"] == "baixo"]

            if not criticos and not baixos:
                return

            linhas = ["⚠️ *Alerta de Estoque — RuralCaixa*\n"]
            if criticos:
                linhas.append("🔴 *Estoque CRÍTICO (zerado ou negativo):*")
                for a in criticos:
                    linhas.append(f"  • {a['nome']}: {a['estoque_atual']} {a['unidade']} (mín: {a['estoque_minimo']})")
            if baixos:
                linhas.append("\n🟡 *Estoque BAIXO:*")
                for a in baixos:
                    linhas.append(f"  • {a['nome']}: {a['estoque_atual']} {a['unidade']} (mín: {a['estoque_minimo']})")

            linhas.append("\nAcesse /pedidos-compra para gerar reposição.")
            msg = "\n".join(linhas)

            if TELEGRAM_BOT_TOKEN:
                await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": TELEGRAM_GROUP_ID, "text": msg, "parse_mode": "Markdown"},
                )
                logger.info(f"[InsumosCron] Alerta enviado: {len(criticos)} críticos, {len(baixos)} baixos")

            # Gera pedidos automáticos para insumos com reposicao_modo=automatico
            for a in criticos + baixos:
                if a.get("reposicao_modo") == "automatico" and a.get("fornecedor_id"):
                    qtd = max(0, a.get("estoque_ideal",0) - a.get("estoque_atual",0))
                    if qtd > 0:
                        await client.post(
                            f"{API_BASE}/pedidos-compra/",
                            json={"insumo_id": a["id"], "quantidade": qtd, "modo_geracao": "automatico"},
                            timeout=10
                        )
                        logger.info(f"[InsumosCron] Pedido automático: {a['nome']} +{qtd}")

    except Exception as e:
        logger.error(f"[InsumosCron] Erro: {e}")
