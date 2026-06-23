#!/usr/bin/env python3
"""
RuralCaixa — scripts/monitor_amonia_nitrito.py
===============================================
Script autônomo de monitoramento de amônia (NH₃) e nitrito (NO₂)
para todos os ciclos ativos de piscicultura.

Execução manual:
    python3 scripts/monitor_amonia_nitrito.py

Execução agendada (cron Linux — todo dia às 06h e 14h):
    0 6,14 * * * cd /app && python3 scripts/monitor_amonia_nitrito.py >> logs/monitor_agua.log 2>&1

Variáveis de ambiente necessárias:
    DATABASE_URL        — PostgreSQL connection string
    WHATSAPP_TOKEN      — Bearer token da Meta Cloud API
    WHATSAPP_PHONE_ID   — ID do número WhatsApp Business

Variáveis opcionais:
    NH3_AVISO           — Limite de aviso para amônia     (padrão: 0.3 mg/L)
    NH3_CRITICO         — Limite crítico para amônia      (padrão: 0.5 mg/L)
    NO2_AVISO           — Limite de aviso para nitrito    (padrão: 0.1 mg/L)
    NO2_CRITICO         — Limite crítico para nitrito     (padrão: 0.2 mg/L)
    JANELA_HORAS        — Horas para trás na busca        (padrão: 24)
    DRY_RUN             — Se "1", apenas loga sem enviar  (padrão: 0)
"""

import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import psycopg2
import psycopg2.extras

# ── Configuração de logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("monitor_agua")

# ── Limites (configuráveis via ENV) ───────────────────────────────────────────
NH3_AVISO   = float(os.environ.get("NH3_AVISO",   "0.3"))
NH3_CRITICO = float(os.environ.get("NH3_CRITICO", "0.5"))
NO2_AVISO   = float(os.environ.get("NO2_AVISO",   "0.1"))
NO2_CRITICO = float(os.environ.get("NO2_CRITICO", "0.2"))
JANELA_HORAS = int(os.environ.get("JANELA_HORAS", "24"))
DRY_RUN      = os.environ.get("DRY_RUN", "0") == "1"

# ── WhatsApp ──────────────────────────────────────────────────────────────────
WAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "")
PHONE_ID   = os.environ.get("WHATSAPP_PHONE_ID", "")
GRAPH      = "https://graph.facebook.com/v23.0"

# ── Banco ─────────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway",
)


# ── Estruturas de dados ───────────────────────────────────────────────────────
@dataclass
class Leitura:
    """Uma leitura de qualidade da água de um registro diário."""
    registro_id: int
    ciclo_id: int
    ciclo_nome: str
    especie: str
    imovel_id: int
    produtor_nome: str
    produtor_telefone: Optional[str]
    data_registro: str
    amonia_mg_l: Optional[float]
    nitrito_mg_l: Optional[float]
    # Calculados após instanciação
    alertas: list = field(default_factory=list)

    def classificar(self) -> None:
        """Preenche self.alertas com os problemas detectados."""
        self.alertas = []

        if self.amonia_mg_l is not None:
            if self.amonia_mg_l >= NH3_CRITICO:
                self.alertas.append({
                    "parametro": "Amônia (NH₃)",
                    "valor": self.amonia_mg_l,
                    "unidade": "mg/L",
                    "limite": NH3_CRITICO,
                    "nivel": "CRÍTICO",
                    "icone": "☠️",
                    "acao": (
                        "Reduzir arraçoamento imediatamente, aumentar renovação de água "
                        "e verificar biofiltro. Considere aeração emergencial."
                    ),
                })
            elif self.amonia_mg_l >= NH3_AVISO:
                self.alertas.append({
                    "parametro": "Amônia (NH₃)",
                    "valor": self.amonia_mg_l,
                    "unidade": "mg/L",
                    "limite": NH3_AVISO,
                    "nivel": "AVISO",
                    "icone": "⚠️",
                    "acao": (
                        "Monitorar de perto. Reduzir arraçoamento em 20% "
                        "e aumentar renovação de água."
                    ),
                })

        if self.nitrito_mg_l is not None:
            if self.nitrito_mg_l >= NO2_CRITICO:
                self.alertas.append({
                    "parametro": "Nitrito (NO₂)",
                    "valor": self.nitrito_mg_l,
                    "unidade": "mg/L",
                    "limite": NO2_CRITICO,
                    "nivel": "CRÍTICO",
                    "icone": "☠️",
                    "acao": (
                        "Verificar biofiltro e sistema de nitrificação. "
                        "Reduzir arraçoamento e aumentar renovação de água urgentemente."
                    ),
                })
            elif self.nitrito_mg_l >= NO2_AVISO:
                self.alertas.append({
                    "parametro": "Nitrito (NO₂)",
                    "valor": self.nitrito_mg_l,
                    "unidade": "mg/L",
                    "limite": NO2_AVISO,
                    "nivel": "AVISO",
                    "icone": "⚠️",
                    "acao": (
                        "Verificar biofiltro. Monitorar diariamente "
                        "e reduzir arraçoamento preventivamente."
                    ),
                })

    @property
    def tem_problema(self) -> bool:
        return len(self.alertas) > 0

    @property
    def nivel_maximo(self) -> str:
        """Retorna o nível mais grave entre os alertas."""
        if any(a["nivel"] == "CRÍTICO" for a in self.alertas):
            return "CRÍTICO"
        if any(a["nivel"] == "AVISO" for a in self.alertas):
            return "AVISO"
        return "OK"


# ── Funções principais ────────────────────────────────────────────────────────

def buscar_leituras(conn) -> list[Leitura]:
    """
    Busca registros diários com amônia ou nitrito acima dos limites de aviso,
    nas últimas JANELA_HORAS horas, de ciclos ativos.
    """
    sql = """
        SELECT
            rd.id                       AS registro_id,
            c.id                        AS ciclo_id,
            c.nome_ciclo                AS ciclo_nome,
            c.especie,
            c.imovel_id,
            COALESCE(ir.nome, 'Imóvel ' || c.imovel_id::text)
                                        AS produtor_nome,
            p.telefone                  AS produtor_telefone,
            rd.data_registro::text      AS data_registro,
            rd.amonia_mg_l,
            rd.nitrito_mg_l
        FROM registros_diarios_piscicultura rd
        JOIN ciclos_piscicultura c ON c.id = rd.ciclo_id
        LEFT JOIN imoveis_rurais ir ON ir.id = c.imovel_id
        LEFT JOIN produtores p ON p.id = ir.produtor_id
        WHERE c.status = 'ativo'
          AND rd.data_registro >= CURRENT_DATE - INTERVAL '%s hours'
          AND (
              rd.amonia_mg_l  >= %s
           OR rd.nitrito_mg_l >= %s
          )
        ORDER BY c.imovel_id, c.id, rd.data_registro DESC
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, (JANELA_HORAS, NH3_AVISO, NO2_AVISO))
        rows = cur.fetchall()

    leituras = []
    for row in rows:
        l = Leitura(
            registro_id=row["registro_id"],
            ciclo_id=row["ciclo_id"],
            ciclo_nome=row["ciclo_nome"],
            especie=row["especie"],
            imovel_id=row["imovel_id"],
            produtor_nome=row["produtor_nome"],
            produtor_telefone=row["produtor_telefone"],
            data_registro=row["data_registro"],
            amonia_mg_l=float(row["amonia_mg_l"]) if row["amonia_mg_l"] is not None else None,
            nitrito_mg_l=float(row["nitrito_mg_l"]) if row["nitrito_mg_l"] is not None else None,
        )
        l.classificar()
        if l.tem_problema:
            leituras.append(l)

    return leituras


def montar_mensagem(leituras_imovel: list[Leitura]) -> str:
    """
    Monta a mensagem WhatsApp consolidada para um produtor,
    agrupando todos os ciclos com problema.
    """
    produtor = leituras_imovel[0].produtor_nome
    agora = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")

    linhas = [
        f"🐟 *RuralCaixa — Alerta Qualidade da Água*",
        f"📍 {produtor}",
        f"🕐 {agora} UTC",
        "",
    ]

    for l in leituras_imovel:
        nivel_emoji = "🔴" if l.nivel_maximo == "CRÍTICO" else "🟡"
        linhas.append(f"{nivel_emoji} *Ciclo: {l.ciclo_nome}* ({l.especie})")
        linhas.append(f"   📅 Registro: {l.data_registro}")

        for alerta in l.alertas:
            linhas += [
                f"   {alerta['icone']} *{alerta['parametro']}*: "
                f"{alerta['valor']} {alerta['unidade']} "
                f"(limite {alerta['nivel']}: {alerta['limite']} {alerta['unidade']})",
                f"   💡 _{alerta['acao']}_",
            ]
        linhas.append("")

    linhas += [
        "─────────────────────",
        "📊 Limites de referência (EMBRAPA):",
        f"  • NH₃: aviso > {NH3_AVISO} | crítico > {NH3_CRITICO} mg/L",
        f"  • NO₂: aviso > {NO2_AVISO} | crítico > {NO2_CRITICO} mg/L",
        "",
        "_Mensagem automática — RuralCaixa_",
    ]

    return "\n".join(linhas)


def enviar_whatsapp(para: str, mensagem: str) -> bool:
    """Envia mensagem via WhatsApp Business API."""
    if DRY_RUN:
        log.info("[DRY_RUN] Mensagem para %s:\n%s", para, mensagem)
        return True

    if not WAPP_TOKEN or not PHONE_ID:
        log.warning("WhatsApp não configurado — WHATSAPP_TOKEN / WHATSAPP_PHONE_ID ausentes.")
        return False

    try:
        r = httpx.post(
            f"{GRAPH}/{PHONE_ID}/messages",
            headers={
                "Authorization": f"Bearer {WAPP_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": para,
                "type": "text",
                "text": {"body": mensagem},
            },
            timeout=10,
        )
        if r.status_code == 200:
            log.info("✅ WhatsApp enviado para %s", para)
            return True
        log.warning("❌ WhatsApp HTTP %d para %s: %s", r.status_code, para, r.text[:200])
        return False
    except Exception as exc:
        log.error("❌ Erro ao enviar WhatsApp para %s: %s", para, exc)
        return False


def registrar_alerta_banco(conn, leitura: Leitura) -> None:
    """
    Insere o alerta na tabela piscicultura_alertas para rastreabilidade,
    usando hash_unicidade para evitar duplicatas.
    """
    import hashlib
    from datetime import date

    for alerta in leitura.alertas:
        chave = f"monitor_{leitura.ciclo_id}_{leitura.data_registro}_{alerta['parametro']}"
        hash_u = hashlib.sha256(chave.encode()).hexdigest()

        sql = """
            INSERT INTO piscicultura_alertas (
                imovel_id, ref_id, tipo_alerta, titulo, descricao,
                nivel, prioridade, data_referencia, data_vencimento,
                origem_evento, hash_unicidade
            ) VALUES (
                %(imovel_id)s, %(ref_id)s, %(tipo_alerta)s, %(titulo)s, %(descricao)s,
                %(nivel)s, %(prioridade)s, %(data_ref)s, %(data_venc)s,
                %(origem)s, %(hash_u)s
            )
            ON CONFLICT (hash_unicidade) DO NOTHING
        """
        try:
            with conn.cursor() as cur:
                cur.execute(sql, {
                    "imovel_id":   leitura.imovel_id,
                    "ref_id":      leitura.ciclo_id,
                    "tipo_alerta": "amonia_alta" if "NH₃" in alerta["parametro"] else "amonia_alta",
                    "titulo":      f"{alerta['icone']} {alerta['parametro']} {alerta['nivel']}: {leitura.ciclo_nome}",
                    "descricao":   (
                        f"Ciclo {leitura.ciclo_nome} ({leitura.especie}): "
                        f"{alerta['parametro']} = {alerta['valor']} {alerta['unidade']} "
                        f"em {leitura.data_registro}. {alerta['acao']}"
                    ),
                    "nivel":       "critico" if alerta["nivel"] == "CRÍTICO" else "aviso",
                    "prioridade":  "alta" if alerta["nivel"] == "CRÍTICO" else "media",
                    "data_ref":    leitura.data_registro,
                    "data_venc":   date.today(),
                    "origem":      "monitor_amonia_nitrito",
                    "hash_u":      hash_u,
                })
            conn.commit()
        except Exception as exc:
            conn.rollback()
            log.warning("Erro ao persistir alerta no banco: %s", exc)


def gerar_relatorio(leituras: list[Leitura]) -> dict:
    """Gera um dicionário de resumo para logging/auditoria."""
    criticos = [l for l in leituras if l.nivel_maximo == "CRÍTICO"]
    avisos   = [l for l in leituras if l.nivel_maximo == "AVISO"]

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "janela_horas": JANELA_HORAS,
        "total_ciclos_com_problema": len(leituras),
        "criticos": len(criticos),
        "avisos": len(avisos),
        "limites": {
            "NH3_aviso": NH3_AVISO, "NH3_critico": NH3_CRITICO,
            "NO2_aviso": NO2_AVISO, "NO2_critico": NO2_CRITICO,
        },
        "ciclos": [
            {
                "ciclo_id":   l.ciclo_id,
                "ciclo_nome": l.ciclo_nome,
                "especie":    l.especie,
                "imovel_id":  l.imovel_id,
                "data":       l.data_registro,
                "nivel":      l.nivel_maximo,
                "amonia":     l.amonia_mg_l,
                "nitrito":    l.nitrito_mg_l,
                "alertas":    [a["parametro"] + " " + a["nivel"] for a in l.alertas],
            }
            for l in leituras
        ],
    }


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> int:
    log.info("=" * 60)
    log.info("Monitor Amônia/Nitrito — RuralCaixa Piscicultura")
    log.info("Janela: últimas %d horas | DRY_RUN: %s", JANELA_HORAS, DRY_RUN)
    log.info("Limites NH₃: aviso=%.2f | crítico=%.2f mg/L", NH3_AVISO, NH3_CRITICO)
    log.info("Limites NO₂: aviso=%.2f | crítico=%.2f mg/L", NO2_AVISO, NO2_CRITICO)
    log.info("=" * 60)

    # Conectar ao banco
    try:
        conn = psycopg2.connect(DATABASE_URL)
        log.info("✅ Conectado ao banco PostgreSQL")
    except Exception as exc:
        log.error("❌ Falha ao conectar ao banco: %s", exc)
        return 1

    try:
        leituras = buscar_leituras(conn)
    except Exception as exc:
        log.error("❌ Erro ao buscar leituras: %s", exc)
        conn.close()
        return 1

    relatorio = gerar_relatorio(leituras)
    log.info("📊 Resultado: %d ciclo(s) com problema (%d crítico(s), %d aviso(s))",
             relatorio["total_ciclos_com_problema"],
             relatorio["criticos"],
             relatorio["avisos"])

    if not leituras:
        log.info("✅ Nenhum problema detectado. Qualidade da água dentro dos limites.")
        conn.close()
        return 0

    # Agrupar por imovel_id para enviar uma mensagem consolidada por produtor
    por_imovel: dict[int, list[Leitura]] = {}
    for l in leituras:
        por_imovel.setdefault(l.imovel_id, []).append(l)

    enviados = 0
    falhas   = 0

    for imovel_id, grupo in por_imovel.items():
        telefone = grupo[0].produtor_telefone
        produtor = grupo[0].produtor_nome

        # Persistir alertas no banco (sem duplicatas)
        for l in grupo:
            registrar_alerta_banco(conn, l)

        # Enviar WhatsApp
        if not telefone:
            log.warning("⚠️  Produtor '%s' (imovel_id=%d) sem telefone cadastrado — pulando envio.",
                        produtor, imovel_id)
            falhas += 1
            continue

        mensagem = montar_mensagem(grupo)
        ok = enviar_whatsapp(telefone, mensagem)

        if ok:
            enviados += 1
            log.info("📱 Alerta enviado para %s (%s)", produtor, telefone)
        else:
            falhas += 1
            log.warning("❌ Falha ao enviar alerta para %s (%s)", produtor, telefone)

    # Imprimir relatório JSON para auditoria
    log.info("📋 Relatório completo:\n%s", json.dumps(relatorio, ensure_ascii=False, indent=2))
    log.info("Resumo: %d enviado(s), %d falha(s)", enviados, falhas)

    conn.close()
    return 0 if falhas == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
