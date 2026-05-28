from lxml import etree

class NFeProcessor:
    @staticmethod
    def verificar_disponibilidade(xml_retorno):
        try:
            tree = etree.fromstring(xml_retorno.encode('utf-8'))
            ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
            cStat = tree.xpath('//nfe:retConsStatServ/nfe:cStat', namespaces=ns )
            if cStat and cStat[0].text == "107":
                return True, "Serviço em Operação"
            motivo = tree.xpath('//nfe:retConsStatServ/nfe:xMotivo', namespaces=ns)
            return False, motivo[0].text if motivo else "Erro desconhecido"
        except Exception as e:
            return False, f"Erro ao ler resposta da SEFAZ: {e}"
