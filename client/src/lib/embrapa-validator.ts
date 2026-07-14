// ============================================
// VALIDAÇÕES COM BASE NA EMBRAPA (dados de referência/exemplo)
// ============================================
//
// ⚠️ Os dados abaixo são de exemplo/referência geral, não uma extração direta
// de publicações oficiais da Embrapa — sirva-se deles como ponto de partida,
// mas confira com um agrônomo/zoneamento agrícola oficial antes de decisões
// de investimento. As datas de época de plantio/colheita são comparadas por
// mês/dia (ignorando o ano), já que são recorrentes todo ano.

interface ValidacaoEmbrapa {
    cultura: string;
    regiao: string;
    epoca_plantio: {
        inicio: string; // MM-DD
        fim: string;    // MM-DD
    };
    epoca_colheita: {
        inicio: string; // MM-DD
        fim: string;    // MM-DD
    };
    ciclo_dias: {
        min: number;
        max: number;
        ideal: number;
    };
    temperatura: {
        min: number;
        max: number;
        ideal: number;
    };
    precipitacao: {
        min: number;
        max: number;
        ideal: number;
    };
    altitude: {
        min: number;
        max: number;
        ideal: number;
    };
    solo: {
        ph: { min: number; max: number; ideal: number };
        materia_organica: { min: number; max: number; ideal: number };
    };
    espacamento: {
        linhas: number;
        plantas: number;
    };
    produtividade_esperada: number;
    referencias: string[];
}

// ============================================
// BASE DE DADOS EMBRAPA (Exemplo — 6 culturas principais)
// ============================================

export const dadosEmbrapa: Record<string, ValidacaoEmbrapa> = {
    'soja': {
        cultura: 'Soja',
        regiao: 'Centro-Oeste',
        epoca_plantio: { inicio: '10-01', fim: '12-15' },
        epoca_colheita: { inicio: '02-01', fim: '04-30' },
        ciclo_dias: { min: 90, max: 160, ideal: 120 },
        temperatura: { min: 20, max: 35, ideal: 28 },
        precipitacao: { min: 600, max: 1200, ideal: 800 },
        altitude: { min: 200, max: 1200, ideal: 600 },
        solo: {
            ph: { min: 5.5, max: 7.0, ideal: 6.2 },
            materia_organica: { min: 2, max: 5, ideal: 3.5 },
        },
        espacamento: { linhas: 45, plantas: 280000 },
        produtividade_esperada: 3600,
        referencias: [
            'Embrapa - Tecnologias de Produção de Soja',
            'Embrapa - Zoneamento Agrícola de Risco Climático'
        ],
    },
    'milho': {
        cultura: 'Milho',
        regiao: 'Centro-Oeste',
        epoca_plantio: { inicio: '09-01', fim: '11-30' },
        epoca_colheita: { inicio: '01-15', fim: '04-15' },
        ciclo_dias: { min: 100, max: 180, ideal: 140 },
        temperatura: { min: 18, max: 38, ideal: 27 },
        precipitacao: { min: 500, max: 1500, ideal: 900 },
        altitude: { min: 100, max: 1500, ideal: 500 },
        solo: {
            ph: { min: 5.0, max: 7.5, ideal: 6.0 },
            materia_organica: { min: 1.5, max: 5, ideal: 3.0 },
        },
        espacamento: { linhas: 70, plantas: 60000 },
        produtividade_esperada: 8000,
        referencias: [
            'Embrapa - Cultivo do Milho',
            'Embrapa - Zoneamento Agrícola de Risco Climático'
        ],
    },
    'cafe': {
        cultura: 'Café',
        regiao: 'Sudeste',
        epoca_plantio: { inicio: '10-01', fim: '12-31' },
        epoca_colheita: { inicio: '05-01', fim: '08-31' },
        ciclo_dias: { min: 180, max: 365, ideal: 270 },
        temperatura: { min: 18, max: 28, ideal: 22 },
        precipitacao: { min: 1200, max: 2000, ideal: 1600 },
        altitude: { min: 600, max: 1600, ideal: 1000 },
        solo: {
            ph: { min: 5.0, max: 6.5, ideal: 5.8 },
            materia_organica: { min: 2.5, max: 6, ideal: 4.0 },
        },
        espacamento: { linhas: 300, plantas: 8000 },
        produtividade_esperada: 2500,
        referencias: [
            'Embrapa - Café: Do Plantio à Colheita',
            'Embrapa - Zoneamento de Risco para Café'
        ],
    },
    'cana': {
        cultura: 'Cana-de-Açúcar',
        regiao: 'Sudeste',
        epoca_plantio: { inicio: '09-01', fim: '11-30' },
        epoca_colheita: { inicio: '04-01', fim: '11-30' },
        ciclo_dias: { min: 300, max: 730, ideal: 365 },
        temperatura: { min: 22, max: 35, ideal: 28 },
        precipitacao: { min: 1000, max: 2000, ideal: 1500 },
        altitude: { min: 0, max: 800, ideal: 400 },
        solo: {
            ph: { min: 5.0, max: 7.0, ideal: 6.2 },
            materia_organica: { min: 1.5, max: 4.5, ideal: 3.0 },
        },
        espacamento: { linhas: 120, plantas: 20000 },
        produtividade_esperada: 80000,
        referencias: [
            'Embrapa - Cultivo da Cana-de-Açúcar',
            'Embrapa - Zoneamento Agrícola para Cana'
        ],
    },
    'feijao': {
        cultura: 'Feijão',
        regiao: 'Centro-Oeste',
        epoca_plantio: { inicio: '09-01', fim: '11-30' },
        epoca_colheita: { inicio: '12-01', fim: '03-15' },
        ciclo_dias: { min: 60, max: 120, ideal: 85 },
        temperatura: { min: 18, max: 30, ideal: 24 },
        precipitacao: { min: 400, max: 900, ideal: 600 },
        altitude: { min: 200, max: 1200, ideal: 600 },
        solo: {
            ph: { min: 5.5, max: 6.8, ideal: 6.0 },
            materia_organica: { min: 2, max: 5, ideal: 3.0 },
        },
        espacamento: { linhas: 50, plantas: 200000 },
        produtividade_esperada: 2400,
        referencias: [
            'Embrapa - Cultivo do Feijão',
            'Embrapa - Zoneamento Agrícola de Risco Climático'
        ],
    },
    'algodao': {
        cultura: 'Algodão',
        regiao: 'Centro-Oeste',
        epoca_plantio: { inicio: '10-15', fim: '12-15' },
        epoca_colheita: { inicio: '03-01', fim: '07-31' },
        ciclo_dias: { min: 150, max: 250, ideal: 200 },
        temperatura: { min: 20, max: 40, ideal: 30 },
        precipitacao: { min: 800, max: 1500, ideal: 1100 },
        altitude: { min: 100, max: 1200, ideal: 500 },
        solo: {
            ph: { min: 5.5, max: 7.5, ideal: 6.5 },
            materia_organica: { min: 1.5, max: 4, ideal: 2.5 },
        },
        espacamento: { linhas: 80, plantas: 80000 },
        produtividade_esperada: 4500,
        referencias: [
            'Embrapa - Cultivo do Algodão',
            'Embrapa - Zoneamento Agrícola para Algodão'
        ],
    },
};

// Compara uma data (string ISO ou Date) contra uma janela MM-DD recorrente,
// ignorando o ano — trata corretamente janelas que cruzam a virada do ano
// (ex.: colheita de cana de 04-01 a 11-30 não cruza; mas outras culturas podem).
function dentroDaJanelaAnual(dataISO: string, inicioMMDD: string, fimMMDD: string): boolean {
    const d = new Date(dataISO);
    const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (inicioMMDD <= fimMMDD) {
        return mmdd >= inicioMMDD && mmdd <= fimMMDD;
    }
    // janela cruza a virada do ano (ex.: 11-01 a 02-28)
    return mmdd >= inicioMMDD || mmdd <= fimMMDD;
}

export function formatarJanelaMMDD(mmdd: string): string {
    const [mes, dia] = mmdd.split('-');
    const nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${dia}/${nomesMes[parseInt(mes, 10) - 1]}`;
}

// ============================================
// VALIDADOR
// ============================================

export class ValidadorEmbrapa {

    validarCultura(
        nome: string,
        regiao: string,
        dados: {
            epoca_plantio?: string;
            temperatura?: number;
            precipitacao?: number;
            altitude?: number;
            ph_solo?: number;
            materia_organica?: number;
        }
    ): {
        valido: boolean;
        recomendacoes: string[];
        alertas: string[];
        score: number; // 0-100
    } {
        const recomendacoes: string[] = [];
        const alertas: string[] = [];
        let score = 100;
        let valido = true;

        const referencia = dadosEmbrapa[nome.toLowerCase()];
        if (!referencia) {
            return {
                valido: false,
                recomendacoes: [],
                alertas: ['Cultura não encontrada na base de dados da Embrapa'],
                score: 0,
            };
        }

        if (referencia.regiao !== regiao) {
            alertas.push(`⚠️ A cultura ${nome} é recomendada principalmente para a região ${referencia.regiao}`);
            score -= 15;
        }

        if (dados.epoca_plantio) {
            if (!dentroDaJanelaAnual(dados.epoca_plantio, referencia.epoca_plantio.inicio, referencia.epoca_plantio.fim)) {
                alertas.push(`⚠️ Época de plantio recomendada: ${formatarJanelaMMDD(referencia.epoca_plantio.inicio)} a ${formatarJanelaMMDD(referencia.epoca_plantio.fim)}`);
                score -= 20;
            } else {
                recomendacoes.push(`✅ Época de plantio dentro do recomendado pela Embrapa`);
            }
        }

        if (dados.temperatura) {
            if (dados.temperatura < referencia.temperatura.min || dados.temperatura > referencia.temperatura.max) {
                alertas.push(`⚠️ Temperatura recomendada: ${referencia.temperatura.min}°C a ${referencia.temperatura.max}°C (ideal: ${referencia.temperatura.ideal}°C)`);
                score -= 15;
            } else {
                recomendacoes.push(`✅ Temperatura dentro do recomendado pela Embrapa`);
            }
        }

        if (dados.precipitacao) {
            if (dados.precipitacao < referencia.precipitacao.min || dados.precipitacao > referencia.precipitacao.max) {
                alertas.push(`⚠️ Precipitação recomendada: ${referencia.precipitacao.min}mm a ${referencia.precipitacao.max}mm (ideal: ${referencia.precipitacao.ideal}mm)`);
                score -= 15;
            } else {
                recomendacoes.push(`✅ Precipitação dentro do recomendado pela Embrapa`);
            }
        }

        if (dados.altitude) {
            if (dados.altitude < referencia.altitude.min || dados.altitude > referencia.altitude.max) {
                alertas.push(`⚠️ Altitude recomendada: ${referencia.altitude.min}m a ${referencia.altitude.max}m (ideal: ${referencia.altitude.ideal}m)`);
                score -= 10;
            } else {
                recomendacoes.push(`✅ Altitude dentro do recomendado pela Embrapa`);
            }
        }

        if (dados.ph_solo) {
            if (dados.ph_solo < referencia.solo.ph.min || dados.ph_solo > referencia.solo.ph.max) {
                alertas.push(`⚠️ pH recomendado: ${referencia.solo.ph.min} a ${referencia.solo.ph.max} (ideal: ${referencia.solo.ph.ideal})`);
                score -= 15;
            } else {
                recomendacoes.push(`✅ pH do solo dentro do recomendado pela Embrapa`);
            }
        }

        if (dados.materia_organica) {
            if (dados.materia_organica < referencia.solo.materia_organica.min || dados.materia_organica > referencia.solo.materia_organica.max) {
                alertas.push(`⚠️ Matéria orgânica recomendada: ${referencia.solo.materia_organica.min}% a ${referencia.solo.materia_organica.max}% (ideal: ${referencia.solo.materia_organica.ideal}%)`);
                score -= 10;
            } else {
                recomendacoes.push(`✅ Matéria orgânica dentro do recomendado pela Embrapa`);
            }
        }

        if (score < 50) {
            valido = false;
            alertas.push('⚠️ A cultura pode apresentar baixa produtividade na região');
        }

        return {
            valido,
            recomendacoes,
            alertas,
            score: Math.max(0, score),
        };
    }

    recomendarCulturas(
        regiao: string,
        dados: {
            temperatura: number;
            precipitacao: number;
            altitude: number;
            ph_solo: number;
        }
    ): { cultura: string; score: number; produtividade_esperada: number; recomendacao: string }[] {
        const resultados: { cultura: string; score: number; produtividade_esperada: number; recomendacao: string }[] = [];

        Object.values(dadosEmbrapa).forEach(ref => {
            let score = 100;

            if (ref.regiao !== regiao) score -= 20;

            if (dados.temperatura < ref.temperatura.min || dados.temperatura > ref.temperatura.max) {
                score -= 20;
            } else {
                score += 10;
            }

            if (dados.precipitacao < ref.precipitacao.min || dados.precipitacao > ref.precipitacao.max) {
                score -= 20;
            } else {
                score += 10;
            }

            if (dados.altitude < ref.altitude.min || dados.altitude > ref.altitude.max) {
                score -= 15;
            } else {
                score += 5;
            }

            if (dados.ph_solo < ref.solo.ph.min || dados.ph_solo > ref.solo.ph.max) {
                score -= 15;
            } else {
                score += 5;
            }

            if (score >= 50) {
                let recomendacao = 'Potencial médio';
                if (score >= 80) recomendacao = '✅ Excelente potencial';
                else if (score >= 65) recomendacao = '👍 Bom potencial';
                else recomendacao = '⚠️ Potencial limitado';

                resultados.push({
                    cultura: ref.cultura,
                    score,
                    produtividade_esperada: ref.produtividade_esperada,
                    recomendacao,
                });
            }
        });

        return resultados.sort((a, b) => b.score - a.score);
    }
}
