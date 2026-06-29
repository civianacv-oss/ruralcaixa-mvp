# RuralCaixa - TODO

## Abordagem: Frontend conectado à API Railway existente

## Fase 1: Schema e Estrutura Base
- [x] Criar todo.md
- [x] Definir cliente da API Railway (client/src/lib/api.ts)
- [x] Criar hook useRuralAuth para autenticação via localStorage

## Fase 2: Autenticação por CPF
- [x] Login por CPF consultando API Railway (/produtores)
- [x] Sessão salva em localStorage (rc_produtor_id, rc_produtor_nome, rc_imovel_id)
- [x] Logout limpa sessão e redireciona para /login
- [x] Proteção de rotas via ProtectedRoute

## Fase 3: Tela de Login
- [x] Construir tela de login elegante com campo CPF
- [x] Formatação automática de CPF (000.000.000-00)
- [x] Validação de CPF no frontend
- [x] Feedback de erro claro e estilizado
- [x] Animações suaves de entrada (fadeInUp, shake)

## Fase 4: Dashboard Principal
- [x] Layout RuralLayout com sidebar elegante e logo RuralCaixa
- [x] Cards de resumo do rebanho por espécie (ovinos, caprinos, suínos, bovinos)
- [x] Gráfico de distribuição do rebanho (PieChart recharts)
- [x] Cards de alertas sanitários, partos e abates (30d)
- [x] Resumo financeiro rápido (receitas vs despesas)

## Fase 5: Módulo de Animais
- [x] Listagem de animais com filtro por espécie (tabs)
- [x] Busca por brinco, nome, raça
- [x] Tabela com status colorido, sexo, peso, lote

## Fase 6: Módulo de Saúde
- [x] Listagem de próximos eventos sanitários por espécie
- [x] Destaque para eventos vencidos e próximos 7 dias
- [x] Cards de resumo (total, vencidos, próximos 7d)

## Fase 7: Módulo Reprodutivo
- [x] Listagem de fêmeas prenhas por espécie
- [x] Cálculo de dias restantes para parto
- [x] Cards de resumo (total prenhas, partos 30d, atrasados)

## Fase 8: Módulo Financeiro
- [x] Listagem de lançamentos com filtro por tipo
- [x] Resumo de receitas, despesas e resultado
- [x] Gráfico de fluxo financeiro (BarChart recharts)

## Fase 9: Movimentações
- [x] Histórico de animais filtrado por espécie e status
- [x] Cards de contagem por status (ativo, vendido, morto, abatido)
- [x] Busca por brinco ou nome

## Fase 10: Polimento e Testes
- [x] Revisão visual completa (tipografia Playfair Display + Inter, paleta verde)
- [x] Testes unitários (13 testes passando)
- [x] Responsividade mobile (sidebar colapsável, topbar mobile)
- [x] Checkpoint final e entrega

## Fase 11: Confirmação de Segurança por Telegram/WhatsApp (OTP)
- [x] Criar endpoint tRPC `auth.sendOtp` — gera código de 6 dígitos, armazena em memória com TTL 5min, envia via Telegram ou WhatsApp usando o telefone do produtor
- [x] Criar endpoint tRPC `auth.verifyOtp` — valida o código, retorna token de sessão
- [x] Construir tela de verificação de código OTP (6 dígitos com inputs individuais)
- [x] Integrar fluxo: CPF → OTP enviado → tela de código → dashboard
- [x] Mostrar qual canal foi usado (Telegram ou WhatsApp) e opção de reenvio
