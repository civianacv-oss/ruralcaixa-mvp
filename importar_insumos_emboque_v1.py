"""
RuralCaixa — Importa catalogo de insumos da Fazenda Emboque (fazenda_id=6)

Fonte: "Relacao Patrimonial de Estoque" gerada pelo proprio Ubiratan
(Insumos_Bira.xlsx, periodo 01/07-31/07/2026, 30 ativos, R$ 25.820,84).

Decisoes combinadas com o usuario:
- NPK: usa a posicao FINAL (9.000 kg), mais atual que a inicial (4.000)
- "Utensilos geral": custo medio veio NEGATIVO na origem (-R$163,51) --
  importado com custo zerado e observacao pra revisar
- "Combustivel": estoque veio negativo (-0,71 L) -- importado como esta,
  vai aparecer como alerta critico no painel (comportamento padrao)

Idempotente: se ja existir insumo ativo com o mesmo nome na fazenda 6,
pula (nao duplica nem sobrescreve).

Uso: DATABASE_URL="postgresql://..." python3 importar_insumos_emboque_v1.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

FAZENDA_ID = 6

# (nome, unidade, categoria, estoque_atual, custo_medio, preco_estimado, descricao_extra)
INSUMOS = [
    ("Calcario - agrosilicio",                                  "ton", "agricola",    0.0,    None,   200.0,  None),
    ("Cama de Vacas",                                           "ton", "outros",      0.0,    None,   40.0,   None),
    ("Combustível Diesel e GASO",                               "l",   "combustivel", -0.71,  5.95,   5.95,   "Estoque veio negativo na relacao patrimonial de origem."),
    ("Cria de Bezerras - custos gerais",                        "un",  "outros",      0.0,    None,   43.0,   None),
    ("Defensivos agriculas",                                    "un",  "agricola",    0.0,    None,   908.0,  None),
    ("Farelo de Soja",                                          "kg",  "racao",       0.0,    None,   2.52,   None),
    ("Farmácia Antibióticos",                                   "un",  "medicamento", 0.0,    None,   None,   None),
    ("Farmácia - Antinflamatorio",                              "un",  "medicamento", 0.0,    None,   83.0,   None),
    ("Farmácia - Sanidade",                                     "un",  "medicamento", 49.0,   31.52,  90.29,  None),
    ("Limpeza - Tanque e ordenha",                              "un",  "outros",      1.0,    67.49,  67.49,  None),
    ("Lubrificantes",                                           "l",   "combustivel", 13.0,   28.01,  18.23,  None),
    ("Manutenção Ordenha - Peças",                              "un",  "outros",      0.0,    None,   32.32,  None),
    ("Materias ordenha - Pre, Pos, Oci, Papel Toalha",          "un",  "outros",      28.0,   68.74,  11.25,  None),
    ("Milho - fuba",                                            "kg",  "racao",       825.0,  1.64,   1.60,   None),
    ("NPK",                                                     "kg",  "agricola",    9000.0, 3.80,   4.00,   "Posicao final do periodo (inicial era 4.000 kg)."),
    ("Nutrição - Mineiras Fos 90 Leite",                        "un",  "racao",       0.92,   144.98, 144.98, None),
    ("Nutrição - Mineral Fos 80",                               "un",  "racao",       1.0,    133.32, 133.32, None),
    ("Nutrição - Nucleo - Ração acima 90 dias",                 "un",  "racao",       0.0,    None,   None,   None),
    ("Nutrição Nucleo Vacas",                                   "kg",  "racao",       138.0,  3.35,   3.35,   None),
    ("Nutrição - Ração Peletizada e Sucedâneo - Bzra 90 dias",  "un",  "racao",       3.0,    106.67, 88.24,  None),
    ("Pasto Verão",                                             "ha",  "agricola",    0.0,    None,   None,   None),
    ("Recarga Nitrogeneo",                                      "un",  "reproducao",  1.0,    180.0,  180.0,  None),
    ("Semem corte",                                             "un",  "reproducao",  0.0,    None,   None,   None),
    ("Semem Holandes",                                          "un",  "reproducao",  0.0,    None,   None,   None),
    ("Sementes",                                                "kg",  "agricola",    80.0,   23.10,  23.10,  None),
    ("Sementes Milheto",                                        "kg",  "agricola",    100.0,  3.90,   3.90,   None),
    ("Silagem - materiais e insumos",                           "un",  "racao",       5.0,    487.94, 1025.0, None),
    ("Sucedâneo",                                               "un",  "racao",       16.0,   119.44, 116.59, None),
    ("Ureia - ração",                                           "kg",  "racao",       50.0,   3.48,   3.48,   None),
    ("Utensilos geral - prego, grampo,arame",                   "un",  "outros",      16.0,   None,   29.0,   "Custo medio veio NEGATIVO na origem (-R$163,51) -- zerado na importacao, revisar historico."),
]


def run():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    criados, pulados, erros = 0, 0, 0
    for nome, unidade, categoria, estoque, custo_medio, preco, obs in INSUMOS:
        cur.execute("SAVEPOINT sp1")
        try:
            cur.execute("""
                SELECT id FROM insumos
                WHERE fazenda_id = %s AND LOWER(TRIM(nome)) = LOWER(TRIM(%s)) AND ativo = TRUE
            """, (FAZENDA_ID, nome))
            if cur.fetchone():
                cur.execute("RELEASE SAVEPOINT sp1")
                pulados += 1
                print(f"  [pulado]  {nome} (ja existe)")
                continue

            descricao = "Importado da Relacao Patrimonial de Estoque (Insumos_Bira.xlsx, jul/2026)."
            if obs:
                descricao += f" {obs}"

            cur.execute("""
                INSERT INTO insumos
                    (fazenda_id, nome, descricao, categoria, unidade, origem,
                     estoque_atual, estoque_minimo, estoque_ideal, preco_estimado, custo_medio)
                VALUES (%s,%s,%s,%s,%s,'compra',%s,0,0,%s,%s)
            """, (FAZENDA_ID, nome, descricao, categoria, unidade, estoque, preco, custo_medio))
            cur.execute("RELEASE SAVEPOINT sp1")
            criados += 1
            print(f"  [OK]      {nome} — estoque {estoque:g} {unidade}")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp1")
            erros += 1
            print(f"  [ERRO]    {nome}: {e}")

    conn.commit()
    conn.close()
    print()
    print(f"Concluido: {criados} criados, {pulados} pulados, {erros} erros (de {len(INSUMOS)}).")


if __name__ == "__main__":
    run()
