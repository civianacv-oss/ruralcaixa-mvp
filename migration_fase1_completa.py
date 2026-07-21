"""
Migration completa: correcao de tipo + backfill de codigo_conta.
Roda tudo numa unica transacao, local (mais estavel que o console web do Railway).

COMO USAR:
1. Salve em C:\\ruralcaixa\\ruralcaixa-mvp\\
2. python migration_fase1_completa.py
3. O script mostra os resultados de conferencia ANTES de perguntar se pode commitar
4. Responda 's' pra confirmar o COMMIT, ou qualquer outra tecla para ROLLBACK
"""

import sys

try:
    import psycopg2
except ImportError:
    print("ERRO: psycopg2 nao esta instalado.")
    print("Rode primeiro: pip install psycopg2-binary")
    sys.exit(1)

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

# ---------------------------------------------------------------
# BLOCO 1: correcao de tipo (idempotente - seguro rodar de novo
# mesmo se ja tiver rodado parcialmente antes)
# ---------------------------------------------------------------
TIPO_CORRECAO_IDS = [
    '1863b00f-009d-4dd4-a514-85f4fa86b3f1',
    '2e844c3a-4cd5-435b-9588-c8afa9a47288',
    'e57499c9-861f-4793-b65b-79e85209d120',
    '35ffe0a6-4dc4-4933-a2b0-8a031791a99b',
    'fa93dfbd-3a3b-4ea0-a46e-1157b7ba39dd',
    '69921897-0623-4857-9738-a09306d27076',
    '16e67909-b85e-4eea-b0d4-9703c8da9fe4',
    '5ed3ffd7-0864-496f-a449-1ee67d937135',
    '2b4b4fbd-31e0-4cc0-b971-28aa4ae254aa',
    '0b4f1ed3-c0f7-45a1-8a6e-23980410fcee',
    '2a829341-e86d-47b4-b5cf-a60d997d28ed',
    '26b09133-6045-4ddc-8779-48a8363189c8',
    '8972a44c-d246-43b7-a344-09f5f511d198',
    'cd5861c8-fdfb-4078-89e7-181c16a7e1e4',
]

# ---------------------------------------------------------------
# BLOCO 2: backfill de codigo_conta (grupo -> lista de ids)
# ---------------------------------------------------------------
CODIGO_CONTA_MAP = {
    '3.1.3.1': [  # Racao/Alimentacao
        '2ed522fb-411b-43fc-96a3-321014a1e815','7c4e65c5-6a76-4810-b822-ff239c23c86e',
        '6bb04f6a-1042-4028-b2c9-4cd1c7d2f28e','98ce2690-c106-4029-8281-74d1d341dc30',
        'c430fff5-8277-4176-9c1b-3172b430f0db','6182b4fa-f311-45be-84c8-8811295664d0',
        'e88d321e-4404-43fc-99eb-be15dcc7c962','a5c3bc80-8054-4931-b570-fc6736ec5dac',
        '123b8461-5fda-4bfd-8b48-766a1b38aea7','e0649279-290d-4266-aa11-c8963ca8e4b4',
        'f4736ae8-fc00-4455-8dc2-29db8a4ed0e0','889964e3-c71c-4106-bd09-143833e18278',
        '3088c93a-90a2-4495-9301-482428f205d0','ae59312c-36ea-4aee-9f29-dc3b89c38e08',
        '2daf6a30-14f2-4c6f-8174-d5a3d51bfbbb','1dcc247b-4355-46eb-91be-612f568ba80b',
        'e5548f59-c9b4-47f8-86f9-6f9f83e033d7','22cebc7e-c193-4942-9004-abd49d0606e9',
        '0fd609f9-b39c-4fba-a37d-c9015f362844','bfc73863-710c-46e1-a0be-eb3a0dff4d74',
        'd237aa86-910e-414d-8f29-dca43dc94bd7','efa2205d-b269-4d54-95a9-631f60358bab',
        '16e67909-b85e-4eea-b0d4-9703c8da9fe4','5ed3ffd7-0864-496f-a449-1ee67d937135',
        '2b4b4fbd-31e0-4cc0-b971-28aa4ae254aa','0b4f1ed3-c0f7-45a1-8a6e-23980410fcee',
        '2a829341-e86d-47b4-b5cf-a60d997d28ed','26b09133-6045-4ddc-8779-48a8363189c8',
        '8972a44c-d246-43b7-a344-09f5f511d198','cd5861c8-fdfb-4078-89e7-181c16a7e1e4',
        'e55ef413-102d-467b-bfa5-0fb533a2ea82',  # Fos 80 (corrigido)
    ],
    '3.1.3.2': [  # Sanidade/Medicamentos
        'bc14deac-9ddd-43c0-9739-aeaba20448f8','b1b81762-2aed-44d2-9949-4ff64c8a05a9',
        'afa7fe96-e219-410f-afde-14f96892ea73','4e2b6686-6c41-411b-a7da-5f6ce0622bf7',
        '4f724a59-0873-4ac9-851d-f8d70ea132dc','4b3057b7-b93a-4c16-977d-05ce3342c80f',
        'b52054ad-9678-4365-84d3-cf176e53725c','930231ca-5dbd-47d2-8f25-7a98c627243a',
        '0485208a-8f1c-4d0b-9559-16a3e1c31db9','e1e18175-a149-4c9e-8377-4fb4ecd34791',
        '3b1308d9-5a48-42c3-886a-513beb08e1e2','907a6b82-89a8-4efb-b201-1f913238b6cf',
        '230f6019-fd8c-4744-8829-8ca4d96fc881','717789f5-bfac-4c22-a59c-f3fa22b2f067',
        '92e86485-f2de-4f50-8016-505f647d69ec','db55e51c-7bba-48a6-aff9-15c83587c72b',
        '3297a694-4bdb-467e-9f64-8152b384387e','d114664e-9470-4f10-ad9d-36a2f0eecc77',
        'd446c10e-3c20-4752-a5c6-cc4b1d194707','16b59444-4f8d-4b1d-a3bc-855feafc015c',
    ],
    '3.1.3.3': [  # Higiene de Ordenha
        '3450c0ee-ffdb-4fd5-aed7-01c12caf44a7','7fba3b74-5443-4168-a847-7bdc804cab7f',
        'df5b474a-e526-402e-b59d-a09bc970f622','b828ab10-2435-4f24-bc04-e95c2f1371f0',
        'eb941692-4a96-427f-bc82-fabc76916945','fdfbb16b-f4b8-4c2a-84c4-84aeb059b12d',
        'd3ed7d3f-2161-4472-b6c6-71499a02a3da','efd00938-cb61-45e4-bd85-1f36fa401107',
        '362a776b-c8f4-4d82-8168-3123d84d451a','30bd7942-7950-433a-aa96-be4f7259821a',
        '9b94b3aa-aa4d-4717-9a5e-29e17cb28f39','f087372b-770f-4436-a0fa-f1de6d0895ac',
    ],
    '3.1.4.1': [  # Combustivel/Manutencao Maquinas
        'a51f71aa-013e-4e6b-afea-d4ed0169582d','f9f18097-f8c6-403e-9927-2b63c1c8a67d',
        'f9ec56cc-c9ee-449f-b3e9-685a75fbc79c','093d8b5f-643b-4640-83ed-b7fc1e53453a',
        '2f463a02-3d8a-4580-9300-b90f86c4a07a','d6cbef0c-e720-4901-9156-42fe709bb430',
        'eea7f46e-356f-4dce-8e8c-16e97b1b4adc','404c4ae4-9eb1-40c6-83e2-9d0b919bfd01',
        'af6c304b-ef76-4fa4-87f1-b2b5c03f0e65','17cf099f-33fe-45ad-b501-be3c05f15fda',
        'c3f595ba-c729-4e78-b396-25fe570323a7','41ab0cc9-4c79-41c7-9bc9-1ba4ac284049',
        'e7cb9e36-2412-4c6a-bd7d-dd2f1db49ca9','171d269d-fcee-4f91-b1c4-32f1ed2d54ed',
        '57ac3f60-a0e0-44c9-b6a0-d9fe0eac246a','2f78ad2a-2cc0-4387-87b4-935eb3ca535d',
        'd9668cf7-d3a1-4246-8bd0-ada1a0fd9322','118e1283-607a-4546-87b7-1bfc6dd7f3d0',
        '1863b00f-009d-4dd4-a514-85f4fa86b3f1','2e844c3a-4cd5-435b-9588-c8afa9a47288',
    ],
    '3.1.5.1': [  # Defensivos/Herbicidas
        '0b3f81ae-d4e5-4581-aa86-f2dd53eba233','76d17f64-c476-4c8e-b065-4a42da5d842f',
        '2e9ccf72-8415-4a86-b1e9-a093c3c0947f','69921897-0623-4857-9738-a09306d27076',
    ],
    '3.1.5.2': [  # Insumos Agricolas
        'd34560fb-dc4e-4527-abd5-9c5aed490a21','b898e927-4db7-4c2a-89ae-c0ec1eba5287',
        'f490e1ef-184e-4a80-8762-85ee75402535','471139b1-eb97-4364-8de7-9a1f9fe4dc0e',
        '4b55379c-f7f4-4f69-b802-e367457a23c9','1b110ad1-3dc3-4b45-bf8e-efd6e41fcabe',
        'e2a616d3-0da2-4223-8cfa-f57b8eef55b0','e57499c9-861f-4793-b65b-79e85209d120',
    ],
    '3.1.6.1': [  # Mao de Obra
        '0be75052-ac9b-4b37-a7b4-b1eb39a8d1e8','66e4a5de-3025-4637-9be4-c1d0eacb2d73',
        'e07b6e0b-52b2-4eac-8de3-3c54dfc8f561','15e0e502-b18c-4d47-b5b2-ab2d16865f71',
    ],
    '3.1.7.1': [  # Financeiro
        '1896e57f-768c-4d35-9789-9abc47c8cc46','04fa3f84-8131-4b18-be00-c5e613d4792f',
        'dfef1865-eea0-4e2a-9585-f8ad7109a4e6','3540d704-8ea5-4082-b570-06be2b59d955',
        '3bf664e8-032d-4e91-bbf6-c63bbc97854b','e598c4aa-8e60-4d13-bb80-29bf680e4be8',
        '97b5f3a5-dfe4-417d-ae24-bd57889d3b5c','6f674e22-9845-4901-b287-000081c671c2',
        'ed022019-321a-4d28-8cdc-0a5ebcab9b1a','746d3129-309d-4dc2-a91d-697d0ec1f572',
        'b88ffe3b-182d-4517-97e6-e69e8a633761',
    ],
    '3.1.8.1': [  # Materiais Gerais
        '0173b4ae-825a-47e4-9062-714ce3326356','d1cf236e-b0bd-4ef2-b967-8498302545c2',
        '08644ea1-9ffd-42d9-a4d8-95ce615dbbce','6f30549a-2a8e-4873-be49-537a31923962',
        '6266291f-f5ba-461c-bc9d-567979c15571','1d80b3d1-0c52-4fc7-a184-f17e7ba21475',
        '55ef5e11-d3a1-46b5-aa1b-335de07507e3','8e1c8dfa-b514-48b0-b8cc-25f90daf00d1',
        '51d224d4-a48a-4e1e-99aa-d90a0f80c067','3316e9b5-7c3b-49bb-a4b6-dd52940f1548',
        'fa93dfbd-3a3b-4ea0-a46e-1157b7ba39dd','35ffe0a6-4dc4-4933-a2b0-8a031791a99b',
    ],
    '3.1.9.1': [  # Arrendamento
        'd8079501-0b3d-4659-bd19-c4cfa677d6ca',
    ],
    '2.1.1': [  # Investimento
        '456d01f4-e0b9-48e4-8b71-5ab8021fb50f','4a392d28-1823-44ed-8866-c8b95e2ab29f',
        'b135a274-2796-4bf7-8807-e49840df7a50','afaa1098-8292-4975-8231-f64eb4e482a8',
        '9db7047d-1cfe-4e3a-b104-36369d660bb6','5509c3c8-4621-43cc-8eec-7effed8903f5',
        '3c2f592d-b47f-4da3-9067-0b2139c20802',
    ],
    '4.1.1': [  # Receita
        'fc881d7c-c925-4c1b-b2e9-ff548de0a24c','f9e4f62d-221a-46bb-85f2-4694d03e31ff',
        '9f0e36a6-91f2-47e5-bef7-f0718966725e','02f4474c-b300-45ae-b30f-956115821b3d',
        '351b2a12-99b3-40ae-9f2c-00abaae62afd','59b4ad42-b9b6-498f-81bc-a786f47f6c80',
        '37bd4a07-ed6f-4009-a1fc-d41fe070b7c3','3dbaf15f-3983-4e05-8d83-241d5288bc2a',
        '92519c80-e311-4215-9684-15268c1fcf93','31352db1-bfa5-460e-a7cb-c248814d1c8d',
        '93f28dea-0242-462c-a4ef-65eed3478815','fb8fb6e8-f158-4ef3-b695-cf9bf604e1e8',
        '7b8051f9-63b2-4f9d-92ab-c42db66993d5','adf548e1-df96-4804-96e6-c19fc116805f',
        '5b0905f0-3f6a-4bd3-a4c7-89f8b7c39902',
    ],
    '3.1.99': [  # Outros/Generico (pendente)
        'eddc7ef5-bc9b-4a87-ad36-d2c3d0b21eb8','c1283fb6-0e2b-4698-92f6-e8a37358abe5',
        '6923143d-0a4b-4abf-9598-6d9636f9ef13','e4628672-11bf-44ab-8f6f-9930a9be421b',
    ],
}


def main():
    print("Conectando ao Postgres (Railway)...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("\n[1/3] Corrigindo tipo (14 itens RECEITA/INVESTIMENTO -> DESPESA)...")
        cur.execute(
            "UPDATE subcontas SET tipo = 'DESPESA' WHERE id = ANY(%s)",
            (TIPO_CORRECAO_IDS,)
        )
        print(f"   Linhas afetadas: {cur.rowcount}")

        print("\n[2/3] Adicionando coluna codigo_conta (se nao existir)...")
        cur.execute("ALTER TABLE subcontas ADD COLUMN IF NOT EXISTS codigo_conta VARCHAR(20)")

        print("\n[3/3] Backfill de codigo_conta por grupo...")
        total_atualizado = 0
        for codigo, ids in CODIGO_CONTA_MAP.items():
            cur.execute(
                "UPDATE subcontas SET codigo_conta = %s WHERE id = ANY(%s)",
                (codigo, ids)
            )
            print(f"   {codigo}: {cur.rowcount} linhas")
            total_atualizado += cur.rowcount

        print(f"\nTotal atualizado com codigo_conta: {total_atualizado}")

        # Conferencia 1: tipo
        cur.execute(
            "SELECT COUNT(*) FROM subcontas WHERE tipo = 'DESPESA' AND id = ANY(%s)",
            (TIPO_CORRECAO_IDS,)
        )
        tipo_ok = cur.fetchone()[0]
        print(f"\nConferencia tipo (esperado 14): {tipo_ok}")

        # Conferencia 2: quem ficou sem codigo_conta
        cur.execute("SELECT id, nome, tipo, atividade_tipo FROM subcontas WHERE codigo_conta IS NULL")
        sem_codigo = cur.fetchall()
        print(f"\nSubcontas SEM codigo_conta (esperado: so as 2 de CONTRATO/CONDOMINIO):")
        for row in sem_codigo:
            print(f"   {row}")

        # Conferencia 3: distribuicao geral de tipo
        cur.execute("SELECT tipo, COUNT(*) FROM subcontas GROUP BY tipo ORDER BY tipo")
        print("\nDistribuicao geral de tipo:")
        for tipo, count in cur.fetchall():
            print(f"   {tipo}: {count}")

        print("\n" + "="*60)
        if tipo_ok == 14 and len(sem_codigo) == 2:
            print("TUDO CONFERE. Pronto para commitar.")
        else:
            print("ATENCAO: os numeros nao batem com o esperado!")
            print(f"  tipo_ok deveria ser 14, veio {tipo_ok}")
            print(f"  sem_codigo deveria ter 2 linhas, veio {len(sem_codigo)}")
        print("="*60)

        resposta = input("\nDigite 's' para COMMIT, ou qualquer outra tecla para ROLLBACK: ")
        if resposta.strip().lower() == 's':
            conn.commit()
            print("\n✅ COMMIT realizado com sucesso!")
        else:
            conn.rollback()
            print("\n⏪ ROLLBACK realizado. Nenhuma alteracao foi salva.")

    except Exception as e:
        conn.rollback()
        print(f"\nERRO: {e}")
        print("ROLLBACK automatico realizado.")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
