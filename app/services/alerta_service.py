"""
RuralCaixa — app/services/alerta_service.py

Camada comum de alertas.  Todos os crons de módulo apenas geram a lista de
alertas; este serviço cuida de:
  - persistir alertas sem duplicatas (via hash_unicidade)
  - buscar alertas pendentes por tabela/módulo
  - agrupar por produtor
  - montar a mensagem WhatsApp consolidada
  - marcar como enviado

Uso nos crons:
    from app.services.alerta_service import AlertaService
    svc = AlertaService(conn, tabela="bovino_alertas")
    svc.upsert(alertas_lista)          # insere sem duplicar
    svc.processar_e_enviar(dias=1)     # busca, envia, marca
"""

import hashlib
import logging
import os
from datetime import date, timedelta
from typing import Optional

import httpx
import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

# ── Ícones por nível ──────────────────────────────────────────
ICONE = {"critico": "🔴", "aviso": "🟡", "info": "🔵"}

# ── Emojis por módulo ─────────────────────────────────────────
EMOJI_MODULO = {
    "bovino_alertas":       "🐄",
    "suino_alertas":        "🐷",
    "ovino_alertas":        "🐑",
    "caprino_alertas":      "🐐",
    "piscicultura_alertas": "🐟",
    "agricultura_alertas":  "🌾",
    "acai_alertas":         "🌴",
}

NOME_MODULO = {
    "bovino_alertas":       "Bovinos",
    "suino_alertas":        "Suínos",
    "ovino_alertas":        "Ovinos",
    "caprino_alertas":      "Caprinos",
    "piscicultura_alertas": "Piscicultura",
    "agricultura_alertas":  "Agricultura",
    "acai_alertas":         "Açaí",
}


def _hash(imovel_id: int, tipo: str, ref_id: Optional[int], data_venc: Optional[date]) -> str:
    """Hash de unicidade para evitar alertas duplicados."""
    raw = f"{imovel_id}:{tipo}:{ref_id}:{data_venc}"
    return hashlib.sha256(raw.encode()).hexdigest()


class AlertaService:
    """
    Serviço genérico de alertas.  Instanciar com a conexão psycopg2 e o nome
    da tabela de alertas do módulo.

    Parâmetros
    ----------
    conn        : conexão psycopg2 já aberta (sem autocommit)
    tabela      : nome da tabela de alertas (ex: 'bovino_alertas')
    col_ref_id  : nome da coluna de referência do registro (ex: 'animal_id',
                  'safra_id', 'ciclo_id', 'talhao_id').  Pode ser None.
    """

    def __init__(self, conn, tabela: str, col_ref_id: Optional[str] = None):
        self.conn = conn
        self.tabela = tabela
        self.col_ref_id = col_ref_id
        self.cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # ── Inserção sem duplicata ────────────────────────────────
    def upsert(self, alertas: list[dict]) -> int:
        """
        Insere alertas ignorando duplicatas por hash_unicidade.
        Cada dict deve conter:
          imovel_id, tipo_alerta, titulo, nivel, prioridade,
          data_vencimento, origem_evento
        Opcionais: ref_id (valor para col_ref_id), descricao, data_referencia
        """
        criados = 0
        for a in alertas:
            ref_id = a.get("ref_id")
            data_venc = a.get("data_vencimento")
            h = _hash(a["imovel_id"], a["tipo_alerta"], ref_id, data_venc)

            cols = [
                "imovel_id", "tipo_alerta", "titulo", "nivel", "prioridade",
                "status", "data_referencia", "data_vencimento",
                "origem_evento", "hash_unicidade",
            ]
            vals = [
                a["imovel_id"], a["tipo_alerta"], a["titulo"],
                a.get("nivel", "aviso"), a.get("prioridade", "media"),
                "pendente",
                a.get("data_referencia", date.today()),
                data_venc,
                a.get("origem_evento", "cron"),
                h,
            ]

            if self.col_ref_id and ref_id is not None:
                cols.insert(2, self.col_ref_id)
                vals.insert(2, ref_id)

            if a.get("descricao"):
                cols.append("descricao")
                vals.append(a["descricao"])

            placeholders = ", ".join(["%s"] * len(vals))
            col_str = ", ".join(cols)

            self.cur.execute(
                f"""
                INSERT INTO {self.tabela} ({col_str})
                VALUES ({placeholders})
                ON CONFLICT (hash_unicidade) DO NOTHING
                """,
                vals,
            )
            if self.cur.rowcount > 0:
                criados += 1

        self.conn.commit()
        logger.info("[%s] upsert: %d/%d alertas criados", self.tabela, criados, len(alertas))
        return criados

    # ── Busca alertas pendentes ───────────────────────────────
    def buscar_pendentes(self, dias_antecedencia: int = 1, imovel_id: Optional[int] = None) -> list:
        """Retorna alertas pendentes vencendo nos próximos N dias."""
        filtro = "AND a.imovel_id = %s" if imovel_id else ""
        params: list = [dias_antecedencia]
        if imovel_id:
            params.insert(0, imovel_id)

        self.cur.execute(
            f"""
            SELECT
                a.*,
                p.telefone AS produtor_tel,
                p.nome     AS produtor_nome
            FROM {self.tabela} a
            LEFT JOIN imoveis_rurais ir ON ir.id = a.imovel_id
            LEFT JOIN produtores p ON p.id = ir.produtor_id
            WHERE a.status = 'pendente'
              AND a.notificado_em IS NULL
              AND (a.data_vencimento IS NULL
                   OR a.data_vencimento <= CURRENT_DATE + %s)
              {filtro}
            ORDER BY
                CASE a.nivel WHEN 'critico' THEN 1 WHEN 'aviso' THEN 2 ELSE 3 END,
                a.data_vencimento ASC NULLS LAST
            LIMIT 100
            """,
            params,
        )
        return self.cur.fetchall()

    # ── Montar mensagem ───────────────────────────────────────
    def montar_mensagem(self, alertas: list) -> str:
        emoji = EMOJI_MODULO.get(self.tabela, "📋")
        nome = NOME_MODULO.get(self.tabela, self.tabela)
        linhas = [f"{emoji} *RuralCaixa — Alertas {nome}*\n"]

        por_nivel = {"critico": [], "aviso": [], "info": []}
        for a in alertas:
            nivel = a.get("nivel") or "aviso"
            por_nivel.setdefault(nivel, []).append(a)

        for nivel in ("critico", "aviso", "info"):
            grupo = por_nivel[nivel]
            if not grupo:
                continue
            icone = ICONE[nivel]
            label = nivel.upper()
            linhas.append(f"{icone} *{label}:*")
            for a in grupo[:6]:
                venc = ""
                if a.get("data_vencimento"):
                    venc = f" — {a['data_vencimento'].strftime('%d/%m')}"
                linhas.append(f"• {a['titulo']}{venc}")

        return "\n".join(linhas)

    # ── Marcar como enviado ───────────────────────────────────
    def marcar_enviados(self, ids: list[int]) -> None:
        self.cur.execute(
            f"""
            UPDATE {self.tabela}
            SET status = 'enviado_whatsapp', notificado_em = NOW(), updated_at = NOW()
            WHERE id = ANY(%s)
            """,
            (ids,),
        )
        self.conn.commit()

    # ── Fluxo completo ────────────────────────────────────────
    def processar_e_enviar(
        self,
        dias: int = 1,
        imovel_id: Optional[int] = None,
    ) -> dict:
        """
        Busca alertas pendentes, agrupa por produtor, envia WhatsApp e marca.
        Retorna resumo: {enviados, ignorados, total_alertas}.
        """
        from app.services.whatsapp_service import enviar_whatsapp

        alertas = self.buscar_pendentes(dias_antecedencia=dias, imovel_id=imovel_id)
        if not alertas:
            return {"enviados": 0, "ignorados": 0, "total_alertas": 0}

        # --- Telegram: envia consolidado para o grupo ---
        try:
            import requests as _req
            import os as _os
            _tg_token = _os.getenv("TELEGRAM_BOT_TOKEN", "")
            _tg_group = _os.getenv("TELEGRAM_GROUP_CHAT_ID", "")
            if _tg_token and _tg_group:
                relevantes_tg = [a for a in alertas if a.get("nivel") in ("critico", "aviso")]
                if relevantes_tg:
                    msg_tg = self.montar_mensagem_telegram(relevantes_tg)
                    _req.post(
                        f"https://api.telegram.org/bot{_tg_token}/sendMessage",
                        json={"chat_id": _tg_group, "text": msg_tg, "parse_mode": "HTML"},
                        timeout=10,
                    )
        except Exception as _e:
            logger.warning("Telegram nao enviado: %s", _e)

        # Agrupa por telefone do produtor
        por_tel: dict = {}
        ignorados = 0
        for a in alertas:
            tel = a.get("produtor_tel")
            if not tel:
                ignorados += 1
                continue
            por_tel.setdefault(tel, []).append(a)

        enviados = 0
        for tel, grupo in por_tel.items():
            # Filtra apenas critico + aviso (não envia INFO no WhatsApp)
            relevantes = [a for a in grupo if a.get("nivel") in ("critico", "aviso")]
            if not relevantes:
                continue
            msg = self.montar_mensagem(relevantes)
            ok = enviar_whatsapp(tel, msg)
            if ok:
                self.marcar_enviados([a["id"] for a in relevantes])
                enviados += len(relevantes)

        logger.info(
            "[%s] processar_e_enviar: %d enviados, %d ignorados / %d total",
            self.tabela, enviados, ignorados, len(alertas),
        )
        return {"enviados": enviados, "ignorados": ignorados, "total_alertas": len(alertas)}
