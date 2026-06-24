# Monitor de Amônia e Nitrito - RuralBox
# Script PowerShell para GitHub Actions (Windows Runner)
# Conecta ao PostgreSQL, busca leituras problemáticas e registra alertas

param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [double]$NH3_AVISO = [double]($env:NH3_AVISO ?? 0.3),
    [double]$NH3_CRITICO = [double]($env:NH3_CRITICO ?? 0.5),
    [double]$NO2_AVISO = [double]($env:NO2_AVISO ?? 0.1),
    [double]$NO2_CRITICO = [double]($env:NO2_CRITICO ?? 0.2),
    [int]$JANELA_HORAS = [int]($env:JANELA_HORAS ?? 24)
)

# Função para log estruturado em JSON
function Write-Log {
    param(
        [string]$Level = "INFO",
        [string]$Message,
        [hashtable]$Data = @{}
    )
    
    $logEntry = @{
        timestamp = (Get-Date -Format "o")
        level = $Level
        message = $Message
    }
    
    if ($Data.Count -gt 0) {
        $logEntry["data"] = $Data
    }
    
    $logEntry | ConvertTo-Json -Compress | Write-Host
}

# Função para conectar ao PostgreSQL
function Get-DatabaseConnection {
    param([string]$ConnectionString)
    
    if ([string]::IsNullOrEmpty($ConnectionString)) {
        Write-Log -Level "ERROR" -Message "DATABASE_URL não configurada no ambiente."
        throw "DATABASE_URL não configurada"
    }
    
    try {
        $connection = New-Object Npgsql.NpgsqlConnection($ConnectionString)
        $connection.Open()
        return $connection
    }
    catch {
        Write-Log -Level "ERROR" -Message "Falha ao conectar ao banco de dados" -Data @{ error = $_.Exception.Message }
        throw
    }
}

# Função para classificar leitura conforme limites EMBRAPA
function Get-AlertasClassificacao {
    param(
        [double]$Amonia,
        [double]$Nitrito
    )
    
    $alertas = @()
    
    if ($null -ne $Amonia) {
        if ($Amonia -ge $NH3_CRITICO) {
            $alertas += @{
                parametro = "NH3"
                valor = $Amonia
                nivel = "CRÍTICO"
                limite = $NH3_CRITICO
            }
        }
        elseif ($Amonia -ge $NH3_AVISO) {
            $alertas += @{
                parametro = "NH3"
                valor = $Amonia
                nivel = "AVISO"
                limite = $NH3_AVISO
            }
        }
    }
    
    if ($null -ne $Nitrito) {
        if ($Nitrito -ge $NO2_CRITICO) {
            $alertas += @{
                parametro = "NO2"
                valor = $Nitrito
                nivel = "CRÍTICO"
                limite = $NO2_CRITICO
            }
        }
        elseif ($Nitrito -ge $NO2_AVISO) {
            $alertas += @{
                parametro = "NO2"
                valor = $Nitrito
                nivel = "AVISO"
                limite = $NO2_AVISO
            }
        }
    }
    
    return $alertas
}

# Função para registrar alerta no banco
function Register-Alerta {
    param(
        [object]$Connection,
        [int]$CicloId,
        [int]$LeituraId,
        [string]$Parametro,
        [double]$Valor,
        [string]$Nivel
    )
    
    try {
        # Verifica se já existe alerta para esta leitura e parâmetro
        $checkCmd = $Connection.CreateCommand()
        $checkCmd.CommandText = "SELECT id FROM piscicultura_alertas WHERE leitura_id = @leitura_id AND parametro = @parametro"
        $checkCmd.Parameters.AddWithValue("@leitura_id", $LeituraId) | Out-Null
        $checkCmd.Parameters.AddWithValue("@parametro", $Parametro) | Out-Null
        
        $existingAlert = $checkCmd.ExecuteScalar()
        
        if ($null -ne $existingAlert) {
            return $false # Alerta já registrado
        }
        
        # Insere novo alerta
        $insertCmd = $Connection.CreateCommand()
        $insertCmd.CommandText = @"
            INSERT INTO piscicultura_alertas (ciclo_id, leitura_id, parametro, valor, nivel, data_alerta)
            VALUES (@ciclo_id, @leitura_id, @parametro, @valor, @nivel, NOW())
            RETURNING id
"@
        $insertCmd.Parameters.AddWithValue("@ciclo_id", $CicloId) | Out-Null
        $insertCmd.Parameters.AddWithValue("@leitura_id", $LeituraId) | Out-Null
        $insertCmd.Parameters.AddWithValue("@parametro", $Parametro) | Out-Null
        $insertCmd.Parameters.AddWithValue("@valor", $Valor) | Out-Null
        $insertCmd.Parameters.AddWithValue("@nivel", $Nivel) | Out-Null
        
        $insertCmd.ExecuteScalar() | Out-Null
        return $true
    }
    catch {
        Write-Log -Level "ERROR" -Message "Erro ao registrar alerta" -Data @{ error = $_.Exception.Message }
        return $false
    }
}

# Função principal de monitoramento
function Invoke-Monitor {
    Write-Log -Message "Iniciando monitoramento. Janela: $JANELA_HORAS horas"
    
    $connection = $null
    
    try {
        $connection = Get-DatabaseConnection -ConnectionString $DatabaseUrl
        
        # Busca leituras recentes em ciclos ativos
        $cmd = $connection.CreateCommand()
        $cmd.CommandText = @"
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
            AND l.data_medicao >= NOW() - INTERVAL '$JANELA_HORAS hours'
            AND (l.amonia >= @nh3_aviso OR l.nitrito >= @no2_aviso)
"@
        $cmd.Parameters.AddWithValue("@nh3_aviso", $NH3_AVISO) | Out-Null
        $cmd.Parameters.AddWithValue("@no2_aviso", $NO2_AVISO) | Out-Null
        
        $reader = $cmd.ExecuteReader()
        $leituras = @()
        
        while ($reader.Read()) {
            $leituras += @{
                leitura_id = $reader["leitura_id"]
                ciclo_id = $reader["ciclo_id"]
                ciclo_nome = $reader["ciclo_nome"]
                especie = $reader["especie"]
                data_medicao = $reader["data_medicao"]
                amonia = if ($reader["amonia"] -is [DBNull]) { $null } else { [double]$reader["amonia"] }
                nitrito = if ($reader["nitrito"] -is [DBNull]) { $null } else { [double]$reader["nitrito"] }
            }
        }
        
        $reader.Close()
        
        $alertasGerados = 0
        
        foreach ($leitura in $leituras) {
            $problemas = Get-AlertasClassificacao -Amonia $leitura.amonia -Nitrito $leitura.nitrito
            
            foreach ($problema in $problemas) {
                $registrado = Register-Alerta -Connection $connection `
                    -CicloId $leitura.ciclo_id `
                    -LeituraId $leitura.leitura_id `
                    -Parametro $problema.parametro `
                    -Valor $problema.valor `
                    -Nivel $problema.nivel
                
                if ($registrado) {
                    $alertasGerados++
                    Write-Log -Message "Novo alerta registrado" -Data @{
                        ciclo = $leitura.ciclo_nome
                        especie = $leitura.especie
                        parametro = $problema.parametro
                        valor = $problema.valor
                        nivel = $problema.nivel
                    }
                }
            }
        }
        
        Write-Log -Message "Monitoramento concluído. $($leituras.Count) leituras analisadas, $alertasGerados novos alertas registrados."
    }
    catch {
        Write-Log -Level "ERROR" -Message "Erro durante o monitoramento" -Data @{ error = $_.Exception.Message }
        exit 1
    }
    finally {
        if ($null -ne $connection) {
            $connection.Close()
            $connection.Dispose()
        }
    }
}

# Executar monitoramento
Invoke-Monitor
