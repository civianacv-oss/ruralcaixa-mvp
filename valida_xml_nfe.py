from lxml import etree
import io
from test_xml import gerar_xml_nfe

def validar_xml(xml_string):
    xsd_content = """
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" 
               targetNamespace="http://www.portalfiscal.inf.br/nfe" 
               elementFormDefault="qualified">
        <xs:element name="NFe">
            <xs:complexType>
                <xs:sequence>
                    <xs:element name="infNFe">
                        <xs:complexType>
                            <xs:sequence>
                                <xs:element name="ide" minOccurs="1"/>
                                <xs:element name="emit" minOccurs="1"/>
                                <xs:element name="dest" minOccurs="1"/>
                                <xs:element name="det" maxOccurs="990"/>
                                <xs:element name="total" minOccurs="1"/>
                            </xs:sequence>
                            <xs:attribute name="Id" type="xs:string" use="required"/>
                            <xs:attribute name="versao" type="xs:string" use="required"/>
                        </xs:complexType>
                    </xs:element>
                </xs:sequence>
            </xs:complexType>
        </xs:element>
    </xs:schema>
    """
    try:
        schema_root = etree.XML(xsd_content )
        schema = etree.XMLSchema(schema_root)
        xml_doc = etree.parse(io.BytesIO(xml_string.encode('utf-8')))
        if schema.validate(xml_doc):
            return True, "XML Valido conforme Schema XSD!"
        else:
            return False, schema.error_log
    except Exception as e:
        return False, str(e)

# Dados de Teste Corrigidos
emitente = {"cnpj": "12345678000100", "nome": "FARMACIA VILA SAMARA"}
destinatario = {"documento": "00000000000191", "razao_social": "COMPRADOR TESTE"}
dados_nota = {
    "numero": 1, 
    "natureza_operacao": "VENDA", 
    "valor_total": 100.0, # Campo adicionado aqui
    "itens": [{"descricao": "SOJA", "quantidade": 10, "valor_unitario": 10.0}]
}

xml_gerado = gerar_xml_nfe(dados_nota, emitente, destinatario)
sucesso, mensagem = validar_xml(xml_gerado)

print("\n--- RESULTADO DA VALIDACAO XSD ---")
if sucesso:
    print(f"SUCESSO: {mensagem}")
else:
    print(f"ERRO DE VALIDACAO:\n{mensagem}")
