#!/usr/bin/env python3
"""
RuralCaixa — monitor-service/scheduler.py
==========================================
Serviço Railway dedicado para monitoramento contínuo de qualidade da água.
Usa APScheduler para executar o monitor de amônia/nitrito 2x por dia.

Horários de execução (America/Sao_Paulo):
  - 06:00 BRT — antes do arraçoamento matinal
  - 14:00 BRT — após o arraçoamento da tarde

Também expõe um endpoint HTTP /health e /run para:
  - Health check do Railway
  - Disparo manual via POST /run
"""

import logging
import os
import sys
import threading
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from flask import Flask, jsonify

# Adiciona o diretório raiz ao path para importar o script monitor
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("scheduler")

# ── Flask app (health check + manual trigger) ─────────────────────────────────
app = Flask(__name__)

# Estado de execução
estado = {
    "ultima_execucao": None,
    "ultimo_resultado": None,
    "total_execucoes": 0,
    "total_alertas_enviados": 0,
    "em_execucao": False,
}
_lock = threading.Lock()


def executar_monitor() -> dict:
    """Executa o script de monitoramento e retorna o resultado."""
    with _lock:
        if estado["em_execucao"]:
            log.warning("Monitor já em execução — pulando disparo duplicado.")
            return {"status": "skipped", "reason": "already_running"}
        estado["em_execucao"] = True

    log.info("▶️  Iniciando monitor de amônia/nitrito...")
    inicio = datetime.now()

    try:
        # Importa e executa o main() do script monitor
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "monitor_amonia_nitrito",
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "scripts", "monitor_amonia_nitrito.py"),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        exit_code = mod.main()

        duracao = (datetime.now() - inicio).total_seconds()
        resultado = {
            "status": "ok" if exit_code == 0 else "error",
            "exit_code": exit_code,
            "duracao_segundos": round(duracao, 2),
            "timestamp": datetime.now().isoformat(),
        }
        log.info("✅ Monitor concluído em %.1fs (exit %d)", duracao, exit_code)

    except Exception as exc:
        duracao = (datetime.now() - inicio).total_seconds()
        resultado = {
            "status": "exception",
            "error": str(exc),
            "duracao_segundos": round(duracao, 2),
            "timestamp": datetime.now().isoformat(),
        }
        log.error("❌ Erro no monitor: %s", exc, exc_info=True)

    finally:
        with _lock:
            estado["em_execucao"] = False
            estado["ultima_execucao"] = datetime.now().isoformat()
            estado["ultimo_resultado"] = resultado
            estado["total_execucoes"] += 1

    return resultado


# ── Endpoints HTTP ────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    """Health check para o Railway."""
    return jsonify({
        "status": "healthy",
        "service": "monitor-amonia-nitrito",
        "ultima_execucao": estado["ultima_execucao"],
        "total_execucoes": estado["total_execucoes"],
        "em_execucao": estado["em_execucao"],
        "proximo_horario": _proximo_horario(),
    })


@app.route("/run", methods=["POST"])
def run_manual():
    """Disparo manual do monitor (útil para testes e Railway webhook)."""
    log.info("🔧 Disparo manual via POST /run")
    resultado = executar_monitor()
    return jsonify(resultado), 200 if resultado["status"] == "ok" else 500


@app.route("/status")
def status():
    """Status detalhado do scheduler."""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "nome": job.name,
            "proximo_disparo": str(job.next_run_time) if job.next_run_time else None,
        })
    return jsonify({
        "scheduler_ativo": scheduler.running,
        "jobs": jobs,
        "estado": estado,
        "timezone": "America/Sao_Paulo",
    })


def _proximo_horario() -> str | None:
    """Retorna o próximo horário de execução agendado."""
    jobs = scheduler.get_jobs()
    if not jobs:
        return None
    proximos = [j.next_run_time for j in jobs if j.next_run_time]
    if not proximos:
        return None
    return str(min(proximos))


# ── Scheduler ─────────────────────────────────────────────────────────────────

scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")

# 06:00 BRT — antes do arraçoamento matinal
scheduler.add_job(
    executar_monitor,
    trigger=CronTrigger(hour=6, minute=0, timezone="America/Sao_Paulo"),
    id="monitor_manha",
    name="Monitor Amônia/Nitrito — Manhã (06h BRT)",
    max_instances=1,
    misfire_grace_time=300,  # 5 min de tolerância
)

# 14:00 BRT — após o arraçoamento da tarde
scheduler.add_job(
    executar_monitor,
    trigger=CronTrigger(hour=14, minute=0, timezone="America/Sao_Paulo"),
    id="monitor_tarde",
    name="Monitor Amônia/Nitrito — Tarde (14h BRT)",
    max_instances=1,
    misfire_grace_time=300,
)

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))

    log.info("=" * 60)
    log.info("RuralCaixa — Monitor Service")
    log.info("Timezone: America/Sao_Paulo")
    log.info("Agendamentos: 06:00 e 14:00 BRT")
    log.info("Porta HTTP: %d", port)
    log.info("=" * 60)

    scheduler.start()
    log.info("✅ Scheduler iniciado com %d job(s)", len(scheduler.get_jobs()))

    for job in scheduler.get_jobs():
        log.info("  📅 %s → próximo: %s", job.name, job.next_run_time)

    # Execução imediata na inicialização (opcional — útil para validar o deploy)
    if os.environ.get("RUN_ON_START", "0") == "1":
        log.info("🚀 RUN_ON_START=1 — executando monitor agora...")
        threading.Thread(target=executar_monitor, daemon=True).start()

    app.run(host="0.0.0.0", port=port, debug=False)
