import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timezone, timedelta

# Configurações de Limites (padrão EMBRAPA)
NH3_AVISO = float(os.getenv("NH3_AVISO", "0.3"))
NH3_CRITICO = float(os.getenv("NH3_CRITICO", "0.5"))
NO2_AVISO = float(os.getenv("NO2_AVISO", "0.1"))
NO2_CRITICO = float(os.getenv("NO2_CRITICO", "0.2"))

JANELA_HORAS = int(os.getenv("JANELA_HORAS", "24"))
DATABASE_URL = os.getenv("DATABASE_URL")

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

def classificar_leitura(amonia, nitrito):
    alertas = []
    
    if amonia is not None:
        if amonia >= NH3_CRITICO:
            alertas.append({"parametro": "NH3", "valor": amonia, "nivel": "CRÍTICO", "limite": NH3_CRITICO})
        elif amonia >= NH3_AVISO:
            alertas.append({"parametro": "NH3", "valor": amonia, "nivel": "AVISO", "limite": NH3_AVISO})
            
    if nitrito is not None:
        if nitrito >= NO2_CRITICO:
            alertas.append({"parametro": "NO2", "valor": nitrito, "nivel": "CRÍTICO", "limite": NO2_CRITICO})
        elif nitrito >= NO2_AVISO:
            alertas.append({"parametro": "NO2", "valor": nitrito, "nivel": "AVISO", "limite": NO2_AVISO})
            
    return alertas

def registrar_alerta(conn, ciclo_id, leitura_id, parametro, valor, nivel):
    try:
        with conn.cursor() as cur:
            # Verifica se já existe alerta para esta leitura e parâmetro
            cur.execute("""
                SELECT id FROM piscicultura_alertas 
                WHERE leitura_id = %s AND parametro = %s
            """, (leitura_id, parametro))
            
            if cur.fetchone():
                return False # Alerta já registrado
                
            # Insere novo alerta
            cur.execute("""
                INSERT INTO piscicultura_alertas (ciclo_id, leitura_id, parametro, valor, nivel, data_alerta)
                VALUES (%s, %s, %s, %s, %s, NOW())
                RETURNING id
            """, (ciclo_id, leitura_id, parametro, valor, nivel))
            
            conn.commit()
            return True
    except Exception as e:
        conn.rollback()
        log_error(f"Erro ao registrar alerta: {e}")
        return False

def monitorar():
    log_info(f"Iniciando monitoramento. Janela: {JANELA_HORAS}h")
    
    try:
        conn = get_db_connection()
    except Exception as e:
        log_error("Falha ao conectar ao banco de dados", e)
        return

    try:
        with conn.cursor() as cur:
            # Busca leituras recentes em ciclos ativos
            cur.execute("""
                SELECT 
                    l.id as leitura_id,
                    l.ciclo_id,
                    c.nome as ciclo_nome,
                    c.especie,
                    l.data_medicao,
                    l.amonia,
                    l.nitrito
                FROM piscicultura_leituras l
                JOIN piscicultura_ciclos c ON l.ciclo_id = c.id
                WHERE c.status = 'ATIVO'
                AND l.data_medicao >= NOW() - INTERVAL '%s hours'
                AND (l.amonia >= %s OR l.nitrito >= %s)
            """, (JANELA_HORAS, NH3_AVISO, NO2_AVISO))
            
            leituras = cur.fetchall()
            
            alertas_gerados = 0
            
            for leitura in leituras:
                problemas = classificar_leitura(leitura['amonia'], leitura['nitrito'])
                
                for prob in problemas:
                    registrado = registrar_alerta(
                        conn, 
                        leitura['ciclo_id'], 
                        leitura['leitura_id'], 
                        prob['parametro'], 
                        prob['valor'], 
                        prob['nivel']
                    )
                    
                    if registrado:
                        alertas_gerados += 1
                        log_info("Novo alerta registrado", {
                            "ciclo": leitura['ciclo_nome'],
                            "especie": leitura['especie'],
                            "parametro": prob['parametro'],
                            "valor": float(prob['valor']),
                            "nivel": prob['nivel']
                        })
                        
            log_info(f"Monitoramento concluído. {len(leituras)} leituras analisadas, {alertas_gerados} novos alertas registrados.")
            
    except Exception as e:
        log_error("Erro durante o monitoramento", e)
    finally:
        conn.close()

if __name__ == "__main__":
    monitorar()
