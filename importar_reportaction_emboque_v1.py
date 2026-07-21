"""
RuralCaixa — Importa dados reais do ReportAction.xls (rebanho Emboque, imovel_id=6)

Fonte: relatorio "Desempenho Produtivo / Vacas em Controle Leiteiro" do GISleite,
exportado como .xls binario real (nao HTML disfarcado).

Faz 3 coisas, todas idempotentes:
  1. Preenche o campo `nome` em bovino_animais SOMENTE onde esta NULL hoje
     (nao sobrescreve nome ja preenchido)
  2. Grava um registro por vaca em bovino_lactacoes (resumo da lactacao atual:
     parto, duracao, producao acumulada, pico) -- idempotente via
     UNIQUE(animal_id, data_parto)
  3. Grava um registro de ordenha do dia do controle (07/07/2026) em
     bovino_ordenha -- idempotente via indice unico parcial
     (animal_id, data) WHERE fonte='gisleite'

IMPORTANTE: todos os 15 animais abaixo sao mapeados pelo animal_id JA
CONFIRMADO em imovel_id=6 (nao o duplicado de teste em imovel_id=1, que
deve ser ignorado conforme instrucao do usuario).

Uso: DATABASE_URL="postgresql://..." python3 importar_reportaction_emboque_v1.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

IMOVEL_ID = 6

# animal_id ja confirmado em imovel_id=6 (diagnostico anterior), + dados extraidos do arquivo
REGISTROS = [
    # animal_id, brinco, nome, raca, data_parto, op, dl, pl_total, pico_kg, pico_data,
    # data_controle, ord1, ord2, ord3, total_controle
    (1184, '1905', 'Chita',            'GHL', '2026-03-31', 4, 98,  1803.0, 19.3, '2026-04-21', '2026-07-07', 11.0, 8.2,  0.0, 19.2),
    (1194, '2306', 'Amanda Amada',      'JSH', '2026-06-22', 1, 15,  264.2, 19.9, '2026-07-07', '2026-07-07', 11.1, 8.8,  0.0, 19.9),
    (1186, '2002', 'Jarrinha',         'GHL', '2026-03-08', 2, 121, 2312.7, 20.2, '2026-07-07', '2026-07-07', 12.1, 8.1,  0.0, 20.2),
    (1191, '2205', 'Joia Barba',       'GUL', '2026-06-19', 2, 18,  360.2, 21.8, '2026-07-07', '2026-07-07', 11.8, 10.1, 0.0, 21.8),
    (1193, '2207', 'Goiaba Veneza',    'GHL', '2026-01-28', 1, 160, 3456.6, 23.0, '2026-03-04', '2026-07-07', 13.4, 8.7,  0.0, 22.1),
    (1183, '1904', 'Chiquinha',        'GHL', '2026-03-01', 4, 128, 3193.4, 28.3, '2026-03-04', '2026-07-07', 14.2, 10.0, 0.0, 24.2),
    (1187, '2101', 'Vera Stephane',    'GHL', '2025-12-15', 1, 204, 4262.1, 24.2, '2026-07-07', '2026-07-07', 14.1, 10.2, 0.0, 24.2),
    (813,  '1903', 'Sayuri',           'GHL', '2026-02-03', 3, 154, 3429.2, 25.4, '2026-07-07', '2026-07-07', 15.1, 10.3, 0.0, 25.4),
    (1188, '2102', 'Fortuna Generosa', 'GHL', '2026-03-23', 2, 106, 2332.7, 25.8, '2026-07-07', '2026-07-07', 14.6, 11.2, 0.0, 25.8),
    (808,  '1801', 'Prima',            'GHL', '2026-07-03', 5, 4,   93.2,  26.0, '2026-07-07', '2026-07-07', 15.8, 10.2, 0.0, 26.0),
    (809,  '1802', 'Radclif',          'GHL', '2026-06-26', 4, 11,  262.5, 26.6, '2026-07-07', '2026-07-07', 14.6, 12.0, 0.0, 26.6),
    (1185, '2001', 'Veneza',           'GHL', '2026-01-30', 3, 158, 3760.0, 29.5, '2026-07-07', '2026-07-07', 16.5, 12.9, 0.0, 29.5),
    (810,  '1803', 'Colina',           'GHL', '2026-06-29', 3, 8,   212.7, 29.7, '2026-07-07', '2026-07-07', 17.6, 12.1, 0.0, 29.7),
    (1190, '2204', 'Luni Sara',        'GHL', '2026-05-05', 2, 63,  1742.4, 30.6, '2026-07-07', '2026-07-07', 18.2, 12.4, 0.0, 30.6),
    (1182, '1901', 'Safira',           'GHL', '2026-06-21', 4, 16,  478.4, 33.2, '2026-07-07', '2026-07-07', 18.2, 14.9, 0.0, 33.2),
]


def log(msg):
    print(f"  {msg}")


def run():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    print("=" * 70)
    print("1) Preenchendo nomes faltando (so onde nome esta NULL hoje)")
    print("=" * 70)
    atualizados = 0
    for animal_id, brinco, nome, raca, *_ in REGISTROS:
        cur.execute("""
            UPDATE bovino_animais SET nome = %s
            WHERE id = %s AND imovel_id = %s AND nome IS NULL
        """, (nome, animal_id, IMOVEL_ID))
        if cur.rowcount > 0:
            atualizados += 1
            log(f"animal_id={animal_id} (brinco {brinco}) -> nome='{nome}'")
    conn.commit()
    log(f"Total de nomes preenchidos: {atualizados}")

    print()
    print("=" * 70)
    print("2) Gravando bovino_lactacoes (resumo por parto)")
    print("=" * 70)
    criados_lac, duplicados_lac, erros_lac = 0, 0, 0
    for animal_id, brinco, nome, raca, data_parto, op, dl, pl, pico_kg, pico_data, *_ in REGISTROS:
        cur.execute("SAVEPOINT sp1")
        try:
            cur.execute("""
                INSERT INTO bovino_lactacoes
                    (imovel_id, animal_id, ordem_parto, data_parto,
                     duracao_lactacao_dias, producao_total_litros,
                     raca_registro, fonte, observacoes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'gisleite',%s)
            """, (
                IMOVEL_ID, animal_id, op, data_parto, dl, pl, raca,
                f"Pico de {pico_kg} kg em {pico_data}. Importado de relatorio GISleite (ReportAction.xls)."
            ))
            cur.execute("RELEASE SAVEPOINT sp1")
            criados_lac += 1
            log(f"animal_id={animal_id} (brinco {brinco}) -> lactacao {data_parto} OK")
        except psycopg2.errors.UniqueViolation:
            cur.execute("ROLLBACK TO SAVEPOINT sp1")
            duplicados_lac += 1
            log(f"animal_id={animal_id} (brinco {brinco}) -> ja existe lactacao nessa data, pulado")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp1")
            erros_lac += 1
            log(f"animal_id={animal_id} (brinco {brinco}) -> ERRO: {e}")
    conn.commit()
    log(f"lactacoes: {criados_lac} criadas, {duplicados_lac} duplicadas, {erros_lac} erros")

    print()
    print("=" * 70)
    print("3) Gravando bovino_ordenha (controle do dia, quando aplicavel)")
    print("=" * 70)
    criados_ord, duplicados_ord, erros_ord = 0, 0, 0
    for animal_id, brinco, nome, raca, data_parto, op, dl, pl, pico_kg, pico_data, data_controle, ord1, ord2, ord3, total in REGISTROS:
        num_ordenhas = sum(1 for o in (ord1, ord2, ord3) if o and o > 0)
        cur.execute("SAVEPOINT sp2")
        try:
            cur.execute("""
                INSERT INTO bovino_ordenha
                    (imovel_id, animal_id, data, turno, volume_l, numero_ordenhas_dia, fonte)
                VALUES (%s,%s,%s,'total',%s,%s,'gisleite')
            """, (IMOVEL_ID, animal_id, data_controle, total, num_ordenhas))
            cur.execute("RELEASE SAVEPOINT sp2")
            criados_ord += 1
            log(f"animal_id={animal_id} (brinco {brinco}) -> ordenha {data_controle} = {total}L OK")
        except psycopg2.errors.UniqueViolation:
            cur.execute("ROLLBACK TO SAVEPOINT sp2")
            duplicados_ord += 1
            log(f"animal_id={animal_id} (brinco {brinco}) -> ja existe ordenha gisleite nessa data, pulado")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp2")
            erros_ord += 1
            log(f"animal_id={animal_id} (brinco {brinco}) -> ERRO: {e}")
    conn.commit()
    log(f"ordenha: {criados_ord} criadas, {duplicados_ord} duplicadas, {erros_ord} erros")

    conn.close()
    print()
    print("Concluido.")


if __name__ == "__main__":
    run()
