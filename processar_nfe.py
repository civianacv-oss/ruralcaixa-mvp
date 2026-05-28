import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

# Configurações do Banco de Dados
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERRO: DATABASE_URL não encontrada no seu arquivo .env")
    exit()

engine = create_engine(DATABASE_URL)

def processar_e_inserir():
    print("--- Iniciando Processamento da NF-e ---")
    
    # Dados extraídos da imagem da DANFE (Pés Sem Dor)
    lancamento = {
        "produtor_id": 1,
        "tipo": "despesa",
        "conta_codigo": "3.1.5",
        "descricao": "NF-e 371766: Pés Sem Dor (Chinelo e Palmilha Lily)",
        "valor": 1200.00,
        "data_lancamento": "2026-01-09",
        "confirmado": True,
        "atividade": "rural"
    }

    with engine.connect() as connection:
        try:
            query = text("""
                INSERT INTO lancamentos (
                    produtor_id, tipo, conta_codigo, descricao, valor, 
                    data_lancamento, confirmado, atividade
                ) VALUES (
                    :produtor_id, :tipo, :conta_codigo, :descricao, :valor, 
                    :data_lancamento, :confirmado, :atividade
                )
            """)
            connection.execute(query, lancamento)
            connection.commit()
            print("✅ SUCESSO: Lançamento de R$ 1.200,00 inserido no banco Railway!")
        except Exception as e:
            connection.rollback()
            print(f"❌ ERRO ao inserir no banco: {e}")

if __name__ == "__main__":
    processar_e_inserir()
