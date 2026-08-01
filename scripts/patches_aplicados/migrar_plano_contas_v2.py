# -*- coding: utf-8 -*-
"""
MIGRAÇÃO DO PLANO DE CONTAS — v2 (FINAL)
Combina:
  (a) migração em bloco por código para os casos já limpos/consistentes
      (ex.: 3.1.3.1, 3.1.3.1.1, 4.1.2, e as 14 contas oficiais antigas)
  (b) reclassificação linha a linha (codigo_conta + nome exato) para os
      códigos-gaveta que misturavam assuntos diferentes (2.1.1, 3.1.4.1,
      3.1.5.1, 3.1.5.2, 3.1.6.1, 3.1.7.1, 3.1.8.1, 3.1.9.1, 4.1.1)
  (c) correção do campo `tipo` onde a decisão do usuário exigiu
      ("Maquinas e Equipamentos" DESPESA -> INVESTIMENTO)
  (d) sincronização completa da tabela plano_contas com o plano novo,
      incluindo a conta-sentinela 9.9 PENDENTE DE CLASSIFICAÇÃO

PRÉ-REQUISITOS:
  1. Já rodamos diagnostico_plano_contas_v1.py e diagnostico_complementar_v1.py
  2. FAZER BACKUP DO BANCO (pg_dump) antes de rodar com --aplicar
  3. Revisar a planilha reclassificacao_subcontas_v2.xlsx, aba "Pendências"
     (7 itens caem propositalmente em 9.9 PENDENTE DE CLASSIFICAÇÃO —
     isso é esperado, não é erro)

Rodar localmente:
    python3 migrar_plano_contas_v2.py            # dry-run (não grava nada)
    python3 migrar_plano_contas_v2.py --aplicar   # aplica de verdade
"""
import sys
import psycopg2

CONN_STR = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

# ─── (a) Migração em bloco por código — casos já consistentes ──────────────
DE_PARA_BLOCO = [
    ("1.1",       "1.1",     "Receita da atividade rural (oficial) -- mantém código, mas revisar lançamentos p/ detalhar depois"),
    ("1.1.1",     "1.1.1",   "Venda de produtos agrícolas (oficial) -- mesmo código, descrição já bate"),
    ("1.1.2",     "1.2",     "Venda de produtos pecuários (oficial) -> Receita da Produção Pecuária (agregado)"),
    ("1.1.3",     "1.4.3",   "Receita de arrendamento rural (oficial) -> Arrendamento rural recebido"),
    ("3.1.1",     "2.1",     "Custeio agrícola (oficial) -> Produção Agrícola (agregado)"),
    ("3.1.2",     "2.3",     "Combustíveis e lubrificantes (oficial) -> agregado"),
    ("3.1.3",     "2.2",     "Despesas com pecuária (oficial) -> Produção Pecuária (agregado)"),
    ("3.1.3.1",   "2.2.1.2", "Ração (bovino leite) -- já granular, só troca o código"),
    ("3.1.3.1.1", "2.2.1.2.1", "Ração/concentrado de lactação -- usado no IOFC, migrar com cuidado"),
    ("3.1.3.2",   "2.2.2.2", "Veterinário -- já granular, só troca o código"),
    ("3.1.3.3",   "2.2.4.1", "Higiene de ordenha -- já granular, só troca o código"),
    ("3.1.4",     "2.5",     "Mão de obra e encargos (oficial) -> agregado"),
    ("3.1.5",     "2.4.1",   "Manutenção de máquinas (oficial)"),
    ("3.1.6",     "2.2.7",   "Energia elétrica rural (oficial) -> Energia e água da produção"),
    ("3.1.7",     "2.6.6",   "Arrendamentos pagos (oficial) -> Arrendamento e parceria pagos"),
    ("3.1.99",    "2.6.5",   "Outros (código solto da IA) -> Outras despesas não classificadas"),
    ("1.2",       "1.4.2",   "Serviço prestado (código solto da IA) -> Prestação de serviços agrícolas"),
    ("3.9",       "2.6.5",   "Outros (código solto da IA) -> Outras despesas não classificadas"),
    ("4.1.2",     "1.3.1",   "Venda de Leite -- já é uma conta limpa, só troca o código"),
    ("5.1",       "3.1",     "Aquisição de máquinas (oficial)"),
    ("5.2",       "3.3",     "Obras e benfeitorias (oficial) -> Instalações e benfeitorias (agregado)"),
    ("5.3",       "3.5.3",   "Aquisição de animais (oficial) -> Animais para formação de plantel"),
]

# ─── (b) Reclassificação linha a linha (codigo_conta + nome exato) ─────────
# Importado do arquivo de decisões revisado com o usuário em 25/07
from dados_v2 import RECLASSIFICACAO, PLANO_DETALHADO_V2_NOVAS_CONTAS

# ─── (c) Correções de campo `tipo` (além do código) ────────────────────────
CORRECOES_TIPO = [
    # (codigo_atual, nome, tipo_novo)
    ("2.1.1", "Maquinas e Equipamentos", "INVESTIMENTO"),
]

# ─── (d) Plano de contas completo (91 originais + 7 novas) ─────────────────
from dados_original import PLANO_DETALHADO as PLANO_ORIGINAL_91
PLANO_CONTAS_FINAL = PLANO_ORIGINAL_91 + PLANO_DETALHADO_V2_NOVAS_CONTAS


def migrar_bloco(conn, aplicar):
    cur = conn.cursor()
    print("=" * 74)
    print("(a) MIGRAÇÃO EM BLOCO — códigos já consistentes")
    print("=" * 74)
    for cod_atual, cod_novo, desc in DE_PARA_BLOCO:
        cur.execute("SELECT COUNT(*) FROM subcontas WHERE codigo_conta = %s", (cod_atual,))
        qtd = cur.fetchone()[0]
        if qtd == 0:
            print(f"  {cod_atual:12s} -> {cod_novo:12s} | nada a fazer (0 subcontas)")
            continue
        if aplicar:
            cur.execute("UPDATE subcontas SET codigo_conta = %s WHERE codigo_conta = %s", (cod_novo, cod_atual))
            conn.commit()
            status = "APLICADO"
        else:
            status = "DRY-RUN"
        print(f"  {cod_atual:12s} -> {cod_novo:12s} | {qtd:4d} subconta(s) | {desc} | {status}")
    cur.close()


def migrar_linha_a_linha(conn, aplicar):
    cur = conn.cursor()
    print()
    print("=" * 74)
    print("(b) RECLASSIFICAÇÃO LINHA A LINHA — códigos-gaveta")
    print("=" * 74)
    aplicadas, nao_encontradas = 0, 0
    for cod_atual, nome, tipo, cod_novo, confianca, obs in RECLASSIFICACAO:
        cur.execute(
            "SELECT COUNT(*) FROM subcontas WHERE codigo_conta = %s AND nome = %s",
            (cod_atual, nome),
        )
        qtd = cur.fetchone()[0]
        if qtd == 0:
            print(f"  [{cod_atual}] {nome!r:55s} -> NÃO ENCONTRADA (verificar nome exato)")
            nao_encontradas += 1
            continue
        marcador = "-> 9.9 (pendente, aguardando você)" if cod_novo == "9.9" else f"-> {cod_novo}"
        if aplicar:
            cur.execute(
                "UPDATE subcontas SET codigo_conta = %s WHERE codigo_conta = %s AND nome = %s",
                (cod_novo, cod_atual, nome),
            )
            conn.commit()
            status = "APLICADO"
        else:
            status = "DRY-RUN"
        print(f"  [{cod_atual}] {nome!r:55s} {marcador:38s} | {confianca:20s} | {status}")
        aplicadas += 1
    print()
    print(f"Total reclassificado: {aplicadas} | não encontradas: {nao_encontradas}")
    cur.close()


def aplicar_correcoes_tipo(conn, aplicar):
    cur = conn.cursor()
    print()
    print("=" * 74)
    print("(c) CORREÇÕES DE CAMPO `tipo`")
    print("=" * 74)
    for cod_atual, nome, tipo_novo in CORRECOES_TIPO:
        if aplicar:
            cur.execute(
                "UPDATE subcontas SET tipo = %s WHERE nome = %s",
                (tipo_novo, nome),
            )
            conn.commit()
            status = "APLICADO"
        else:
            status = "DRY-RUN"
        print(f"  {nome!r} -> tipo = {tipo_novo} | {status}")
    cur.close()


def sincronizar_plano_contas(conn, aplicar):
    cur = conn.cursor()
    print()
    print("=" * 74)
    print(f"(d) SINCRONIZAÇÃO plano_contas ({len(PLANO_CONTAS_FINAL)} contas)")
    print("=" * 74)
    if not aplicar:
        print(f"DRY-RUN: {len(PLANO_CONTAS_FINAL)} contas seriam inseridas/atualizadas (upsert por código).")
        cur.close()
        return
    for codigo, descricao, tipo, dedutivel, _obs in PLANO_CONTAS_FINAL:
        ded_bool = str(dedutivel).strip().lower() in ("sim", "true", "1")
        cur.execute(
            """
            INSERT INTO plano_contas (codigo, descricao, tipo, dedutivel)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (codigo) DO UPDATE
                SET descricao = EXCLUDED.descricao,
                    tipo = EXCLUDED.tipo,
                    dedutivel = EXCLUDED.dedutivel
            """,
            (codigo, descricao, tipo, ded_bool),
        )
        conn.commit()
    print(f"✓ {len(PLANO_CONTAS_FINAL)} contas sincronizadas.")
    cur.close()


def verificar_constraint_codigo(conn):
    """Confirma que plano_contas.codigo tem UNIQUE/PK antes de tentar ON CONFLICT (codigo)."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT conname, contype
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'plano_contas'::regclass
          AND a.attname = 'codigo'
          AND c.contype IN ('u', 'p')
        """
    )
    rows = cur.fetchall()
    cur.close()
    return rows


def main():
    aplicar = "--aplicar" in sys.argv
    if not aplicar:
        print(">>> MODO DRY-RUN — nada será gravado. Rode com --aplicar para executar de verdade.\n")
    else:
        print(">>> MODO APLICAR — as mudanças serão gravadas no banco.\n")
        confirm = input("Confirma backup (pg_dump) feito e planilha revisada? [digite SIM]: ")
        if confirm.strip().upper() != "SIM":
            print("Cancelado.")
            return

    conn = psycopg2.connect(CONN_STR)
    try:
        constraint = verificar_constraint_codigo(conn)
        pular_sync = False
        if not constraint:
            pular_sync = True
            print("⚠ plano_contas.codigo NÃO tem UNIQUE/PRIMARY KEY — o passo (d) usa ON CONFLICT (codigo)")
            print("  e vai falhar sem essa constraint. Rode isto uma vez antes de tentar de novo:")
            print("    ALTER TABLE plano_contas ADD CONSTRAINT plano_contas_codigo_key UNIQUE (codigo);")
            print("  Pulando o passo (d) nesta execução; (a), (b) e (c) seguem normalmente.\n")
        else:
            print(f"✓ plano_contas.codigo tem constraint: {constraint[0][0]} ({constraint[0][1]})\n")

        migrar_bloco(conn, aplicar)
        migrar_linha_a_linha(conn, aplicar)
        aplicar_correcoes_tipo(conn, aplicar)
        if not pular_sync:
            sincronizar_plano_contas(conn, aplicar)
    finally:
        conn.close()

    print()
    print("Concluído.")
    print("Lembrete: 7 subcontas foram propositalmente enviadas para 9.9 PENDENTE DE")
    print("CLASSIFICAÇÃO (ver aba 'Pendências' da planilha) — revisar o lançamento")
    print("original de cada uma antes de decidir o código definitivo.")


if __name__ == "__main__":
    main()
