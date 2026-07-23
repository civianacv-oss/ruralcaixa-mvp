# =============================================================
# RURALCAIXA — Motor de Enquadramento de Contratos Rurais
# Arquivo: enquadramento_contrato.py
# Base legal: Lei 4.504/1964 (Estatuto da Terra), Art. 92-96
# =============================================================

from dataclasses import dataclass, field
from typing import List, Optional


# ------------------------------------------------------------------
# TIPOS DE BEM (o que cada parte aporta)
# ------------------------------------------------------------------
BENS_AGRICOLAS     = {"terra", "insumos", "trabalho"}
BENS_PECUARIOS     = {"animais"}
BENS_INDUSTRIAIS   = {"maquinario", "terra"}
BENS_EXTRATIVOS    = {"terra"}
BENS_CAPITAL       = {"dinheiro"}


# ------------------------------------------------------------------
# ESTRUTURA DE ENTRADA
# ------------------------------------------------------------------
@dataclass
class AporteParticipante:
    nome: str
    tipos_bem: List[str]        # ex: ["animais", "terra"]
    valor_total: float = 0.0

@dataclass
class DadosEnquadramento:
    participantes: List[AporteParticipante]
    finalidade: Optional[str] = None  # "producao_vegetal"|"criacao_animal"|"beneficiamento"|"extracao"


# ------------------------------------------------------------------
# RESULTADO
# ------------------------------------------------------------------
@dataclass
class ResultadoEnquadramento:
    tipo_contrato: str          # agricola|pecuaria|agroindustrial|extrativa|condominio_rural|sociedade
    subtipo: str                # clássica|mútua|condomínio_animais|condomínio_financeiro etc.
    base_legal: str
    descricao: str
    eh_condominio: bool
    scores: dict = field(default_factory=dict)
    alertas: List[str] = field(default_factory=list)
    percentuais_sugeridos: dict = field(default_factory=dict)


# ------------------------------------------------------------------
# MOTOR PRINCIPAL
# ------------------------------------------------------------------
def enquadrar_contrato(dados: DadosEnquadramento) -> ResultadoEnquadramento:
    """
    Analisa os aportes dos participantes e retorna o enquadramento
    jurídico correto conforme o Estatuto da Terra.
    """
    participantes = dados.participantes
    n = len(participantes)
    alertas = []

    # Coletar todos os tipos de bem por participante
    bens_por_participante = [set(p.tipos_bem) for p in participantes]
    todos_bens = set().union(*bens_por_participante)

    # Calcular percentuais se houver valores
    total_valor = sum(p.valor_total for p in participantes)
    percentuais = {}
    if total_valor > 0:
        for p in participantes:
            percentuais[p.nome] = round(p.valor_total * 100 / total_valor, 4)

    # ------------------------------------------------------------------
    # REGRA 1: Condomínio / Sociedade
    # Todos os participantes entram com bens (ninguém é só receptor)
    # ATENÇÃO: "trabalho" sozinho não caracteriza aporte mútuo —
    # é o papel clássico do outorgado na parceria.
    # ------------------------------------------------------------------
    BENS_PASSIVOS = {"trabalho", "insumos"}   # bens que caracterizam o outorgado, não o outorgante

    def eh_aporte_ativo(bens: set) -> bool:
        """Retorna True se o participante aporta algo além de trabalho."""
        return bool(bens - BENS_PASSIVOS)

    todos_aportam = all(eh_aporte_ativo(b) for b in bens_por_participante)

    if n >= 2 and todos_aportam:
        # Verificar se é condomínio de animais
        todos_com_animais = all("animais" in b for b in bens_por_participante)

        # Verificar se é condomínio financeiro (só dinheiro)
        todos_com_dinheiro = all("dinheiro" in b for b in bens_por_participante)

        # Verificar se é condomínio misto (terra + capital + animais)
        tem_terra = "terra" in todos_bens
        tem_animais = "animais" in todos_bens
        tem_dinheiro = "dinheiro" in todos_bens

        if todos_com_animais and not tem_terra:
            return ResultadoEnquadramento(
                tipo_contrato="condominio_rural",
                subtipo="condominio_animais",
                base_legal="Art. 96, §1º, Lei 4.504/1964 c/c CC Art. 1.314",
                descricao=(
                    "Condomínio pecuário: todos os participantes aportam animais. "
                    "Os frutos (crias, venda) são partilhados proporcionalmente ao "
                    "valor dos animais aportados por cada condômino."
                ),
                eh_condominio=True,
                scores=_calcular_scores(bens_por_participante, dados.finalidade),
                percentuais_sugeridos=percentuais,
            )

        if todos_com_dinheiro and len(todos_bens) == 1:
            return ResultadoEnquadramento(
                tipo_contrato="sociedade",
                subtipo="sociedade_de_fato",
                base_legal="CC Art. 981-986 (Sociedade Simples) c/c Lei 4.504/1964",
                descricao=(
                    "Sociedade de fato com aporte exclusivamente financeiro. "
                    "Recomenda-se formalizar como Sociedade Simples ou Condomínio "
                    "Rural com cotas de capital."
                ),
                eh_condominio=True,
                scores=_calcular_scores(bens_por_participante, dados.finalidade),
                percentuais_sugeridos=percentuais,
                alertas=["Considerar constituição de pessoa jurídica para aportes exclusivamente financeiros"],
            )

        if n >= 2 and todos_aportam:
            # Condomínio misto — determinar atividade principal
            tipo_ativ = _tipo_por_finalidade(dados.finalidade, todos_bens)
            return ResultadoEnquadramento(
                tipo_contrato="condominio_rural",
                subtipo=f"condominio_{tipo_ativ}",
                base_legal="Art. 92-96, Lei 4.504/1964 c/c CC Art. 1.314",
                descricao=(
                    f"Condomínio rural de atividade {tipo_ativ}. Todos os participantes "
                    f"aportam bens ({', '.join(sorted(todos_bens))}). "
                    f"Participação proporcional ao valor aportado por cada condômino."
                ),
                eh_condominio=True,
                scores=_calcular_scores(bens_por_participante, dados.finalidade),
                percentuais_sugeridos=percentuais,
            )

    # ------------------------------------------------------------------
    # REGRA 2: Parceria clássica (outorgante × outorgado)
    # Um cede, outro usa — identificar o tipo pelo bem cedido
    # ------------------------------------------------------------------
    if n == 2:
        bens_cedidos = bens_por_participante[0]  # outorgante cede
        finalidade = dados.finalidade

        # Pecuária — outorgante cede animais
        if "animais" in bens_cedidos:
            return ResultadoEnquadramento(
                tipo_contrato="pecuaria",
                subtipo="parceria_pecuaria_classica",
                base_legal="Art. 96, §1º, Lei 4.504/1964",
                descricao=(
                    "Parceria pecuária clássica: o outorgante cede animais ao outorgado "
                    "para cria, recria, invernagem ou engorda. Os frutos e produtos são "
                    "partilhados conforme estipulado."
                ),
                eh_condominio=False,
                scores=_calcular_scores(bens_por_participante, finalidade),
                percentuais_sugeridos=_sugerir_percentuais("pecuaria"),
            )

        # Agroindustrial — outorgante cede terra + maquinário
        if "terra" in bens_cedidos and "maquinario" in bens_cedidos:
            return ResultadoEnquadramento(
                tipo_contrato="agroindustrial",
                subtipo="parceria_agroindustrial",
                base_legal="Art. 96, §2º, Lei 4.504/1964",
                descricao=(
                    "Parceria agroindustrial: o outorgante cede imóvel e maquinário "
                    "para transformação de produtos agrícolas, pecuários ou florestais."
                ),
                eh_condominio=False,
                scores=_calcular_scores(bens_por_participante, finalidade),
                percentuais_sugeridos=_sugerir_percentuais("agroindustrial"),
            )

        # Extrativa — outorgante cede terra para extração
        if "terra" in bens_cedidos and finalidade == "extracao":
            return ResultadoEnquadramento(
                tipo_contrato="extrativa",
                subtipo="parceria_extrativa",
                base_legal="Art. 96, §3º, Lei 4.504/1964",
                descricao=(
                    "Parceria extrativa: o outorgante cede imóvel rural para extração "
                    "de produto agrícola, animal ou florestal pelo outorgado."
                ),
                eh_condominio=False,
                scores=_calcular_scores(bens_por_participante, finalidade),
                percentuais_sugeridos=_sugerir_percentuais("extrativa"),
            )

        # Agrícola — outorgante cede terra para produção vegetal (default)
        if "terra" in bens_cedidos:
            return ResultadoEnquadramento(
                tipo_contrato="agricola",
                subtipo="parceria_agricola_classica",
                base_legal="Art. 96, caput, Lei 4.504/1964",
                descricao=(
                    "Parceria agrícola: o outorgante cede uso do imóvel rural ao outorgado "
                    "para exploração agrícola, partilhando os riscos e os frutos."
                ),
                eh_condominio=False,
                scores=_calcular_scores(bens_por_participante, finalidade),
                percentuais_sugeridos=_sugerir_percentuais("agricola"),
            )

    # ------------------------------------------------------------------
    # FALLBACK — mais de 2 participantes sem aportes claros
    # ------------------------------------------------------------------
    alertas.append("Não foi possível determinar o enquadramento automaticamente. Revisão manual necessária.")
    return ResultadoEnquadramento(
        tipo_contrato="condominio_rural",
        subtipo="indeterminado",
        base_legal="Lei 4.504/1964 — revisão manual recomendada",
        descricao="Enquadramento indeterminado. Revise os aportes e a finalidade.",
        eh_condominio=True,
        alertas=alertas,
        percentuais_sugeridos=percentuais,
    )


# ------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------

def _calcular_scores(bens_por_participante: list, finalidade: str) -> dict:
    """Pontuação de cada tipo para debug/transparência."""
    scores = {"agricola": 0, "pecuaria": 0, "agroindustrial": 0,
              "extrativa": 0, "condominio_rural": 0}
    todos = set().union(*bens_por_participante)
    todos_aportam = all(len(b) > 0 for b in bens_por_participante)

    if todos_aportam and len(bens_por_participante) >= 2:
        scores["condominio_rural"] += 40
    if "animais" in todos:
        scores["pecuaria"] += 30
        scores["condominio_rural"] += 10
    if "terra" in todos:
        scores["agricola"] += 20
        scores["extrativa"] += 15
    if "maquinario" in todos:
        scores["agroindustrial"] += 25
    if finalidade == "extracao":
        scores["extrativa"] += 20
    if finalidade == "beneficiamento":
        scores["agroindustrial"] += 20
    if finalidade == "criacao_animal":
        scores["pecuaria"] += 20
    if finalidade == "producao_vegetal":
        scores["agricola"] += 20

    return scores


def _tipo_por_finalidade(finalidade: str, todos_bens: set) -> str:
    if finalidade == "criacao_animal" or "animais" in todos_bens:
        return "pecuario"
    if finalidade == "beneficiamento" or "maquinario" in todos_bens:
        return "agroindustrial"
    if finalidade == "extracao":
        return "extrativo"
    return "agricola"


def _sugerir_percentuais(tipo: str) -> dict:
    """
    Percentuais mínimos legais conforme Decreto 59.566/1966
    (regulamenta o Estatuto da Terra).
    Outorgado não pode receber menos que:
    """
    sugestoes = {
        "agricola":      {"outorgante": 75, "outorgado": 25,
                          "nota": "Mín. legal: 25% para outorgado (Dec. 59.566/66, Art. 35)"},
        "pecuaria":      {"outorgante": 75, "outorgado": 25,
                          "nota": "Mín. legal: 25% para outorgado"},
        "agroindustrial":{"outorgante": 55, "outorgado": 45,
                          "nota": "Mín. legal: 45% para outorgado quando há maquinário cedido"},
        "extrativa":     {"outorgante": 70, "outorgado": 30,
                          "nota": "Mín. legal: 30% para outorgado"},
    }
    return sugestoes.get(tipo, {"outorgante": 50, "outorgado": 50})


# ------------------------------------------------------------------
# ENDPOINT FASTAPI — adicionar no contratos_api.py
# ------------------------------------------------------------------
"""
from enquadramento_contrato import (
    enquadrar_contrato, DadosEnquadramento, AporteParticipante
)

class EnquadramentoRequest(BaseModel):
    participantes: list   # [{nome, tipos_bem, valor_total}]
    finalidade: str = None

@router.post("/enquadrar")
def enquadrar(body: EnquadramentoRequest):
    participantes = [
        AporteParticipante(**p) for p in body.participantes
    ]
    resultado = enquadrar_contrato(
        DadosEnquadramento(participantes=participantes, finalidade=body.finalidade)
    )
    return {
        "tipo_contrato":          resultado.tipo_contrato,
        "subtipo":                resultado.subtipo,
        "base_legal":             resultado.base_legal,
        "descricao":              resultado.descricao,
        "eh_condominio":          resultado.eh_condominio,
        "percentuais_sugeridos":  resultado.percentuais_sugeridos,
        "scores":                 resultado.scores,
        "alertas":                resultado.alertas,
    }
"""


# ------------------------------------------------------------------
# TESTE DIRETO
# ------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("TESTE 1: Condomínio de animais")
    print("Produtor A: 10 cabeças R$5.000 = R$50.000")
    print("Produtor B: 20 cabeças R$10.000 = R$200.000")
    print("=" * 60)
    r = enquadrar_contrato(DadosEnquadramento(
        participantes=[
            AporteParticipante("Produtor A", ["animais"], 50000),
            AporteParticipante("Produtor B", ["animais"], 200000),
        ],
        finalidade="criacao_animal"
    ))
    print(f"Tipo:        {r.tipo_contrato} / {r.subtipo}")
    print(f"Base legal:  {r.base_legal}")
    print(f"Descrição:   {r.descricao}")
    print(f"É condomínio: {r.eh_condominio}")
    print(f"Percentuais: {r.percentuais_sugeridos}")
    print()

    print("=" * 60)
    print("TESTE 2: Parceria pecuária clássica")
    print("Fazendeiro cede animais, parceiro entra com pasto/trabalho")
    print("=" * 60)
    r2 = enquadrar_contrato(DadosEnquadramento(
        participantes=[
            AporteParticipante("Fazendeiro", ["animais"], 0),
            AporteParticipante("Parceiro",   ["trabalho"], 0),
        ],
        finalidade="criacao_animal"
    ))
    print(f"Tipo:        {r2.tipo_contrato} / {r2.subtipo}")
    print(f"Base legal:  {r2.base_legal}")
    print(f"Percentuais sugeridos: {r2.percentuais_sugeridos}")
    print()

    print("=" * 60)
    print("TESTE 3: Fazenda Boa Esperança — condomínio misto")
    print("João: terra + dinheiro | Cícero: dinheiro | Geodilson: dinheiro")
    print("=" * 60)
    r3 = enquadrar_contrato(DadosEnquadramento(
        participantes=[
            AporteParticipante("João Batista", ["terra", "dinheiro"], 100000),
            AporteParticipante("Cícero",       ["dinheiro"],          125000),
            AporteParticipante("Geodilson",    ["dinheiro"],          100000),
        ],
        finalidade="producao_vegetal"
    ))
    print(f"Tipo:        {r3.tipo_contrato} / {r3.subtipo}")
    print(f"Base legal:  {r3.base_legal}")
    print(f"Percentuais: {r3.percentuais_sugeridos}")
    print()

    print("=" * 60)
    print("TESTE 4: Parceria agroindustrial")
    print("Fazendeiro cede terra + maquinário, parceiro processa")
    print("=" * 60)
    r4 = enquadrar_contrato(DadosEnquadramento(
        participantes=[
            AporteParticipante("Fazendeiro", ["terra", "maquinario"], 0),
            AporteParticipante("Processador", ["trabalho", "insumos"], 0),
        ],
        finalidade="beneficiamento"
    ))
    print(f"Tipo:        {r4.tipo_contrato} / {r4.subtipo}")
    print(f"Base legal:  {r4.base_legal}")
    print(f"Percentuais sugeridos: {r4.percentuais_sugeridos}")
