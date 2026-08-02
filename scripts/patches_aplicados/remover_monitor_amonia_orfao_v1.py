"""
remover_monitor_amonia_orfao_v1.py

Achado em 02/08 (revisão do módulo piscicultura, sessão Claude, na sequência
do patch_amonia_nitrito_piscicultura_v1.py):

Existe um subsistema inteiro e paralelo para monitorar amônia/nitrito que
nunca foi de fato implantado e está morto:

  - scripts/monitor_amonia_nitrito.py
      Lê de piscicultura_leituras/piscicultura_ciclos -- tabelas que só
      existem em sql/schema_alertas.sql e que o sistema real (ciclos_
      piscicultura/registros_diarios_piscicultura) nunca alimenta.

  - scripts/enviar_alertas_whatsapp.py
      Usa o template Meta "alerta_piscicultura", que nunca foi aprovado
      (só "assinatura_contrato" está aprovado). Também referencia a coluna
      piscicultura_alertas.notificado_whatsapp, que nem está definida no
      schema_alertas.sql que o próprio script pressupõe.

  - sql/schema_alertas.sql
      Define uma tabela piscicultura_alertas com colunas (ciclo_id,
      leitura_id, parametro, valor, nivel...) TOTALMENTE incompatíveis com
      a tabela piscicultura_alertas REAL usada em produção pelo
      alerta_service.py (imovel_id, tipo_alerta, titulo, prioridade,
      status, hash_unicidade...) -- mesmo nome, schemas diferentes. Risco
      real de confusão/erro se alguém rodar este .sql pensando que está
      "configurando" o monitor.

  - monitor-service/ (Dockerfile, railway.toml, scheduler.py, requirements.txt)
      Serviço Railway dedicado, agendado 2x/dia (06h e 14h BRT) via
      APScheduler, que chama scripts/monitor_amonia_nitrito.py:main() --
      só que esse arquivo NÃO TEM função main() (só monitorar()). Toda
      execução cai em exceção silenciosa desde sempre. Não consta entre
      os serviços Railway conhecidos do projeto (backend/frontend).

  - docs/GUIA_IMPLEMENTACAO.md, docs/SETUP_POWERSHELL.md,
    docs/SETUP_WHATSAPP.md
      Documentam esse caminho abandonado, inclusive citando um workflow
      .github/workflows/alertas-cron.yml que nunca chegou a existir no
      repositório.

Motivo para apagar em vez de corrigir: o piscicultura_cron.py real (já em
produção, já rodando via app/main.py) passou a cobrir amônia/nitrito de
verdade a partir do patch_amonia_nitrito_piscicultura_v1.py (02/08) --
lendo a tabela certa (registros_diarios_piscicultura) e disparando alerta
via o alerta_service.py genérico, que já envia WhatsApp pelo canal
unificado que funciona. Manter os dois caminhos em paralelo só aumenta o
risco de alguém mexer no lugar errado.

USO:
    python3 remover_monitor_amonia_orfao_v1.py            # dry-run (lista o que seria apagado)
    python3 remover_monitor_amonia_orfao_v1.py --aplicar   # apaga de verdade (git rm)
"""

import subprocess
import sys
from pathlib import Path

ARQUIVOS = [
    "scripts/monitor_amonia_nitrito.py",
    "scripts/enviar_alertas_whatsapp.py",
    "sql/schema_alertas.sql",
    "monitor-service/scheduler.py",
    "monitor-service/Dockerfile",
    "monitor-service/railway.toml",
    "monitor-service/requirements.txt",
    "docs/GUIA_IMPLEMENTACAO.md",
    "docs/SETUP_POWERSHELL.md",
    "docs/SETUP_WHATSAPP.md",
]


def main():
    aplicar = "--aplicar" in sys.argv

    faltando = [a for a in ARQUIVOS if not Path(a).exists()]
    existentes = [a for a in ARQUIVOS if Path(a).exists()]

    print(f"Arquivos a remover ({len(existentes)}):")
    for a in existentes:
        print(f"  - {a}")
    if faltando:
        print(f"\nJá não existiam ({len(faltando)}), ignorando:")
        for a in faltando:
            print(f"  - {a}")

    if not aplicar:
        print("\n=== DRY RUN (nada removido) ===")
        return

    if not existentes:
        print("Nada para remover.")
        return

    resultado = subprocess.run(["git", "rm", "-r", "--"] + existentes, capture_output=True, text=True)
    print(resultado.stdout)
    if resultado.returncode != 0:
        print(resultado.stderr)
        sys.exit(1)

    # monitor-service pode ficar como diretório vazio se o git rm não limpar sozinho
    msdir = Path("monitor-service")
    if msdir.exists() and not any(msdir.iterdir()):
        msdir.rmdir()
        print("Diretório monitor-service/ (vazio) removido.")

    print("Removido. Revise com `git status` antes de commitar.")


if __name__ == "__main__":
    main()
