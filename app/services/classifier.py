import re
import unicodedata
from datetime import date

REGRAS = [
    (["diesel","gasolina","etanol","combustivel","abastec"], "3.1.2", "despesa", None),
    (["semente","adubo","fertilizante","calcario","defensivo"], "3.1.1", "despesa", None),
    (["racao", "vacina", "vermifugo", "medicamento", "remedio", "farmacia",
      "antibiotico", "antiinflamatorio", "antiflamatorio"], "3.1.3", "despesa", None),
    (["salario","funcionario","diarista","mao de obra"], "3.1.4", "despesa", None),
    (["manutencao","reparo","conserto","peca"], "3.1.5", "despesa", None),
    (["energia","luz","conta de luz"], "3.1.6", "despesa", None),
    (["arrendamento", "arrendei", "arrendar", "aluguel", "aluguei", "alugar",
      "alugado", "locacao", "locado"], "3.1.7", "despesa", None),
    (["trator","maquina","equipamento","implemento"], "5.1", "investimento", None),
    (["obra","benfeitoria","cerca","curral"], "5.2", "investimento", None),
    (["novilho","bezerra","matriz","plantel","compra animal","compra ovelha","compra cabra"], "5.3", "investimento", None),
    (["soja"], "1.1.1", "receita", "Soja"),
    (["milho"], "1.1.1", "receita", "Milho"),
    (["cafe","café"], "1.1.1", "receita", "Cafe"),
    (["cana"], "1.1.1", "receita", "Cana-de-acucar"),
    (["algodao","algodão"], "1.1.1", "receita", "Algodao"),
    (["arroz"], "1.1.1", "receita", "Arroz"),
    (["feijao","feijão"], "1.1.1", "receita", "Feijao"),
    (["trigo"], "1.1.1", "receita", "Trigo"),
    (["boi","vaca","gado","bovino","bezerro","novilho"], "1.1.2", "receita", "Bovino"),
    (["suino","suíno","porco"], "1.1.2", "receita", "Suino"),
    (["frango","galinha","ave"], "1.1.2", "receita", "Aves"),
    (["ovelha","carneiro","ovino"], "1.1.2", "receita", "Ovino"),
    (["cabra","bode","caprino"], "1.1.2", "receita", "Caprino"),
    (["leite"], "1.1.2", "receita", "Leite"),
    (["venda","vendi","recebi","entregue"], "1.1", "receita", None),
]

PRODUTOS = {
    "Soja": ["soja"],
    "Milho": ["milho"],
    "Cafe": ["cafe","café"],
    "Cana-de-acucar": ["cana"],
    "Algodao": ["algodao","algodão"],
    "Arroz": ["arroz"],
    "Feijao": ["feijao","feijão"],
    "Trigo": ["trigo"],
    "Bovino": ["boi","vaca","gado","bovino","bezerro","novilho","bois","vacas"],
    "Suino": ["suino","suíno","porco","leitao"],
    "Aves": ["frango","galinha","ave","pinto"],
    "Ovino": ["ovelha","carneiro","ovino","cordeiro"],
    "Caprino": ["cabra","bode","caprino"],
    "Leite": ["leite"],
}

def extrair_valor(texto):
    """Extrai o valor monetário do texto. Não usa simplesmente 'o maior número
    encontrado' — isso confundia quantidade com preço (ex: 'comprei 10 porcos'
    virava R$ 10,00). Prioriza números com sinal explícito de dinheiro (R$,
    'reais', 'conto') ou no padrão 'por/a X'; sem isso, retorna None em vez
    de arriscar um valor errado."""
    texto_limpo = re.sub(r'(\d)\.(\d{3})', r'\1\2', texto)
    texto_norm = normalizar(texto_limpo)

    # 1) Padrão com sinal explícito de moeda: "R$ 250", "250 reais", "250 conto"
    candidatos_moeda = []
    for m in re.finditer(r'r\$\s*(\d+(?:,\d{2})?)', texto_norm):
        candidatos_moeda.append(float(m.group(1).replace(",", ".")))
    for m in re.finditer(r'(\d+(?:,\d{2})?)\s*reais', texto_norm):
        candidatos_moeda.append(float(m.group(1).replace(",", ".")))
    # "10 mil reais" / "10 mil" (fala transcrita costuma separar o numero da
    # palavra "mil" em vez de escrever "10000" direto)
    for m in re.finditer(r'(\d+(?:[.,]\d+)?)\s*mil\b', texto_norm):
        candidatos_moeda.append(float(m.group(1).replace(",", ".")) * 1000)
    if candidatos_moeda:
        return max(candidatos_moeda)

    # 2) Padrão "por/a X" (ex: "vendi 5 bois por 10000", "a 300 a unidade")
    candidatos_por = []
    for m in re.finditer(r'\b(?:por|a)\s+(\d+(?:,\d{2})?)\b', texto_norm):
        candidatos_por.append(float(m.group(1).replace(",", ".")))
    if candidatos_por:
        return max(candidatos_por)

    # 3) Sem nenhum sinal de moeda — não arrisca adivinhar (evita pegar
    # quantidade de animais/sacas como se fosse preço). Retorna None; quem
    # chama decide se pergunta o valor ou usa 0 como padrão.
    return None


def extrair_valor_legado(texto):
    """Mantido apenas para referência/comparação — comportamento antigo
    (pegava o maior número do texto, sem checar se era preço de verdade)."""
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

def detectar_produto(texto_norm):
    for produto, palavras in PRODUTOS.items():
        if any(p in texto_norm for p in palavras):
            return produto
    return None

def classificar_recibo(texto):
    """
    Detecta se a mensagem descreve a criacao de um recibo (menciona CPF e
    telefone de um terceiro) e extrai os campos. Espera um formato como:
    'CPF 000.000.000-00 telefone (00) 00000-0000 Nome Completo valor R$100 objeto'
    A ordem dos campos apos os rotulos nao importa, mas os rotulos "cpf",
    "telefone" e "valor" precisam aparecer no texto.
    Retorna None se o texto nao parecer ser uma criacao de recibo (assim o
    fluxo normal de classificacao de lancamento continua funcionando).
    """
    if "cpf" not in texto.lower() or "telefone" not in texto.lower():
        return None

    m_cpf = re.search(r'cpf\s*[:\-]?\s*([\d\.\s\-]{11,18})', texto, re.IGNORECASE)
    if not m_cpf:
        return None
    cpf_digits = re.sub(r'\D', '', m_cpf.group(1))[:14]
    if len(cpf_digits) not in (11, 14):
        return None

    m_tel = re.search(r'telefone\s*[:\-]?\s*([\(\)\d\s\-]{8,20})', texto, re.IGNORECASE)
    if not m_tel:
        return None
    tel_digits = re.sub(r'\D', '', m_tel.group(1))
    if len(tel_digits) in (10, 11):
        tel_digits = "55" + tel_digits

    valor = extrair_valor(texto)
    if not valor:
        return None

    m_valor_pos = re.search(r'valor', texto, re.IGNORECASE)
    nome = ""
    if m_valor_pos and m_valor_pos.start() > m_tel.end():
        nome = texto[m_tel.end():m_valor_pos.start()].strip(" ,.-")
    if not nome:
        return None

    objeto = "Recibo"
    if m_valor_pos:
        resto = texto[m_valor_pos.end():]
        resto_sem_valor = re.sub(r'r?\$?\s*\d+(?:[.,]\d{2})?', '', resto, count=1, flags=re.IGNORECASE)
        resto_sem_valor = resto_sem_valor.strip(" ,.-")
        if resto_sem_valor:
            objeto = resto_sem_valor

    return {
        "destinatario_nome": nome,
        "destinatario_documento": cpf_digits,
        "destinatario_telefone": tel_digits,
        "valor": valor,
        "objeto": objeto,
    }


def classificar(texto, termos_aprendidos: dict = None):
    """termos_aprendidos: dict opcional {termo_normalizado: (conta, tipo)},
    vindo de correções manuais anteriores do produtor (tabela
    termos_aprendidos_financeiro). Tem prioridade sobre as REGRAS fixas,
    porque representa uma escolha explícita do próprio produtor."""
    texto_norm = normalizar(texto)
    melhor = None
    melhor_score = 0

    if termos_aprendidos:
        for termo, (conta_aprendida, tipo_aprendido) in termos_aprendidos.items():
            if termo in texto_norm:
                melhor = (conta_aprendida, tipo_aprendido, None)
                melhor_score = 99  # aprendido > regra fixa, mas ainda passa pelas checagens abaixo
                break

    if melhor is None:
        for palavras, conta, tipo, produto in REGRAS:
            score = sum(1 for p in palavras if p in texto_norm)
            if score > melhor_score:
                melhor_score = score
                melhor = (conta, tipo, produto)

    if not melhor or melhor_score == 0:
        return None

    valor = extrair_valor(texto)
    confianca = min(95, 60 + melhor_score * 15) if melhor_score < 99 else 90
    produto = melhor[2] or detectar_produto(texto_norm)

    # Detectar atividade
    INTERMEDIACAO = ["comissao", "corretagem", "intermediacao", "agenciamento", "honorario"]
    SERVICO = ["consultoria", "assessoria", "prestacao de servico"]
    
    atividade = "rural"
    for p in INTERMEDIACAO:
        if p in texto_norm:
            atividade = "intermediacao"
            break
    if atividade == "rural":
        for p in SERVICO:
            if p in texto_norm:
                atividade = "servico"
                break

    # Detectar compra vs venda
    PALAVRAS_COMPRA = ["comprei", "compra", "adquiri", "paguei", "gastei", "comprado"]
    is_compra = any(p in texto_norm for p in PALAVRAS_COMPRA)

    # Se é compra de animal → investimento conta 5.3, não receita
    if is_compra and melhor[1] == "receita":
        animais = ["boi", "vaca", "gado", "bovino", "bezerro", "ovelha", "carneiro", "ovino", "cabra", "bode", "porco", "suino", "frango", "galinha"]
        if any(p in texto_norm for p in animais):
            melhor = ("5.3", "investimento", "Animais")
        else:
            melhor = ("3.9", "despesa", None)

    # Algumas contas são ambíguas quanto à direção (quem paga x quem recebe)
    # sem mais contexto — "aluguel"/"arrendamento" pode ser tanto despesa
    # (paguei pra alugar de alguém) quanto receita (aluguei o que é meu pra
    # alguém). Tenta resolver pelo próprio texto antes de marcar como
    # ambíguo — só pergunta ao produtor quando não há pista nenhuma.
    CONTAS_AMBIGUAS_DIRECAO = {"3.1.7"}
    ambiguo_direcao = False
    if melhor[0] in CONTAS_AMBIGUAS_DIRECAO:
        # Só resolve sozinho quando há um verbo inequívoco de quem recebeu ou
        # pagou — frases como "aluguei pro vizinho" têm o objeto no meio
        # ("aluguei A PÁ pro vizinho"), então não dá pra confiar em casar
        # "aluguei" + preposição coladas. Melhor perguntar do que arriscar.
        PALAVRAS_RECEITA_CTX = ["recebi", "cobrei", "ganhei", "faturei"]
        PALAVRAS_DESPESA_CTX = ["paguei", "gastei", "contratei", "desembolsei"]
        if any(p in texto_norm for p in PALAVRAS_RECEITA_CTX):
            melhor = (melhor[0], "receita", melhor[2])
        elif any(p in texto_norm for p in PALAVRAS_DESPESA_CTX):
            melhor = (melhor[0], "despesa", melhor[2])
        else:
            ambiguo_direcao = True

    return {
        "conta": melhor[0],
        "tipo": melhor[1],
        "valor": valor,  # pode vir None se não achou sinal de moeda no texto
        "data": date.today().isoformat(),
        "confianca": confianca,
        "produto": produto,
        "atividade": atividade,
        "ambiguo_direcao": ambiguo_direcao,
    }