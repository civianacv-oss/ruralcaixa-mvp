FROM python:3.11-slim

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar requirements do serviço monitor
COPY monitor-service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o script de monitoramento e o serviço scheduler
COPY scripts/monitor_amonia_nitrito.py /app/scripts/monitor_amonia_nitrito.py
COPY monitor-service/scheduler.py /app/monitor-service/scheduler.py

# Criar diretório de logs
RUN mkdir -p /app/logs

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8080

CMD ["python3", "monitor-service/scheduler.py"]
