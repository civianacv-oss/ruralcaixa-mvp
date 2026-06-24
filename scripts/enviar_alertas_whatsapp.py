import os
import json
import requests
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timezone

# Configurações do Banco de Dados
DATABASE_URL = os.getenv("DATABASE_URL")

# Configurações da Meta Cloud API (WhatsApp)
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID")
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v18.0")
WHATSAPP_TEMPLATE_NAME = os.getenv("WHATSAPP_TEMPLATE_NAME", "alerta_piscicultura")

# Configuração do Ambiente
DRY_RUN = os.getenv("DRY_RUN", "0") == "1"

def get_db_connection():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL não configurada no ambiente.")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def log_info(msg, data=None):
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "INFO",
        "message": msg
    }
    if data:
        log_entry["data"] = data
    print(json.dumps(log_entry))

def log_error(msg, error=None):
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "ERROR",
        "message": msg
    }
    if error:
        log_entry["error"] = str(error)
    print(json.dumps(log_entry))

def enviar_mensagem_whatsapp(telefone, titulo, detalhe, severidade, acao):
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        log_error("Credenciais do WhatsApp não configuradas (WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID).")
        return False
        
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_ID}/messages"
    
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # Formata o telefone (remove caracteres não numéricos)
    telefone_limpo = ''.join(filter(str.isdigit, str(telefone)))
    if not telefone_limpo.startswith('55'):
        telefone_limpo = f"55{telefone_limpo}"
        
    payload = {
        "messaging_product": "whatsapp",
        "to": telefone_limpo,
        "type": "template",
        "template": {
            "name": WHATSAPP_TEMPLATE_NAME,
            "language": {
                "code": "pt_BR"
            },
            "components": [
                {
                    "type": "header",
                    "parameters": [
                        {
                            "type": "text",
                            "text": titulo[:60] # Limite do Meta
                        }
                    ]
                },
                {
                    "type": "body",
                    "parameters": [
                        {
                            "type": "text",
                            "text": detalhe
                        },
                        {
                            "type": "text",
                            "text": "Monitoramento RuralBox"
                        },
                        {
                            "type": "text",
                            "text": severidade
                        },
                        {
                            "type": "text",
                            "text": acao
                        }
                    ]
                }
            ]
        }
    }
    
    if DRY_RUN:
        log_info(f"[DRY RUN] Mensagem que seria enviada para {telefone_limpo}:", payload)
        return True
        
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        log_info(f"Mensagem enviada com sucesso para {telefone_limpo}", response.json())
        return True
    except requests.exceptions.RequestException as e:
        log_error(f"Erro ao enviar WhatsApp para {telefone_limpo}", {
            "error": str(e),
            "response": e.response.text if hasattr(e, 'response') and e.response else None
        })
        return False

def get_acao_recomendada(parametro, nivel):
    acoes = {
        "NH3": {
            "AVISO": "Monitorar consumo de ração e aumentar aeração.",
            "CRÍTICO": "Reduzir arraçoamento IMEDIATAMENTE. Aumentar renovação de água e aeração. Verificar eficiência do biofiltro."
        },
        "NO2": {
            "AVISO": "Adicionar sal comum (cloreto de sódio) para evitar toxicidade.",
            "CRÍTICO": "Suspender arraçoamento. Aumentar renovação de água e aplicar sal comum IMEDIATAMENTE."
        }
    }
    return acoes.get(parametro, {}).get(nivel, "Verificar condições do viveiro.")

def buscar_contatos_imovel(conn, imovel_id):
    with conn.cursor() as cur:
        # Tenta buscar da tabela contatos_imovel primeiro
        cur.execute("""
            SELECT telefone, nome 
            FROM contatos_imovel 
            WHERE imovel_id = %s AND recebe_alertas = TRUE
        """, (imovel_id,))
        
        contatos = cur.fetchall()
        
        if contatos:
            return [(c['telefone'], c['nome']) for c in contatos if c['telefone']]
            
        # Se não achar, busca o gestor_whatsapp da tabela imoveis_rurais
        cur.execute("""
            SELECT gestor_whatsapp, gestor_nome 
            FROM imoveis_rurais 
            WHERE id = %s
        """, (imovel_id,))
        
        imovel = cur.fetchone()
        
        if imovel and imovel['gestor_whatsapp']:
            return [(imovel['gestor_whatsapp'], imovel['gestor_nome'])]
            
        return []

def processar_alertas_pendentes():
    log_info("Iniciando processamento de alertas pendentes para WhatsApp")
    
    try:
        conn = get_db_connection()
    except Exception as e:
        log_error("Falha ao conectar ao banco de dados", e)
        return

    try:
        with conn.cursor() as cur:
            # Busca alertas críticos não resolvidos e não notificados
            # Nota: Assumimos que foi adicionada uma coluna 'notificado_whatsapp' na tabela de alertas
            cur.execute("""
                SELECT 
                    a.id as alerta_id,
                    a.parametro,
                    a.valor,
                    a.nivel,
                    c.nome as ciclo_nome,
                    c.imovel_id
                FROM piscicultura_alertas a
                JOIN piscicultura_ciclos c ON a.ciclo_id = c.id
                WHERE a.nivel = 'CRÍTICO' 
                AND a.resolvido = FALSE
                AND a.notificado_whatsapp = FALSE
            """)
            
            alertas = cur.fetchall()
            
            for alerta in alertas:
                if not alerta['imovel_id']:
                    log_error(f"Alerta {alerta['alerta_id']} sem imovel_id associado ao ciclo.")
                    continue
                    
                contatos = buscar_contatos_imovel(conn, alerta['imovel_id'])
                
                if not contatos:
                    log_info(f"Nenhum contato encontrado para o imóvel {alerta['imovel_id']}.")
                    continue
                    
                titulo = f"{alerta['parametro']} Crítico!"
                detalhe = f"Ciclo {alerta['ciclo_nome']}: {alerta['parametro']} = {alerta['valor']} mg/L"
                acao = get_acao_recomendada(alerta['parametro'], alerta['nivel'])
                
                sucesso_geral = False
                
                for telefone, nome in contatos:
                    log_info(f"Enviando alerta para {nome} ({telefone})")
                    sucesso = enviar_mensagem_whatsapp(
                        telefone, 
                        titulo, 
                        detalhe, 
                        "🔴 CRÍTICO", 
                        acao
                    )
                    if sucesso:
                        sucesso_geral = True
                
                # Marca como notificado se enviou para pelo menos um contato
                if sucesso_geral and not DRY_RUN:
                    cur.execute("""
                        UPDATE piscicultura_alertas 
                        SET notificado_whatsapp = TRUE 
                        WHERE id = %s
                    """, (alerta['alerta_id'],))
                    conn.commit()
                    
    except Exception as e:
        conn.rollback()
        log_error("Erro durante o processamento de alertas", e)
    finally:
        conn.close()

if __name__ == "__main__":
    processar_alertas_pendentes()
