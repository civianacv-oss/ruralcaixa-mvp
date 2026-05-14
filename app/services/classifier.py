import re
import unicodedata
from datetime import date

REGRAS = [
    (["diesel","gasolina","etanol","combustivel","abastec"], "3.1.2", "despesa"),
    (["semente","adubo","fertilizante","calcario","defensivo"], "3.1.1", "despesa"),
    (["racao","vacina","vermifugo","medicamento animal"], "3.1.3", "despesa"),
    (["salario","funcionario","diarista","mao de obra"], "3.1.4", "despesa"),
    (["manutencao","reparo","conserto","peca"], "3.1.5", "despesa"),
    (["energia","luz","conta de luz"], "3.1.6", "despesa"),
    (["arrendamento","aluguel rural"], "3.1.7", "despesa"),
    (["trator","maquina","equipamento","implemento"], "5.1", "investimento"),
    (["obra","benfeitoria","cerca","curral"], "5.2", "investimento"),
    (["novilho","bezerra","matriz","plantel","compra animal","compra ovelha","compra cabra","ovelha","cabra"], "5.3", "investimento"),
    (["venda","vendi","recebi","entregue"], "1.1", "receita"),
    (["soja","milho","cafe","cana","algodao"], "1.1.1", "receita"),
    (["boi","vaca","gado","bovino","suino","frango","ovino","caprino","ovelha","carneiro","cabra","bode","cordeiro"], "1.1.2", "receita"),
]


def extrair_valor(texto):
    # remove pontos de milhar antes de buscar
    texto_limpo = re.sub(r'(\d)\.(\d{3})', r'\1\2', texto)
    padrao = r'\b(\d+(?:,\d{2})?)\b'
    matches = re.findall(padrao, texto_limpo)
    valores = []
    for m in matches:
        try:
            valores.append(float(m.replace(",", ".")))
        except:
            pass
    return max(valores) if valores else 0.0

def normalizar(texto):
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def classificar(texto):
    texto_norm = normalizar(texto)
    melhor = None
    melhor_score = 0

    for palavras, conta, tipo in REGRAS:
        score = sum(1 for p in palavras if p in texto_norm)
        if score > melhor_score:
            melhor_score = score
            melhor = (conta, tipo)

    if not melhor or melhor_score == 0:
        return None

    valor = extrair_valor(texto)
    confianca = min(95, 60 + melhor_score * 15)

    return {
        "conta": melhor[0],
        "tipo": melhor[1],
        "valor": valor,
        "data": date.today().isoformat(),
        "confianca": confianca,
    }