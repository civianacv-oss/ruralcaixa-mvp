import os
import requests
from lxml import etree
from cryptography.hazmat.primitives.serialization.pkcs12 import load_key_and_certificates
from cryptography.hazmat.backends import default_backend
import tempfile

class SefazService:
    def __init__(self, cert_path, cert_password, ambiente=2):
        self.cert_path = cert_path
        self.cert_password = cert_password.encode()
        self.ambiente = ambiente
        self.urls = self._get_urls()

    def _get_urls(self):
        base = "hom.sefazvirtual.fazenda.gov.br" if self.ambiente == 2 else "www.sefazvirtual.fazenda.gov.br"
        return {
            "status": f"https://{base}/NFeStatusServico4/NFeStatusServico4.asmx"
        }

    def _create_soap_envelope(self, body_xml ):
        envelope = etree.Element("{http://www.w3.org/2003/05/soap-envelope}Envelope", nsmap={
            'soap': "http://www.w3.org/2003/05/soap-envelope"
        } )
        etree.SubElement(envelope, "{http://www.w3.org/2003/05/soap-envelope}Header" )
        body = etree.SubElement(envelope, "{http://www.w3.org/2003/05/soap-envelope}Body" )
        body.append(etree.fromstring(body_xml))
        return etree.tostring(envelope, encoding='unicode')

    def _get_client_cert(self):
        with open(self.cert_path, "rb") as f:
            pfx_data = f.read()
        private_key, certificate, _ = load_key_and_certificates(pfx_data, self.cert_password, default_backend())
        cert_file = tempfile.NamedTemporaryFile(delete=False)
        key_file = tempfile.NamedTemporaryFile(delete=False)
        from cryptography.hazmat.primitives import serialization
        cert_file.write(certificate.public_bytes(serialization.Encoding.PEM))
        key_file.write(private_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
        cert_file.close()
        key_file.close()
        return cert_file.name, key_file.name

    def consultar_status(self):
        xml_status = f'<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>{self.ambiente}</tpAmb><cUF>21</cUF><xServ>STATUS</xServ></consStatServ>'
        url = self.urls["status"]
        soap_xml = self._create_soap_envelope(xml_status )
        cert_p, key_p = self._get_client_cert()
        try:
            headers = {'Content-Type': 'application/soap+xml; charset=utf-8'}
            response = requests.post(url, data=soap_xml, headers=headers, cert=(cert_p, key_p), timeout=30)
            return response.text
        finally:
            os.unlink(cert_p)
            os.unlink(key_p)
