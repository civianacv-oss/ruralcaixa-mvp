# Enviar Alertas WhatsApp - RuralBox
# Script PowerShell para GitHub Actions (Windows Runner)
# Envia notificações de alertas críticos via Meta Cloud API

param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$WhatsAppToken = $env:WHATSAPP_TOKEN,
    [string]$WhatsAppPhoneId = $env:WHATSAPP_PHONE_ID,
    [string]$WhatsAppApiVersion = $env:WHATSAPP_API_VERSION ?? "v18.0",
    [string]$WhatsAppTemplateName = $env:WHATSAPP_TEMPLATE_NAME ?? "alerta_piscicultura",
    [bool]$DryRun = [bool]::Parse($env:DRY_RUN ?? "false")
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

# Função para obter ação recomendada conforme parâmetro e nível
function Get-AcaoRecomendada {
    param(
        [string]$Parametro,
        [string]$Nivel
    )
    
    $acoes = @{
        "NH3" = @{
            "AVISO" = "Monitorar consumo de ração e aumentar aeração."
            "CRÍTICO" = "Reduzir arraçoamento IMEDIATAMENTE. Aumentar renovação de água e aeração. Verificar eficiência do biofiltro."
        }
        "NO2" = @{
            "AVISO" = "Adicionar sal comum (cloreto de sódio) para evitar toxicidade."
            "CRÍTICO" = "Suspender arraçoamento. Aumentar renovação de água e aplicar sal comum IMEDIATAMENTE."
        }
    }
    
    if ($acoes.ContainsKey($Parametro) -and $acoes[$Parametro].ContainsKey($Nivel)) {
        return $acoes[$Parametro][$Nivel]
    }
    
    return "Verificar condições do viveiro."
}

# Função para buscar contatos do imóvel
function Get-ContatosImovel {
    param(
        [object]$Connection,
        [string]$ImovelId
    )
    
    try {
        # Tenta buscar da tabela contatos_imovel primeiro
        $cmd = $Connection.CreateCommand()
        $cmd.CommandText = @"
            SELECT telefone, nome 
            FROM contatos_imovel 
            WHERE imovel_id = @imovel_id AND recebe_alertas = TRUE
"@
        $cmd.Parameters.AddWithValue("@imovel_id", $ImovelId) | Out-Null
        
        $reader = $cmd.ExecuteReader()
        $contatos = @()
        
        while ($reader.Read()) {
            $telefone = $reader["telefone"]
            if (-not [string]::IsNullOrEmpty($telefone)) {
                $contatos += @{
                    telefone = $telefone
                    nome = $reader["nome"]
                }
            }
        }
        
        $reader.Close()
        
        if ($contatos.Count -gt 0) {
            return $contatos
        }
        
        # Se não achar, busca o gestor_whatsapp da tabela imoveis_rurais
        $cmd = $Connection.CreateCommand()
        $cmd.CommandText = @"
            SELECT gestor_whatsapp, gestor_nome 
            FROM imoveis_rurais 
            WHERE id = @imovel_id
"@
        $cmd.Parameters.AddWithValue("@imovel_id", $ImovelId) | Out-Null
        
        $reader = $cmd.ExecuteReader()
        
        if ($reader.Read()) {
            $telefone = $reader["gestor_whatsapp"]
            if (-not [string]::IsNullOrEmpty($telefone)) {
                $reader.Close()
                return @(@{
                    telefone = $telefone
                    nome = $reader["gestor_nome"]
                })
            }
        }
        
        $reader.Close()
        return @()
    }
    catch {
        Write-Log -Level "ERROR" -Message "Erro ao buscar contatos do imóvel" -Data @{ error = $_.Exception.Message }
        return @()
    }
}

# Função para enviar mensagem WhatsApp
function Send-WhatsAppMessage {
    param(
        [string]$Telefone,
        [string]$Titulo,
        [string]$Detalhe,
        [string]$Severidade,
        [string]$Acao
    )
    
    if ([string]::IsNullOrEmpty($WhatsAppToken) -or [string]::IsNullOrEmpty($WhatsAppPhoneId)) {
        Write-Log -Level "ERROR" -Message "Credenciais do WhatsApp não configuradas (WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID)."
        return $false
    }
    
    # Formata o telefone (remove caracteres não numéricos)
    $telefoneLimpo = $Telefone -replace "[^0-9]", ""
    if (-not $telefoneLimpo.StartsWith("55")) {
        $telefoneLimpo = "55$telefoneLimpo"
    }
    
    $url = "https://graph.facebook.com/$WhatsAppApiVersion/$WhatsAppPhoneId/messages"
    
    $headers = @{
        "Authorization" = "Bearer $WhatsAppToken"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        messaging_product = "whatsapp"
        to = $telefoneLimpo
        type = "template"
        template = @{
            name = $WhatsAppTemplateName
            language = @{
                code = "pt_BR"
            }
            components = @(
                @{
                    type = "header"
                    parameters = @(
                        @{
                            type = "text"
                            text = $Titulo.Substring(0, [Math]::Min(60, $Titulo.Length))
                        }
                    )
                },
                @{
                    type = "body"
                    parameters = @(
                        @{ type = "text"; text = $Detalhe },
                        @{ type = "text"; text = "Monitoramento RuralBox" },
                        @{ type = "text"; text = $Severidade },
                        @{ type = "text"; text = $Acao }
                    )
                }
            )
        }
    } | ConvertTo-Json -Depth 10
    
    if ($DryRun) {
        Write-Log -Message "[DRY RUN] Mensagem que seria enviada para $telefoneLimpo" -Data @{ payload = $body }
        return $true
    }
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body
        Write-Log -Message "Mensagem enviada com sucesso para $telefoneLimpo" -Data @{ response = $response }
        return $true
    }
    catch {
        Write-Log -Level "ERROR" -Message "Erro ao enviar WhatsApp para $telefoneLimpo" -Data @{ 
            error = $_.Exception.Message
            response = $_.ErrorDetails.Message
        }
        return $false
    }
}

# Função principal para processar alertas
function Invoke-ProcessarAlertas {
    Write-Log -Message "Iniciando processamento de alertas pendentes para WhatsApp"
    
    $connection = $null
    
    try {
        $connection = Get-DatabaseConnection -ConnectionString $DatabaseUrl
        
        # Busca alertas críticos não resolvidos e não notificados
        $cmd = $connection.CreateCommand()
        $cmd.CommandText = @"
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
"@
        
        $reader = $cmd.ExecuteReader()
        $alertas = @()
        
        while ($reader.Read()) {
            $alertas += @{
                alerta_id = $reader["alerta_id"]
                parametro = $reader["parametro"]
                valor = [double]$reader["valor"]
                nivel = $reader["nivel"]
                ciclo_nome = $reader["ciclo_nome"]
                imovel_id = $reader["imovel_id"]
            }
        }
        
        $reader.Close()
        
        foreach ($alerta in $alertas) {
            if ([string]::IsNullOrEmpty($alerta.imovel_id)) {
                Write-Log -Level "ERROR" -Message "Alerta $($alerta.alerta_id) sem imovel_id associado ao ciclo."
                continue
            }
            
            $contatos = Get-ContatosImovel -Connection $connection -ImovelId $alerta.imovel_id
            
            if ($contatos.Count -eq 0) {
                Write-Log -Message "Nenhum contato encontrado para o imóvel $($alerta.imovel_id)."
                continue
            }
            
            $titulo = "$($alerta.parametro) Crítico!"
            $detalhe = "Ciclo $($alerta.ciclo_nome): $($alerta.parametro) = $($alerta.valor) mg/L"
            $acao = Get-AcaoRecomendada -Parametro $alerta.parametro -Nivel $alerta.nivel
            
            $sucessoGeral = $false
            
            foreach ($contato in $contatos) {
                Write-Log -Message "Enviando alerta para $($contato.nome) ($($contato.telefone))"
                $sucesso = Send-WhatsAppMessage -Telefone $contato.telefone `
                    -Titulo $titulo `
                    -Detalhe $detalhe `
                    -Severidade "🔴 CRÍTICO" `
                    -Acao $acao
                
                if ($sucesso) {
                    $sucessoGeral = $true
                }
            }
            
            # Marca como notificado se enviou para pelo menos um contato
            if ($sucessoGeral -and -not $DryRun) {
                $updateCmd = $connection.CreateCommand()
                $updateCmd.CommandText = "UPDATE piscicultura_alertas SET notificado_whatsapp = TRUE WHERE id = @alerta_id"
                $updateCmd.Parameters.AddWithValue("@alerta_id", $alerta.alerta_id) | Out-Null
                $updateCmd.ExecuteNonQuery() | Out-Null
            }
        }
        
        Write-Log -Message "Processamento de alertas concluído."
    }
    catch {
        Write-Log -Level "ERROR" -Message "Erro durante o processamento de alertas" -Data @{ error = $_.Exception.Message }
        exit 1
    }
    finally {
        if ($null -ne $connection) {
            $connection.Close()
            $connection.Dispose()
        }
    }
}

# Executar processamento
Invoke-ProcessarAlertas
