from lxml import etree
from datetime import datetime

def gerar_xml_nfe(dados_nota, emitente, destinatario):
    ns = "http://www.portalfiscal.inf.br/nfe"
    nfe = etree.Element("NFe", xmlns=ns )
    infNFe = etree.SubElement(nfe, "infNFe", Id="NFe" + "212605" + "0" * 38, versao="4.00")
    
    # 1. Identificacao
    ide = etree.SubElement(infNFe, "ide")
    etree.SubElement(ide, "cUF").text = "21"
    etree.SubElement(ide, "natOp").text = dados_nota["natureza_operacao"]
    etree.SubElement(ide, "mod").text = "55"
    etree.SubElement(ide, "nNF").text = str(dados_nota["numero"])
    etree.SubElement(ide, "dhEmi").text = datetime.now().strftime("%Y-%m-%dT%H:%M:%S-03:00")
    etree.SubElement(ide, "tpAmb").text = "2"
    
    # 2. Emitente
    emit = etree.SubElement(infNFe, "emit")
    etree.SubElement(emit, "CNPJ").text = emitente["cnpj"]
    etree.SubElement(emit, "xNome").text = emitente["nome"]
    
    # 3. Destinatario
    dest = etree.SubElement(infNFe, "dest")
    etree.SubElement(dest, "CNPJ").text = destinatario["documento"]
    etree.SubElement(dest, "xNome").text = destinatario["razao_social"]
    
    # 4. Detalhamento (Itens)
    for i, item in enumerate(dados_nota["itens"], start=1):
        det = etree.SubElement(infNFe, "det", nItem=str(i))
        prod = etree.SubElement(det, "prod")
        etree.SubElement(prod, "xProd").text = item["descricao"]
        etree.SubElement(prod, "vProd").text = f"{(item['quantidade'] * item['valor_unitario']):.2f}"
    
    # 5. Total (OBRIGATÓRIO)
    total = etree.SubElement(infNFe, "total")
    ICMSTot = etree.SubElement(total, "ICMSTot")
    etree.SubElement(ICMSTot, "vProd").text = f"{dados_nota['valor_total']:.2f}"
    etree.SubElement(ICMSTot, "vNF").text = f"{dados_nota['valor_total']:.2f}"
    
    return etree.tostring(nfe, encoding="utf-8", pretty_print=True).decode("utf-8")

if __name__ == "__main__":
    emitente = {"cnpj": "12345678000100", "nome": "FARMACIA VILA SAMARA"}
    destinatario = {"documento": "00000000000191", "razao_social": "COMPRADOR TESTE"}
    dados_nota = {"numero": 1, "natureza_operacao": "VENDA", "valor_total": 100.0, "itens": [{"descricao": "SOJA", "quantidade": 10, "valor_unitario": 10.0}]}
    print(gerar_xml_nfe(dados_nota, emitente, destinatario))
