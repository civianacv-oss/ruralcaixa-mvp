"""
patch_amonia_nitrito_piscicultura_v1.py

Bug encontrado em 02/08 (revisão do módulo piscicultura, sessão Claude):

O painel (frontend/app/piscicultura/page.tsx) já envia amonia_mg_l e
nitrito_mg_l ao registrar o dia, e o cron de alertas
(app/services/piscicultura_cron.py) já lê essas duas colunas do banco
para gerar o alerta "amonia_alta" (limite NH3 > 0.5 mg/L, NO2 > 0.2 mg/L).

Só que o schema Pydantic (RegistroDiarioCreate/Response, em
app/schemas_piscicultura.py) nunca declarou esses dois campos. Como o
FastAPI/Pydantic ignora silenciosamente qualquer campo não declarado no
schema, tudo que o painel manda em amonia_mg_l/nitrito_mg_l é descartado
antes de chegar no INSERT -- as colunas ficam sempre NULL e o alerta do
cron nunca dispara. O bot (WhatsApp/Telegram) também nunca extraía esses
valores, então nem essa via alimentava a coluna.

Este patch corrige as 4 pontas:
  1. schemas_piscicultura.py -- declara os campos em Create e Response
  2. routers/piscicultura.py -- _gerar_alertas_agua() passa a alertar
     também sobre amônia/nitrito (mesmos limiares do cron)
  3. routers/piscicultura.py -- registrar_dia() grava as duas colunas
     no INSERT/UPDATE (painel)
  4. routers/piscicultura.py -- webhook_whatsapp_piscicultura() grava
     as duas colunas quando vierem do bot (diretriz: todo recurso novo
     em ambos os canais)
  5. services/piscicultura_ia.py -- prompt da IA passa a extrair
     amonia_mg_l/nitrito_mg_l também via bot

USO:
    python3 patch_amonia_nitrito_piscicultura_v1.py            # dry-run
    python3 patch_amonia_nitrito_piscicultura_v1.py --aplicar  # grava
"""

import sys
import shutil
from pathlib import Path

# ── Arquivo 1: schemas_piscicultura.py ──────────────────────────────────────

ARQ_SCHEMA = Path("app/schemas_piscicultura.py")
BAK_SCHEMA = Path("app/schemas_piscicultura.py.bak_amonia_nitrito_v1")

SCHEMA_CREATE_ANTIGO = """    transparencia_secchi_cm: Optional[int] = Field(None, ge=0, le=500)


class RegistroDiarioResponse(BaseModel):"""

SCHEMA_CREATE_NOVO = """    transparencia_secchi_cm: Optional[int] = Field(None, ge=0, le=500)
    amonia_mg_l: Optional[Decimal] = Field(None, ge=0, le=50)
    nitrito_mg_l: Optional[Decimal] = Field(None, ge=0, le=50)


class RegistroDiarioResponse(BaseModel):"""

SCHEMA_RESPONSE_ANTIGO = """    transparencia_secchi_cm: Optional[int]
    alertas: Optional[str]"""

SCHEMA_RESPONSE_NOVO = """    transparencia_secchi_cm: Optional[int]
    amonia_mg_l: Optional[Decimal] = None
    nitrito_mg_l: Optional[Decimal] = None
    alertas: Optional[str]"""

# ── Arquivo 2: routers/piscicultura.py ──────────────────────────────────────

ARQ_ROUTER = Path("app/routers/piscicultura.py")
BAK_ROUTER = Path("app/routers/piscicultura.py.bak_amonia_nitrito_v1")

ALERTAS_AGUA_ANTIGO = '''def _gerar_alertas_agua(registro: dict) -> list:
    """Verifica parâmetros da água e retorna lista de alertas."""
    alertas = []
    o2 = registro.get("oxigenio_dissolvido")
    ph = registro.get("ph")
    temp = registro.get("temperatura_c")
    secchi = registro.get("transparencia_secchi_cm")'''

ALERTAS_AGUA_NOVO = '''def _gerar_alertas_agua(registro: dict) -> list:
    """Verifica parâmetros da água e retorna lista de alertas."""
    alertas = []
    o2 = registro.get("oxigenio_dissolvido")
    ph = registro.get("ph")
    temp = registro.get("temperatura_c")
    secchi = registro.get("transparencia_secchi_cm")
    amonia = registro.get("amonia_mg_l")
    nitrito = registro.get("nitrito_mg_l")'''

ALERTAS_AGUA_SECCHI_ANTIGO = '''    if secchi is not None:
        if secchi < 30:
            alertas.append(f"⚠️ Transparência baixa = {secchi} cm — trocar água")
        elif secchi > 70:
            alertas.append(f"⚠️ Transparência alta = {secchi} cm — adubar viveiro")

    return alertas'''

ALERTAS_AGUA_SECCHI_NOVO = '''    if secchi is not None:
        if secchi < 30:
            alertas.append(f"⚠️ Transparência baixa = {secchi} cm — trocar água")
        elif secchi > 70:
            alertas.append(f"⚠️ Transparência alta = {secchi} cm — adubar viveiro")

    if amonia is not None:
        if amonia > 0.5:
            alertas.append(f"⚠️ CRÍTICO: Amônia = {amonia} mg/L — acima do limite (0.5 mg/L), trocar água")
        elif amonia > 0.3:
            alertas.append(f"⚠️ Amônia elevada = {amonia} mg/L (aviso, limite crítico 0.5)")

    if nitrito is not None:
        if nitrito > 0.2:
            alertas.append(f"⚠️ CRÍTICO: Nitrito = {nitrito} mg/L — acima do limite (0.2 mg/L), trocar água")
        elif nitrito > 0.1:
            alertas.append(f"⚠️ Nitrito elevado = {nitrito} mg/L (aviso, limite crítico 0.2)")

    return alertas'''

INSERT_PAINEL_ANTIGO = """            cur.execute(\"\"\"
                INSERT INTO registros_diarios_piscicultura
                    (ciclo_id, data_registro, racao_kg, tipo_racao, custo_racao_dia,
                     preco_kg_racao, mortalidade_qtd, mortalidade_causa,
                     oxigenio_dissolvido, ph, temperatura_c, transparencia_secchi_cm, alertas,
                     insumo_racao_id, movimentacao_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (ciclo_id, data_registro) DO UPDATE SET
                    racao_kg = EXCLUDED.racao_kg,
                    tipo_racao = EXCLUDED.tipo_racao,
                    custo_racao_dia = EXCLUDED.custo_racao_dia,
                    preco_kg_racao = EXCLUDED.preco_kg_racao,
                    mortalidade_qtd = EXCLUDED.mortalidade_qtd,
                    mortalidade_causa = EXCLUDED.mortalidade_causa,
                    oxigenio_dissolvido = EXCLUDED.oxigenio_dissolvido,
                    ph = EXCLUDED.ph,
                    temperatura_c = EXCLUDED.temperatura_c,
                    transparencia_secchi_cm = EXCLUDED.transparencia_secchi_cm,
                    alertas = EXCLUDED.alertas,
                    insumo_racao_id = EXCLUDED.insumo_racao_id,
                    movimentacao_id = EXCLUDED.movimentacao_id
                RETURNING *
            \"\"\", (
                data.ciclo_id, data.data_registro,
                float(data.racao_kg) if data.racao_kg else None,
                data.tipo_racao,
                custo_racao_dia,
                float(data.preco_kg_racao) if data.preco_kg_racao else None,
                data.mortalidade_qtd, data.mortalidade_causa,
                float(data.oxigenio_dissolvido) if data.oxigenio_dissolvido else None,
                float(data.ph) if data.ph else None,
                float(data.temperatura_c) if data.temperatura_c else None,
                data.transparencia_secchi_cm,
                alertas_str,
                data.insumo_racao_id, movimentacao_id,
            ))"""

INSERT_PAINEL_NOVO = """            cur.execute(\"\"\"
                INSERT INTO registros_diarios_piscicultura
                    (ciclo_id, data_registro, racao_kg, tipo_racao, custo_racao_dia,
                     preco_kg_racao, mortalidade_qtd, mortalidade_causa,
                     oxigenio_dissolvido, ph, temperatura_c, transparencia_secchi_cm,
                     amonia_mg_l, nitrito_mg_l, alertas,
                     insumo_racao_id, movimentacao_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (ciclo_id, data_registro) DO UPDATE SET
                    racao_kg = EXCLUDED.racao_kg,
                    tipo_racao = EXCLUDED.tipo_racao,
                    custo_racao_dia = EXCLUDED.custo_racao_dia,
                    preco_kg_racao = EXCLUDED.preco_kg_racao,
                    mortalidade_qtd = EXCLUDED.mortalidade_qtd,
                    mortalidade_causa = EXCLUDED.mortalidade_causa,
                    oxigenio_dissolvido = EXCLUDED.oxigenio_dissolvido,
                    ph = EXCLUDED.ph,
                    temperatura_c = EXCLUDED.temperatura_c,
                    transparencia_secchi_cm = EXCLUDED.transparencia_secchi_cm,
                    amonia_mg_l = EXCLUDED.amonia_mg_l,
                    nitrito_mg_l = EXCLUDED.nitrito_mg_l,
                    alertas = EXCLUDED.alertas,
                    insumo_racao_id = EXCLUDED.insumo_racao_id,
                    movimentacao_id = EXCLUDED.movimentacao_id
                RETURNING *
            \"\"\", (
                data.ciclo_id, data.data_registro,
                float(data.racao_kg) if data.racao_kg else None,
                data.tipo_racao,
                custo_racao_dia,
                float(data.preco_kg_racao) if data.preco_kg_racao else None,
                data.mortalidade_qtd, data.mortalidade_causa,
                float(data.oxigenio_dissolvido) if data.oxigenio_dissolvido else None,
                float(data.ph) if data.ph else None,
                float(data.temperatura_c) if data.temperatura_c else None,
                data.transparencia_secchi_cm,
                float(data.amonia_mg_l) if data.amonia_mg_l else None,
                float(data.nitrito_mg_l) if data.nitrito_mg_l else None,
                alertas_str,
                data.insumo_racao_id, movimentacao_id,
            ))"""

INSERT_BOT_ANTIGO = '''                cur.execute("""
                    INSERT INTO registros_diarios_piscicultura
                        (ciclo_id, data_registro, racao_kg, tipo_racao, mortalidade_qtd,
                         mortalidade_causa, oxigenio_dissolvido, ph, temperatura_c,
                         transparencia_secchi_cm, alertas)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (ciclo_id, data_registro) DO UPDATE SET
                        racao_kg = COALESCE(EXCLUDED.racao_kg, registros_diarios_piscicultura.racao_kg),
                        mortalidade_qtd = COALESCE(EXCLUDED.mortalidade_qtd, registros_diarios_piscicultura.mortalidade_qtd),
                        oxigenio_dissolvido = COALESCE(EXCLUDED.oxigenio_dissolvido, registros_diarios_piscicultura.oxigenio_dissolvido),
                        ph = COALESCE(EXCLUDED.ph, registros_diarios_piscicultura.ph),
                        temperatura_c = COALESCE(EXCLUDED.temperatura_c, registros_diarios_piscicultura.temperatura_c),
                        transparencia_secchi_cm = COALESCE(EXCLUDED.transparencia_secchi_cm, registros_diarios_piscicultura.transparencia_secchi_cm),
                        alertas = COALESCE(EXCLUDED.alertas, registros_diarios_piscicultura.alertas)
                    RETURNING id
                """, (
                    ciclo_id, entidades.get("data_evento"), entidades.get("racao_kg"),
                    entidades.get("tipo_racao"), entidades.get("mortalidade_qtd"),
                    entidades.get("mortalidade_causa"), entidades.get("oxigenio_dissolvido"),
                    entidades.get("ph"), entidades.get("temperatura_c"),
                    entidades.get("transparencia_secchi_cm"), alertas_str,
                ))'''

INSERT_BOT_NOVO = '''                cur.execute("""
                    INSERT INTO registros_diarios_piscicultura
                        (ciclo_id, data_registro, racao_kg, tipo_racao, mortalidade_qtd,
                         mortalidade_causa, oxigenio_dissolvido, ph, temperatura_c,
                         transparencia_secchi_cm, amonia_mg_l, nitrito_mg_l, alertas)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (ciclo_id, data_registro) DO UPDATE SET
                        racao_kg = COALESCE(EXCLUDED.racao_kg, registros_diarios_piscicultura.racao_kg),
                        mortalidade_qtd = COALESCE(EXCLUDED.mortalidade_qtd, registros_diarios_piscicultura.mortalidade_qtd),
                        oxigenio_dissolvido = COALESCE(EXCLUDED.oxigenio_dissolvido, registros_diarios_piscicultura.oxigenio_dissolvido),
                        ph = COALESCE(EXCLUDED.ph, registros_diarios_piscicultura.ph),
                        temperatura_c = COALESCE(EXCLUDED.temperatura_c, registros_diarios_piscicultura.temperatura_c),
                        transparencia_secchi_cm = COALESCE(EXCLUDED.transparencia_secchi_cm, registros_diarios_piscicultura.transparencia_secchi_cm),
                        amonia_mg_l = COALESCE(EXCLUDED.amonia_mg_l, registros_diarios_piscicultura.amonia_mg_l),
                        nitrito_mg_l = COALESCE(EXCLUDED.nitrito_mg_l, registros_diarios_piscicultura.nitrito_mg_l),
                        alertas = COALESCE(EXCLUDED.alertas, registros_diarios_piscicultura.alertas)
                    RETURNING id
                """, (
                    ciclo_id, entidades.get("data_evento"), entidades.get("racao_kg"),
                    entidades.get("tipo_racao"), entidades.get("mortalidade_qtd"),
                    entidades.get("mortalidade_causa"), entidades.get("oxigenio_dissolvido"),
                    entidades.get("ph"), entidades.get("temperatura_c"),
                    entidades.get("transparencia_secchi_cm"), entidades.get("amonia_mg_l"),
                    entidades.get("nitrito_mg_l"), alertas_str,
                ))'''

# ── Arquivo 3: services/piscicultura_ia.py ──────────────────────────────────

ARQ_IA = Path("app/services/piscicultura_ia.py")
BAK_IA = Path("app/services/piscicultura_ia.py.bak_amonia_nitrito_v1")

IA_PROMPT_ANTIGO = '''- registro_diario → racao_kg? (float), tipo_racao? (str), mortalidade_qtd? (int),
                     mortalidade_causa? (str), oxigenio_dissolvido? (float, mg/L),
                     ph? (float), temperatura_c? (float), transparencia_secchi_cm? (int)'''

IA_PROMPT_NOVO = '''- registro_diario → racao_kg? (float), tipo_racao? (str), mortalidade_qtd? (int),
                     mortalidade_causa? (str), oxigenio_dissolvido? (float, mg/L),
                     ph? (float), temperatura_c? (float), transparencia_secchi_cm? (int),
                     amonia_mg_l? (float, mg/L), nitrito_mg_l? (float, mg/L)'''

ARQUIVOS = [
    (ARQ_SCHEMA, BAK_SCHEMA, [
        ("schema RegistroDiarioCreate", SCHEMA_CREATE_ANTIGO, SCHEMA_CREATE_NOVO),
        ("schema RegistroDiarioResponse", SCHEMA_RESPONSE_ANTIGO, SCHEMA_RESPONSE_NOVO),
    ]),
    (ARQ_ROUTER, BAK_ROUTER, [
        ("_gerar_alertas_agua assinatura", ALERTAS_AGUA_ANTIGO, ALERTAS_AGUA_NOVO),
        ("_gerar_alertas_agua corpo secchi/amonia/nitrito", ALERTAS_AGUA_SECCHI_ANTIGO, ALERTAS_AGUA_SECCHI_NOVO),
        ("INSERT registrar_dia (painel)", INSERT_PAINEL_ANTIGO, INSERT_PAINEL_NOVO),
        ("INSERT webhook_whatsapp_piscicultura (bot)", INSERT_BOT_ANTIGO, INSERT_BOT_NOVO),
    ]),
    (ARQ_IA, BAK_IA, [
        ("prompt IA registro_diario", IA_PROMPT_ANTIGO, IA_PROMPT_NOVO),
    ]),
]


def main():
    aplicar = "--aplicar" in sys.argv
    resultados = []

    for arquivo, backup, blocos in ARQUIVOS:
        if not arquivo.exists():
            print(f"ERRO: {arquivo} não encontrado.")
            sys.exit(1)
        conteudo = arquivo.read_text(encoding="utf-8")
        original = conteudo
        for nome, antigo, novo in blocos:
            n = conteudo.count(antigo)
            print(f"[{arquivo.name}] [{nome}] ocorrências encontradas: {n}")
            if n != 1:
                print(f"  ABORTANDO: esperava 1, achei {n}.")
                sys.exit(1)
            conteudo = conteudo.replace(antigo, novo)
        resultados.append((arquivo, backup, original, conteudo))

    if not aplicar:
        print("\n=== DRY RUN (nada gravado) ===")
        for arquivo, _, original, conteudo in resultados:
            print(f"{arquivo}: {len(original)} -> {len(conteudo)} bytes")
        return

    for arquivo, backup, original, conteudo in resultados:
        shutil.copy2(arquivo, backup)
        print(f"Backup: {backup}")
        arquivo.write_text(conteudo, encoding="utf-8")
        print(f"Aplicado em: {arquivo}")


if __name__ == "__main__":
    main()
