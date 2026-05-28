import os
from dotenv import load_dotenv
from sefaz_service import SefazService
from nfe_processor import NFeProcessor

# Carrega as configurações do seu .env
load_dotenv()

def testar():
    print("--- Testando Conexão com SEFAZ-MA ---")
    
    cert_path = os.getenv("NFE_CERT_PATH")
    cert_pass = os.getenv("NFE_CERT_PASSWORD")
    
    if not cert_path or not cert_pass:
        print("❌ ERRO: Certificado ou senha não configurados no .env")
        return

    try:
        # Inicializa o serviço (Ambiente 2 = Homologação/Testes)
        sefaz = SefazService(cert_path, cert_pass, ambiente=2)
        
        print("📡 Consultando status do serviço...")
        resposta = sefaz.consultar_status()
        
        disponivel, motivo = NFeProcessor.verificar_disponibilidade(resposta)
        
        if disponivel:
            print(f"✅ SUCESSO: {motivo}")
        else:
            print(f"⚠️ ATENÇÃO: {motivo}")
            
    except Exception as e:
        print(f"❌ ERRO TÉCNICO: {e}")

if __name__ == "__main__":
    testar()
