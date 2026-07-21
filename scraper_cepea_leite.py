import sys
from datetime import date

try:
    import requests
    import pandas as pd
    import psycopg2
except ImportError as e:
    print(f"ERRO: falta instalar dependencia: {e}")
    print("Rode: pip install requests pandas lxml psycopg2-binary --break-system-packages")
    sys.exit(1)

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
URL = "https://cepea.org.br/br/indicador/leite.aspx"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

MESES_PT = {
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
}


def parse_mes_ano(texto):
    mes_str, ano_str = texto.strip().lower().split("/")
    mes = MESES_PT[mes_str]
    ano = 2000 + int(ano_str)
    return date(ano, mes, 1)


def buscar_tabela_leite():
    print(f"Baixando pagina: {URL}")
    resp = requests.get(URL, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    print(f"  OK (status {resp.status_code}, {len(resp.text)} bytes)")

    tabelas = pd.read_html(resp.text, decimal=",", thousands=".")
    print(f"  {len(tabelas)} tabela(s) encontrada(s) na pagina")

    for t in tabelas:
        if t.shape[1] == 3:
            col_estado = t.iloc[:, 1].astype(str)
            if col_estado.str.upper().str.contains("BRASIL").any():
                return t

    raise RuntimeError(
        "Nao encontrei a tabela esperada (3 colunas com linha 'BRASIL'). "
        "O layout da pagina do CEPEA pode ter mudado - revisar manualmente."
    )


def main():
    tabela = buscar_tabela_leite()

    linhas_brasil = tabela[tabela.iloc[:, 1].astype(str).str.strip().str.upper() == "BRASIL"]
    print(f"\n{len(linhas_brasil)} registros 'BRASIL' encontrados:")

    registros = []
    for _, row in linhas_brasil.iterrows():
        try:
            mes_ano = parse_mes_ano(str(row.iloc[0]))
            preco = float(row.iloc[2])
            registros.append((mes_ano, preco))
            print(f"  {mes_ano} -> R$ {preco:.4f}/litro")
        except Exception as e:
            print(f"  AVISO: nao consegui processar linha {row.tolist()}: {e}")

    if not registros:
        print("\nNenhum registro valido encontrado. Abortando sem tocar no banco.")
        return

    print(f"\nConectando ao banco para salvar {len(registros)} registro(s)...")
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
    conn.autocommit = True
    cur = conn.cursor()

    for mes_ano, preco in registros:
        cur.execute("""
            INSERT INTO cotacoes_mercado (produto, data_referencia, valor, unidade, fonte)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (produto, data_referencia)
            DO UPDATE SET valor = EXCLUDED.valor, criado_em = now();
        """, ("leite_litro_brasil", mes_ano, preco, "R$/litro", "CEPEA"))

    cur.close()
    conn.close()
    print("\nConcluido! Cotacoes de leite salvas/atualizadas em cotacoes_mercado.")


if __name__ == "__main__":
    main()