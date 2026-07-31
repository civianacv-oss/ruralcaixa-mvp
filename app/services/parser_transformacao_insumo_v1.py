"""
parser_transformacao_insumo_v1.py

Parser de linguagem natural para o comando de TRANSFORMACAO (mistura) de
insumo, usado pelos dois canais do bot (Telegram/mensagem_handler.py e
WhatsApp/whatsapp_bot_router.py) dentro do fluxo unificado.

Este modulo NAO grava nada no banco - ele so interpreta o texto do
produtor e devolve uma estrutura pronta para:
  (a) mostrar uma mensagem de confirmacao ao usuario, ou
  (b) alimentar processar_transformacao() (transformacao_insumo_v1.py)
      depois que o usuario confirmar.

Fluxo de deteccao (decisao do produtor, 31/07):
  - Multiplos gatilhos linguisticos ("misturei", "fiz mistura", "preparei",
    "mixei", "montei", "formulei"), NAO uma palavra-chave fixa unica.
  - Filtro de contexto obrigatorio: gatilho sozinho nao basta. So dispara
    se o texto tambem tiver (ingrediente tipico de racao) OU (quantidade
    com unidade reconhecida). Isso evita falso positivo em frases como
    "preparei o almoço" ou "misturei o remedio do cachorro".
  - "usei Xkg de Y" continua sendo CONSUMO, nunca mistura (ja tratado em
    outro fluxo existente) - o gatilho de consumo nao entra na lista acima.

Fluxo de ambiguidade (assumido como padrao, decisao pendente de confirmar
com o produtor - ver mensagem no chat): se algum ingrediente nao puder ser
extraido com confianca (quantidade sem unidade clara, nome de insumo nao
reconhecido no catalogo), o bot mostra o que entendeu ate agora e pede
confirmacao/correcao numa unica mensagem (mesmo padrao ja usado no wizard
de Recibo e na confirmacao de venda) - NAO um wizard item-a-item, e NAO
uma rejeicao total da frase.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional


# ---------------------------------------------------------------------------
# Normalizacao de texto
# ---------------------------------------------------------------------------

def _normalizar(texto: str) -> str:
    """minusculas, sem acento, espacos colapsados - so para deteccao/matching."""
    texto = texto.strip().lower()
    texto = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    texto = re.sub(r"\s+", " ", texto)
    return texto


# ---------------------------------------------------------------------------
# Deteccao: e uma transformacao/mistura, ou nao?
# ---------------------------------------------------------------------------

GATILHOS_FORTES = [
    "mistura de", "fiz mistura", "montei a mistura", "montei uma mistura",
    "formulei",
]  # ja contem a palavra 'mistura'/'formul' explicita - dispensam contexto extra

GATILHOS_FRACOS = [
    "misturei", "misture", "preparei", "mixei", "mix de", "montei",
]  # verbos ambiguos (podem descrever qualquer mistura, nao so racao) -
   # exigem ingrediente tipico OU quantidade+unidade para disparar

# Termos que, quando presentes, sinalizam fortemente que a frase e sobre
# insumo/racao (reduz falso positivo tipo "preparei o almoco")
INGREDIENTES_TIPICOS = [
    "milho", "soja", "farelo", "farelo de soja", "farelo de milho",
    "nucleo", "núcleo", "ureia", "uréia", "sal mineral", "sal",
    "caroco de algodao", "caroco", "algodao", "trigo", "polpa citrica",
    "polpa", "citrus", "fuba", "fubá", "silagem", "bagaco", "bagaço",
]

# Unidades aceitas na quantidade (kg tem prioridade, mas aceitamos variantes)
_UNIDADES = r"(?:kg|kgs|quilo|quilos|g|gramas?|saco|sacos|ton|toneladas?)"

# Regex principal: captura "<numero> <unidade> de <nome do insumo>"
# Ex: "30kg de milho", "20 quilos de soja", "10 sacos de nucleo"
_RE_ITEM = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*" + _UNIDADES + r"\s+de\s+([a-zà-ú çãõ]+?)"
    r"(?=(?:,| e | com | pra | para |$))",
    re.IGNORECASE,
)

# Regex de fallback: numero seguido de nome, SEM unidade explicita
# (usado so para sinalizar ambiguidade, nao para extrair com confianca)
_RE_NUMERO_SEM_UNIDADE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s+de\s+([a-zà-ú çãõ]+?)(?=(?:,| e | com | pra | para |$))",
    re.IGNORECASE,
)

# Regex para o nome do resultado: "pra fazer X", "para fazer X",
# "pra virar X", "que virou X", "pra formular X"
_RE_RESULTADO = re.compile(
    r"(?:pra|para)\s+(?:fazer|formular|virar)\s+([a-zà-ú çãõ0-9]+)"
    r"|que\s+virou\s+([a-zà-ú çãõ0-9]+)",
    re.IGNORECASE,
)


def parece_transformacao(texto: str) -> bool:
    """
    True se o texto provavelmente descreve uma transformacao/mistura de
    insumo.

    Regra: gatilho FORTE (ja contem 'mistura'/'formul' explicito) dispara
    sozinho. Gatilho FRACO (verbo ambiguo tipo 'misturei', 'preparei',
    'mixei', 'montei') so dispara se tambem houver ingrediente tipico de
    racao OU quantidade com unidade reconhecida - isso evita falsos
    positivos como "preparei o almoco" ou "misturei o remedio do cachorro".
    """
    texto_norm = _normalizar(texto)

    if any(g in texto_norm for g in GATILHOS_FORTES):
        return True

    tem_gatilho_fraco = any(g in texto_norm for g in GATILHOS_FRACOS)
    if not tem_gatilho_fraco:
        return False

    tem_ingrediente_tipico = any(ing in texto_norm for ing in INGREDIENTES_TIPICOS)
    tem_quantidade_com_unidade = bool(_RE_ITEM.search(texto))

    return tem_ingrediente_tipico or tem_quantidade_com_unidade


# ---------------------------------------------------------------------------
# Extracao estruturada
# ---------------------------------------------------------------------------

_FATOR_UNIDADE_PARA_KG = {
    "kg": Decimal("1"), "kgs": Decimal("1"),
    "quilo": Decimal("1"), "quilos": Decimal("1"),
    "g": Decimal("0.001"), "grama": Decimal("0.001"), "gramas": Decimal("0.001"),
    "saco": Decimal("60"), "sacos": Decimal("60"),  # padrao 60kg - ver nota abaixo
    "ton": Decimal("1000"), "tonelada": Decimal("1000"), "toneladas": Decimal("1000"),
}


@dataclass
class ItemExtraido:
    nome_insumo_bruto: str  # como veio na frase, sem normalizar contra o catalogo
    quantidade_kg: Optional[Decimal]  # None se nao foi possivel converter com confianca
    unidade_original: Optional[str]
    texto_origem: str  # trecho que gerou este item, para exibir na confirmacao


@dataclass
class ResultadoParse:
    itens: list = field(default_factory=list)  # list[ItemExtraido]
    nome_resultado: Optional[str] = None
    ambiguidades: list = field(default_factory=list)  # list[str] mensagens legiveis
    texto_original: str = ""

    @property
    def completo(self) -> bool:
        """True se todos os itens tem quantidade valida e ha nome de resultado."""
        return (
            len(self.itens) > 0
            and all(i.quantidade_kg is not None for i in self.itens)
            and self.nome_resultado is not None
        )


def extrair_transformacao(texto: str) -> ResultadoParse:
    """
    Extrai ingredientes + nome do resultado de uma frase de transformacao.
    Nao valida contra o catalogo de insumos (isso e feito depois, em
    processar_transformacao) - aqui e so parsing de linguagem natural.
    """
    resultado = ResultadoParse(texto_original=texto)

    # --- Itens com unidade explicita (alta confianca) ---
    nomes_ja_capturados = set()
    for m in _RE_ITEM.finditer(texto):
        quantidade_str, nome_bruto = m.group(1), m.group(2).strip()
        quantidade_str = quantidade_str.replace(",", ".")
        unidade_encontrada = re.search(_UNIDADES, m.group(0), re.IGNORECASE)
        unidade = unidade_encontrada.group(0).lower() if unidade_encontrada else None

        fator = _FATOR_UNIDADE_PARA_KG.get(unidade, None)
        quantidade_kg = None
        if fator is not None:
            quantidade_kg = (Decimal(quantidade_str) * fator)
            if unidade in ("saco", "sacos"):
                resultado.ambiguidades.append(
                    f"'{nome_bruto}': assumi que 1 saco = 60kg. Se o saco desse "
                    f"insumo for de outro peso, corrija a quantidade antes de confirmar."
                )

        resultado.itens.append(
            ItemExtraido(
                nome_insumo_bruto=nome_bruto,
                quantidade_kg=quantidade_kg,
                unidade_original=unidade,
                texto_origem=m.group(0),
            )
        )
        nomes_ja_capturados.add(nome_bruto)

    # --- Itens com numero mas SEM unidade clara (baixa confianca) ---
    for m in _RE_NUMERO_SEM_UNIDADE.finditer(texto):
        nome_bruto = m.group(2).strip()
        if nome_bruto in nomes_ja_capturados:
            continue  # ja capturado acima com unidade
        resultado.itens.append(
            ItemExtraido(
                nome_insumo_bruto=nome_bruto,
                quantidade_kg=None,
                unidade_original=None,
                texto_origem=m.group(0),
            )
        )
        resultado.ambiguidades.append(
            f"Nao entendi a unidade de '{m.group(0)}' - qual a quantidade "
            f"em kg de {nome_bruto}?"
        )

    # --- Nome do resultado ---
    m_resultado = _RE_RESULTADO.search(texto)
    if m_resultado:
        nome = (m_resultado.group(1) or m_resultado.group(2) or "").strip()
        # Capitaliza de forma simples (primeira letra de cada palavra)
        resultado.nome_resultado = nome.title() if nome else None
    else:
        resultado.ambiguidades.append(
            "Nao identifiquei o nome do produto final. Qual o nome da mistura "
            "(ex: 'Racao X')?"
        )

    if not resultado.itens:
        resultado.ambiguidades.append(
            "Nao consegui identificar nenhum ingrediente na frase. Pode "
            "descrever de novo, ex: 'misturei 30kg de milho e 20kg de soja "
            "pra fazer Racao X'?"
        )

    return resultado


# ---------------------------------------------------------------------------
# Mensagem de confirmacao (mesmo padrao do wizard de Recibo / venda: uma
# unica mensagem SIM/NAO, nunca pergunta item-a-item)
# ---------------------------------------------------------------------------

def montar_mensagem_confirmacao(resultado: ResultadoParse) -> str:
    """
    Monta a mensagem que o bot envia ao produtor mostrando o que entendeu,
    incluindo avisos de ambiguidade quando existirem. O produtor responde
    SIM para confirmar ou corrige reenviando a frase.
    """
    linhas = ["Entendi o seguinte:\n"]

    if resultado.itens:
        for item in resultado.itens:
            if item.quantidade_kg is not None:
                linhas.append(f"  - {item.quantidade_kg:g} kg de {item.nome_insumo_bruto}")
            else:
                linhas.append(f"  - {item.nome_insumo_bruto} (quantidade nao clara)")
    else:
        linhas.append("  (nenhum ingrediente identificado)")

    if resultado.nome_resultado:
        linhas.append(f"\nProduto final: {resultado.nome_resultado}")
    else:
        linhas.append("\nProduto final: (nao identificado)")

    if resultado.ambiguidades:
        linhas.append("\nAntes de confirmar, preciso que voce esclareca:")
        for aviso in resultado.ambiguidades:
            linhas.append(f"  ⚠️ {aviso}")
        linhas.append(
            "\nResponda com a frase corrigida (ex: incluindo a unidade ou "
            "o nome do produto final)."
        )
    else:
        linhas.append(
            "\nEsta correto? Responda SIM para confirmar e dar baixa no "
            "estoque, ou envie a frase corrigida."
        )

    return "\n".join(linhas)
