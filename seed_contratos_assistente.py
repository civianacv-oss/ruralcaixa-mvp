"""
Rodar uma vez contra o Postgres do Railway, depois da migração 020:
    python seed_contratos_assistente.py

Popula os tipos de contrato já reconhecidos pelo `_TIPO_MAP` de
app/contratos_api.py (agricola, pecuaria, agroindustrial, extrativa,
condominio, arrendamento, comodato, compra_venda) + prestacao_servico
(já existe em router_contratos.py). Assim a recomendação do assistente
sai pronta pra criar o contrato de verdade, sem precisar traduzir slug.

Idempotente: usa ON CONFLICT (slug) DO NOTHING, pode rodar mais de uma vez
sem duplicar.
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = (
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

TIPOS = [
    {
        "slug": "agricola",
        "nome": "Parceria Agrícola",
        "emoji": "🌱",
        "descricao": "Um produtor cede o uso da terra e outro entra com trabalho, insumos ou "
                     "tecnologia. A produção (ou o resultado financeiro dela) é dividida entre "
                     "os dois, numa proporção combinada.",
        "quando_usar": "Você tem terra mas falta capital/insumos, ou tem insumos/máquinas mas "
                       "precisa de terra — e os dois topam dividir o resultado (lucro e prejuízo) "
                       "em vez de combinar um valor fixo.",
        "ordem": 1,
        "clausulas": [
            ("Identificação das partes", "Nome completo, CPF/CNPJ e endereço do dono da terra e do parceiro.", True),
            ("Área parceirada", "Qual imóvel e quantos hectares exatamente entram no acordo.", True),
            ("O que cada um entra com", "Terra, sementes, adubo, máquina, mão de obra — liste tudo, de quem é cada coisa.", True),
            ("Percentual de divisão", "Ex: 60% pro dono da terra, 40% pro parceiro — e sobre o quê (produção bruta ou líquida).", True),
            ("Quem assume o risco de perda", "Se a safra quebrar por seca/praga, como fica a divisão — normalmente os dois perdem junto, proporcional.", True),
            ("Obrigações do dono da terra", "Manter acesso, água, estradas em condição de uso.", True),
            ("Obrigações do parceiro", "Plantio, trato, colheita dentro do prazo e do manejo combinado.", True),
            ("Como e onde a produção é vendida", "Junto ou cada um vende sua parte separadamente.", False),
            ("Prazo e renovação", "Por quanto tempo vale e o que acontece quando terminar.", True),
            ("Fim do contrato e devolução da terra", "Em que estado a terra deve ser devolvida.", True),
            ("Quem recebe as benfeitorias", "Se o parceiro construir uma cerca ou represa, fica pra quem.", False),
        ],
        "alertas": [
            ("Não confunda com arrendamento: aqui há divisão de risco e resultado, não um valor fixo combinado antes da safra.", "aviso"),
            ("Se na prática o parceiro só segue ordens do dono e recebe um valor fixo por dia/mês, isso pode ser vínculo empregatício disfarçado, não parceria — risco trabalhista sério.", "alerta"),
        ],
    },
    {
        "slug": "pecuaria",
        "nome": "Parceria Pecuária",
        "emoji": "🐄",
        "descricao": "Mesma lógica da parceria agrícola, mas pra criação de gado/animais: um entra "
                     "com pasto/terra, outro com o rebanho ou o trato, e dividem o resultado (crias, "
                     "peso ganho, venda dos animais).",
        "quando_usar": "Você tem pasto sobrando mas não tem gado (ou vice-versa), e topam dividir "
                       "o resultado da criação/engorda em vez de um aluguel fixo.",
        "ordem": 2,
        "clausulas": [
            ("Identificação das partes", "Nome completo, CPF/CNPJ e endereço dos dois lados.", True),
            ("Área de pasto e infraestrutura", "Quantos hectares, cercas, currais, água disponível.", True),
            ("Rebanho envolvido", "Quantidade, raça, peso inicial dos animais — ajuda a medir o ganho depois.", True),
            ("Percentual de divisão", "Sobre o quê: crias nascidas, arrobas ganhas, ou valor da venda.", True),
            ("Quem cuida do trato diário", "Vacina, ração, manejo sanitário — de quem é essa responsabilidade.", True),
            ("Risco de morte/doença do animal", "Como se divide o prejuízo se um animal morrer ou adoecer.", True),
            ("Prazo do acordo", "Normalmente amarrado a um ciclo de engorda ou período de monta.", True),
            ("Como e quando vender", "Critério pra decidir a hora de vender (peso mínimo, preço da arroba).", False),
        ],
        "alertas": [
            ("Não confunda com arrendamento de pasto: se o combinado é um valor fixo por cabeça/mês, isso é aluguel (arrendamento), não parceria.", "aviso"),
        ],
    },
    {
        "slug": "agroindustrial",
        "nome": "Parceria Agroindustrial",
        "emoji": "🏭",
        "descricao": "Parceria voltada a atividade de beneficiamento/processamento (ex: laticínio, "
                     "abatedouro pequeno, secador de grãos) dentro da propriedade, com divisão de "
                     "resultado entre quem entra com a estrutura e quem entra com a matéria-prima/operação.",
        "quando_usar": "Você tem instalação de processamento (ou capital pra montar) e outro entra "
                       "com a produção primária ou a operação — e dividem o resultado do produto "
                       "beneficiado.",
        "ordem": 3,
        "clausulas": [
            ("Identificação das partes", "Nome completo, CPF/CNPJ e endereço dos dois lados.", True),
            ("Estrutura envolvida", "Máquinas, galpão, licenças/registros necessários — de quem é cada item.", True),
            ("Matéria-prima e origem", "De onde vem o que vai ser processado (produção própria ou de terceiros).", True),
            ("Percentual de divisão", "Sobre o produto final beneficiado, não sobre a matéria-prima bruta.", True),
            ("Responsabilidade sanitária/regulatória", "Quem responde por licenças, vigilância sanitária, registros.", True),
            ("Prazo e renovação", "Por quanto tempo vale o acordo.", True),
        ],
        "alertas": [
            ("Atividade agroindustrial normalmente exige registro/licença sanitária — confirme isso antes de operar, independente do contrato.", "alerta"),
        ],
    },
    {
        "slug": "extrativa",
        "nome": "Parceria Extrativa",
        "emoji": "🌲",
        "descricao": "Parceria pra atividades extrativas (madeira nativa manejada, látex, "
                     "castanha, etc), com divisão do resultado entre o dono da área e quem realiza "
                     "a extração.",
        "quando_usar": "Você tem área com recurso extrativo (mata nativa manejada, seringal, "
                       "castanhal) e outro entra com mão de obra/equipamento de extração.",
        "ordem": 4,
        "clausulas": [
            ("Identificação das partes", "Nome completo, CPF/CNPJ e endereço dos dois lados.", True),
            ("Área e recurso extraído", "Delimitação exata da área e o que será extraído.", True),
            ("Percentual de divisão", "Sobre o volume ou o valor da venda do produto extraído.", True),
            ("Licenciamento ambiental", "Autorização de manejo/extração — obrigatória antes de iniciar.", True),
            ("Limite de extração", "Volume ou período máximo, pra não esgotar o recurso.", True),
            ("Prazo do acordo", "Por quanto tempo vale.", True),
        ],
        "alertas": [
            ("Atividade extrativa em área nativa quase sempre exige autorização/licença ambiental prévia — sem isso, o contrato não protege de multa ambiental.", "proibicao"),
        ],
    },
    {
        "slug": "arrendamento",
        "nome": "Arrendamento Rural",
        "emoji": "📋",
        "descricao": "Um lado paga um valor fixo (em dinheiro ou quantidade fixa de produto) pra "
                     "usar a terra do outro por um período — o resultado da safra (lucro ou "
                     "prejuízo) é só de quem arrenda, não se divide.",
        "quando_usar": "Você quer alugar sua terra por um valor certo, sem se envolver no "
                       "resultado da produção — ou você quer usar a terra de outra pessoa pagando "
                       "um valor fixo, assumindo sozinho o risco da safra.",
        "ordem": 5,
        "clausulas": [
            ("Identificação das partes", "Nome completo, CPF/CNPJ e endereço do proprietário e do arrendatário.", True),
            ("Área arrendada", "Delimitação exata do imóvel/área.", True),
            ("Valor do arrendamento", "Fixo, em dinheiro ou quantidade certa de produto — não varia com a safra.", True),
            ("Forma e data de pagamento", "Quando e como o valor é pago (à vista, parcelado, por safra).", True),
            ("Prazo mínimo legal", "Arrendamento rural tem prazo mínimo conforme a atividade — confirme com um profissional antes de fechar prazos curtos demais.", True),
            ("Uso permitido da terra", "Pra que finalidade o arrendatário pode usar (só lavoura, só pasto, etc).", True),
            ("Benfeitorias", "O que o arrendatário pode construir e o que acontece com isso no fim do contrato.", True),
            ("Devolução do imóvel", "Em que estado a terra deve voltar pro dono.", True),
        ],
        "alertas": [
            ("Não confunda com parceria: aqui o valor é fixo e definido antes — se o pagamento varia conforme o resultado da safra, na verdade é parceria.", "aviso"),
            ("Existe prazo mínimo legal pra arrendamento rural, que varia por tipo de atividade — vale confirmar antes de assinar prazos curtos.", "alerta"),
        ],
    },
    {
        "slug": "comodato",
        "nome": "Comodato Rural",
        "emoji": "🏠",
        "descricao": "Empréstimo gratuito do uso da terra (ou de um bem, como uma casa/galpão na "
                     "propriedade) — sem cobrança nenhuma. Muito comum entre parentes ou como "
                     "gesto de favor.",
        "quando_usar": "Você quer ceder o uso da terra (ou de uma benfeitoria) sem cobrar nada, "
                       "geralmente pra um parente ou alguém de confiança.",
        "ordem": 6,
        "clausulas": [
            ("Identificação das partes", "Nome completo, CPF/CNPJ e endereço do comodante (dono) e do comodatário (quem usa).", True),
            ("O que está sendo emprestado", "Área, casa, galpão — descrição exata.", True),
            ("Gratuidade", "Deixar claro que não há cobrança nenhuma — isso é o que define comodato.", True),
            ("Prazo (ou indeterminado)", "Se tem data pra devolver ou se é por prazo indeterminado.", False),
            ("Responsabilidade por manutenção", "Quem paga conserto, manutenção, conta de luz/água se houver.", True),
            ("Devolução a qualquer momento", "Comodato por prazo indeterminado pode ser encerrado quando o dono pedir — deixe isso claro.", True),
        ],
        "alertas": [
            ("Se em algum momento passar a haver qualquer pagamento (mesmo em produtos ou serviços), o contrato deixa de ser comodato e vira outro tipo — reveja o instrumento.", "aviso"),
        ],
    },
    {
        "slug": "condominio",
        "nome": "Condomínio Rural",
        "emoji": "🤝",
        "descricao": "Duas ou mais pessoas são donas da mesma propriedade ao mesmo tempo, cada "
                     "uma com uma cota (percentual, geralmente proporcional à área que efetivamente "
                     "usa). Não tem um \"dono\" cedendo pra outro — todos são proprietários juntos.",
        "quando_usar": "A propriedade já é (ou vai ser) de mais de uma pessoa — por herança, "
                       "compra conjunta, ou sociedade de fato — e vocês precisam formalizar a cota "
                       "de cada um.",
        "ordem": 7,
        "clausulas": [
            ("Identificação de todos os condôminos", "Nome completo, CPF/CNPJ e endereço de cada proprietário.", True),
            ("Área total e cota de cada um", "Percentual (ou hectares) que cabe a cada condômino.", True),
            ("Uso e ocupação", "Se cada um usa uma parte específica ou se a área é usada em comum.", True),
            ("Divisão de despesas comuns", "Impostos, manutenção de estrada/cerca — como se rateia.", True),
            ("Decisões coletivas", "Como decisões sobre a propriedade são tomadas (maioria, unanimidade).", True),
            ("Saída de um condômino", "O que acontece se um quiser vender sua cota — direito de preferência dos outros.", True),
        ],
        "alertas": [
            ("Condomínio não tem \"outorgante\"/\"outorgado\" — todos são proprietários; se um lado está cedendo uso pro outro em troca de algo, não é condomínio, é parceria ou arrendamento.", "aviso"),
        ],
    },
    {
        "slug": "compra_venda",
        "nome": "Compra e Venda Rural",
        "emoji": "💰",
        "descricao": "Transferência definitiva da propriedade (ou de parte dela) mediante um preço "
                     "único combinado. Depois de assinado e registrado, o vendedor não é mais dono.",
        "quando_usar": "Você quer vender (ou comprar) a propriedade de forma definitiva — não é "
                       "aluguel, não é parceria, é transferência de dono mesmo.",
        "ordem": 8,
        "clausulas": [
            ("Identificação das partes", "Nome completo, CPF/CNPJ e endereço de comprador e vendedor.", True),
            ("Descrição do imóvel", "Matrícula, área, localização exata — igual está no registro.", True),
            ("Preço e forma de pagamento", "Valor total, à vista ou parcelado, e as datas.", True),
            ("Situação de ônus/dívidas", "Se o imóvel tem hipoteca, penhora ou dívida — precisa constar.", True),
            ("Transferência do registro", "Providências pra levar a escritura ao cartório e atualizar a matrícula.", True),
            ("ITBI e demais impostos", "De quem é a responsabilidade de pagar o imposto de transmissão.", True),
        ],
        "alertas": [
            ("Compra e venda de imóvel rural exige escritura pública e registro em cartório — um contrato particular sozinho não transfere a propriedade de forma definitiva.", "proibicao"),
        ],
    },
    {
        "slug": "prestacao_servico",
        "nome": "Prestação de Serviço Rural",
        "emoji": "🚜",
        "descricao": "Contratação de um serviço pontual (mecanização, colheita terceirizada, "
                     "aplicação de defensivo) — não envolve uso da terra nem divisão de resultado, "
                     "é pagamento por um serviço executado.",
        "quando_usar": "Você só precisa contratar um serviço específico (colheita, plantio "
                       "mecanizado, pulverização) sem ceder terra nem dividir resultado da safra.",
        "ordem": 9,
        "clausulas": [
            ("Identificação das partes", "Nome completo, CPF/CNPJ e endereço do contratante e do prestador.", True),
            ("Descrição do serviço", "O que exatamente será feito (ex: colheita de X hectares).", True),
            ("Valor e forma de pagamento", "Por hectare, por hora-máquina, ou valor fechado.", True),
            ("Prazo de execução", "Quando o serviço deve começar e terminar.", True),
            ("Responsabilidade por danos", "Se a máquina do prestador causar dano na lavoura/cerca, de quem é a responsabilidade.", True),
        ],
        "alertas": [
            ("Se o \"prestador\" na prática trabalha só pra você, com horário fixo e subordinação direta, isso pode configurar vínculo empregatício, não prestação de serviço autônoma.", "alerta"),
        ],
    },
]


def seed():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()
    criados, existentes = 0, 0

    for t in TIPOS:
        cur.execute(
            """
            INSERT INTO tipos_contrato_rural (slug, nome, emoji, descricao, quando_usar, ordem)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
            """,
            (t["slug"], t["nome"], t["emoji"], t["descricao"], t["quando_usar"], t["ordem"]),
        )
        row = cur.fetchone()
        if not row:
            cur.execute("SELECT id FROM tipos_contrato_rural WHERE slug = %s", (t["slug"],))
            row = cur.fetchone()
            existentes += 1
        else:
            criados += 1
        tipo_id = row["id"]

        for ordem, (titulo, descricao, obrigatoria) in enumerate(t["clausulas"]):
            cur.execute(
                """
                INSERT INTO clausulas_contrato (tipo_contrato_id, ordem, titulo, descricao, obrigatoria)
                SELECT %s,%s,%s,%s,%s
                WHERE NOT EXISTS (
                    SELECT 1 FROM clausulas_contrato WHERE tipo_contrato_id = %s AND titulo = %s
                )
                """,
                (tipo_id, ordem, titulo, descricao, obrigatoria, tipo_id, titulo),
            )

        for texto, nivel in t["alertas"]:
            cur.execute(
                """
                INSERT INTO alertas_contrato (tipo_contrato_id, texto, nivel)
                SELECT %s,%s,%s
                WHERE NOT EXISTS (
                    SELECT 1 FROM alertas_contrato WHERE tipo_contrato_id = %s AND texto = %s
                )
                """,
                (tipo_id, texto, nivel, tipo_id, texto),
            )

    conn.commit()
    conn.close()
    print(f"Tipos criados: {criados} | já existentes: {existentes} | total processado: {len(TIPOS)}")


if __name__ == "__main__":
    seed()
