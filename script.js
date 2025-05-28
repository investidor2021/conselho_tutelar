// --- START OF FILE script.js ---

// const brasaoBase64 = `data:image/png;base64,...`; // SEU CÓDIGO BASE64 AQUI

const SALARIO_MINIMO_NACIONAL = 1412.00;
const ALIQUOTA_INSS_INDIVIDUAL = 0.11;

const FAIXAS_IRRF = [
 { baseAte: 2259.20, aliquota: 0.0,   deducao: 0.0 },
 { baseAte: 2826.65, aliquota: 0.075, deducao: 169.44 },
 { baseAte: 3751.05, aliquota: 0.15,  deducao: 381.44 },
 { baseAte: 4664.68, aliquota: 0.225, deducao: 662.77 },
 { baseAte: Infinity,aliquota: 0.275, deducao: 896.00 }
];

let calculoAtual = {}; // Objeto para armazenar todos os dados do cálculo atual e projeções

// --- Referências aos Elementos do DOM ---
const btnCalcular = document.getElementById('btnCalcular');
const btnPdf = document.getElementById('btnPdf');
const divResultado = document.getElementById('divResultado');
const resultadoHtml = document.getElementById('resultado');

const fldNome = document.getElementById('conselheiroNome');
const fldReferencia = document.getElementById('referencia');
const fldSalarioBase = document.getElementById('salarioBase');
const fldTetoInss = document.getElementById('tetoInssValor');
const fldFeriasVencidasInput = document.getElementById('feriasVencidas');
const labelSalarioBase = document.getElementById('labelSalarioBase');
const fldFaltas = document.getElementById('faltas');
const groupFaltasContainer = document.getElementById('groupFaltasContainer');
const chkFeriasNormais = document.getElementById('isFerias');
const groupFeriasNormaisContainer = document.getElementById('groupFeriasNormaisContainer');
const chkRescisao = document.getElementById('isRescisao');
const infoRescisaoDiv = document.getElementById('infoRescisao');
const groupRescisaoContainer = document.getElementById('groupRescisaoContainer');

const groupDiasFeriasDiv = document.getElementById('groupDiasFerias');
const fldDiasFeriasGozo = document.getElementById('diasFeriasGozo');
const groupDataInicioFeriasDiv = document.getElementById('groupDataInicioFerias');
const fldDataInicioFerias = document.getElementById('dataInicioFerias');
const fldDataFimFerias = document.getElementById('dataFimFerias');

const rescisaoCamposDiv = document.getElementById('rescisaoCampos');
const fldSaldoSalarioDias = document.getElementById('saldoSalarioDias');
const chkAvisoPrevio = document.getElementById('incluirAvisoPrevio');
const fldMeses13 = document.getElementById('meses13');
const fldMesesFeriasProp = document.getElementById('mesesFeriasProp');

// --- Funções Utilitárias ---
const formatToBRL = (value) => {
    if (isNaN(value) || value === null || value === undefined) return '';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatCurrency = (value) => {
   return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const cleanNumberString = (str) => {
    if (typeof str !== 'string') str = String(str);
    return str.replace(/\./g, '').replace(',', '.');
};

const truncateDecimal = (num, digits) => {
    const multiplier = Math.pow(10, digits);
    return Math.floor(num * multiplier) / multiplier;
};

// --- Funções de Cálculo ---
const calcularINSSContribuinteIndividual = (baseCalculoBruta, tetoInssConfigurado) => {
   if (baseCalculoBruta <= 0) return { valor: 0, baseAjustada: 0 };
   const tetoInssAtual = tetoInssConfigurado > 0 ? tetoInssConfigurado : 1000000;
   let baseAjustadaParaCalculo = baseCalculoBruta;
   if (baseCalculoBruta < SALARIO_MINIMO_NACIONAL && baseCalculoBruta > 0) {
        baseAjustadaParaCalculo = SALARIO_MINIMO_NACIONAL;
   } else if (baseCalculoBruta <=0) {
        baseAjustadaParaCalculo = 0;
   }
   baseAjustadaParaCalculo = Math.min(baseAjustadaParaCalculo, tetoInssAtual);
   let inssCalculado = baseAjustadaParaCalculo * ALIQUOTA_INSS_INDIVIDUAL;
   return {
        valor: truncateDecimal(Math.max(0, inssCalculado), 2),
        baseAjustada: baseAjustadaParaCalculo
    };
};

const calcularIRRF = (baseIrrf) => {
    if (baseIrrf <= 0) return { valor: 0, aliquota: 0, deducao: 0, baseCalculo: Math.max(0, baseIrrf) };
    let irrfCalculado = 0;
    let faixaAplicada = FAIXAS_IRRF[0];
     for (const faixa of FAIXAS_IRRF) {
       if (baseIrrf <= faixa.baseAte) {
           irrfCalculado = (baseIrrf * faixa.aliquota) - faixa.deducao;
           faixaAplicada = faixa;
           break;
       }
    }
   return {
        valor: truncateDecimal(Math.max(0, irrfCalculado), 2),
        aliquota: faixaAplicada.aliquota,
        deducao: faixaAplicada.deducao,
        baseCalculo: baseIrrf
    };
};

function calcularDataFimFerias() {
    const inicioFeriasStr = fldDataInicioFerias.value;
    const diasGozo = parseInt(fldDiasFeriasGozo.value);
    if (inicioFeriasStr && diasGozo > 0) {
        const dataInicio = new Date(inicioFeriasStr + "T00:00:00");
        if (!isNaN(dataInicio.getTime())) {
            const dataFim = new Date(dataInicio);
            dataFim.setDate(dataInicio.getDate() + diasGozo -1);
            fldDataFimFerias.textContent = dataFim.toLocaleDateString('pt-BR');
        } else {
            fldDataFimFerias.textContent = 'Data inválida';
        }
    } else {
        fldDataFimFerias.textContent = '';
    }
}

// --- Lógica Principal de Cálculo ---
function executarCalculo() {
   const nome = fldNome.value;
   const referenciaPagamento = fldReferencia.value;
   const diasFaltaInput = parseInt(fldFaltas.value) || 0;

   if (diasFaltaInput < 0 || diasFaltaInput > 30) {
       alert("O número de dias de falta deve estar entre 0 e 30.");
       fldFaltas.focus();
       return;
   }

   const salarioBaseStr = cleanNumberString(fldSalarioBase.value);
   const tetoInssStr = cleanNumberString(fldTetoInss.value);
   const feriasVencidasStr = cleanNumberString(fldFeriasVencidasInput.value);

   const salarioBaseInput = parseFloat(salarioBaseStr) || 0;
   const tetoInssInformado = parseFloat(tetoInssStr) || 8157.41; // Mantido o valor padrão se não informado
   const valorFeriasVencidasInput = parseFloat(feriasVencidasStr) || 0;

   const isRescisaoChecked = chkRescisao.checked;
   const isFeriasNormaisChecked = chkFeriasNormais.checked;

   if (!nome || !referenciaPagamento || salarioBaseInput <= 0 || tetoInssInformado <= 0) {
      alert("Por favor, preencha Nome, Referência do Pagamento, Salário Base (maior que zero) e Teto INSS (maior que zero).");
      return;
   }

   calculoAtual = {
        nome, referenciaPagamento, salarioBaseInput, tetoInssInformado,
        isRescisao: isRescisaoChecked, isFeriasNormais: isFeriasNormaisChecked,
        pagamentoAtual: { proventos: {}, descontos: {}, totais: {}, baseINSSAjustada: 0, resultadoIRRF: {} },
        pagamentoSaldoMesInicioFerias: null,
        pagamentoSaldoMesTerminoFerias: null
    };
   calculoAtual.diasFaltaPagAtual = diasFaltaInput;

    let htmlResultadoFinal = '';
    let htmlInformativoProximoMes = ''; // <-- CORREÇÃO: Inicialização da variável
    const [anoRefPag, mesRefPag] = referenciaPagamento.split('-').map(Number);
    const mesAnoReferenciaPagamentoFormatado = `${String(mesRefPag).padStart(2, '0')}/${anoRefPag}`;
    htmlResultadoFinal += `<div class="resumo-item"><span>Nome:</span> <span>${nome}</span></div>`;
    htmlResultadoFinal += `<div class="resumo-item"><span>Referência do Pagamento Principal:</span> <span>${mesAnoReferenciaPagamentoFormatado}</span></div>`;

   if (isRescisaoChecked) {
        calculoAtual.tipoCalculo = "RESCISAO";
        htmlResultadoFinal += '<div class="resumo-item"><span>TIPO:</span> <span><b>TERMO DE QUITAÇÃO DE RESCISÃO (Contr. Individual)</b></span></div><hr>';
        const diasSaldo = parseInt(fldSaldoSalarioDias.value) || 0;
        const incluirAviso = chkAvisoPrevio.checked;
        const numMeses13 = parseInt(fldMeses13.value) || 0;
        const numMesesFeriasProp = parseInt(fldMesesFeriasProp.value) || 0;
        const pagAtual = calculoAtual.pagamentoAtual;

        pagAtual.proventos.salarioBaseReferenciaRescisao = salarioBaseInput;
        const valorSaldoSalario = diasSaldo > 0 ? (salarioBaseInput / 30) * diasSaldo : 0;
        if (valorSaldoSalario > 0) pagAtual.proventos.saldoSalario = valorSaldoSalario;
        let valorAvisoPrevio = 0;
        if (incluirAviso) valorAvisoPrevio = salarioBaseInput;
        if (valorAvisoPrevio > 0) pagAtual.proventos.avisoPrevio = valorAvisoPrevio;
        const valor13Proporcional = numMeses13 > 0 ? (salarioBaseInput / 12) * numMeses13 : 0;
        if (valor13Proporcional > 0) pagAtual.proventos.decimoTerceiroProp = valor13Proporcional;
        if (valorFeriasVencidasInput > 0) pagAtual.proventos.feriasVencidas = valorFeriasVencidasInput;
        const valorFeriasPropBase = numMesesFeriasProp > 0 ? (salarioBaseInput / 12) * numMesesFeriasProp : 0;
        const valorUmTercoFeriasProp = valorFeriasPropBase / 3;
        if ((valorFeriasPropBase + valorUmTercoFeriasProp) > 0) {
            pagAtual.proventos.feriasProporcionaisBase = valorFeriasPropBase;
            pagAtual.proventos.umTercoFeriasProporcionais = valorUmTercoFeriasProp;
        }
        pagAtual.totais.proventosBrutos = valorSaldoSalario + valorAvisoPrevio + valor13Proporcional + valorFeriasVencidasInput + valorFeriasPropBase + valorUmTercoFeriasProp;
        const baseINSSRescisao = valorSaldoSalario + valor13Proporcional;
        const resultadoINSSResc = calcularINSSContribuinteIndividual(baseINSSRescisao, tetoInssInformado);
        if (resultadoINSSResc.valor > 0) pagAtual.descontos.inss = resultadoINSSResc.valor;
        pagAtual.baseINSSAjustada = resultadoINSSResc.baseAjustada;
        const baseIRRFRescisao = baseINSSRescisao - (pagAtual.descontos.inss || 0);
        const resultadoIRRFResc = calcularIRRF(baseIRRFRescisao);
        if (resultadoIRRFResc.valor > 0) pagAtual.descontos.irrf = resultadoIRRFResc.valor;
        pagAtual.resultadoIRRF = resultadoIRRFResc; // Salva o objeto completo
        pagAtual.totais.descontos = (pagAtual.descontos.inss || 0) + (pagAtual.descontos.irrf || 0);
        pagAtual.totais.liquido = pagAtual.totais.proventosBrutos - pagAtual.totais.descontos;

        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">PROVENTOS (Rescisão):</p>`;
        if (pagAtual.proventos.salarioBaseReferenciaRescisao) htmlResultadoFinal += `<div class="resumo-item"><span>Salário Base (Ref. Rescisão):</span> <span>${formatCurrency(pagAtual.proventos.salarioBaseReferenciaRescisao)}</span></div>`;
        if (pagAtual.proventos.saldoSalario > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Saldo de Salário (${diasSaldo} dias):</span> <span>${formatCurrency(pagAtual.proventos.saldoSalario)}</span></div>`;
        if (pagAtual.proventos.avisoPrevio > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Aviso Prévio Indenizado:</span> <span>${formatCurrency(pagAtual.proventos.avisoPrevio)}</span></div>`;
        if (pagAtual.proventos.decimoTerceiroProp > 0) htmlResultadoFinal += `<div class="resumo-item"><span>13º Salário Proporcional (${numMeses13}/12):</span> <span>${formatCurrency(pagAtual.proventos.decimoTerceiroProp)}</span></div>`;
        if (pagAtual.proventos.feriasVencidas > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Férias Vencidas + 1/3:</span> <span>${formatCurrency(pagAtual.proventos.feriasVencidas)}</span></div>`;
        if (pagAtual.proventos.feriasProporcionaisBase > 0) {
            htmlResultadoFinal += `<div class="resumo-item"><span>Férias Proporcionais (${numMesesFeriasProp}/12):</span> <span>${formatCurrency(pagAtual.proventos.feriasProporcionaisBase)}</span></div>`;
            htmlResultadoFinal += `<div class="resumo-item"><span>1/3 sobre Férias Proporcionais:</span> <span>${formatCurrency(pagAtual.proventos.umTercoFeriasProporcionais)}</span></div>`;
        }
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pagAtual.totais.proventosBrutos)}</span></div><br>`;
        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS (Rescisão):</p>`;
        if (pagAtual.descontos.inss > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(pagAtual.baseINSSAjustada)}):</span> <span>${formatCurrency(pagAtual.descontos.inss)}</span></div>`;
        if (pagAtual.descontos.irrf > 0) htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(Math.max(0, pagAtual.resultadoIRRF.baseCalculo))}):</span><span>${formatCurrency(pagAtual.descontos.irrf)}<small class="irrf-details">Alíq: ${(pagAtual.resultadoIRRF.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(pagAtual.resultadoIRRF.deducao)}</small></span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pagAtual.totais.descontos)}</span></div><br>`;
        htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pagAtual.totais.liquido)}</span></div>`;

   } else if (isFeriasNormaisChecked) {
        calculoAtual.tipoCalculo = "FERIAS";
        const diasDeFeriasSelecionados = parseInt(fldDiasFeriasGozo.value);
        const dataInicioFeriasStr = fldDataInicioFerias.value;
        if (!dataInicioFeriasStr) { alert("Informe a data de início das férias."); fldDataInicioFerias.focus(); return; }
        const dataInicioFeriasDate = new Date(dataInicioFeriasStr + "T00:00:00");
        if (isNaN(dataInicioFeriasDate.getTime())) { alert("Data de início das férias inválida."); fldDataInicioFerias.focus(); return; }
        const dataFimFeriasDate = new Date(dataInicioFeriasDate);
        dataFimFeriasDate.setDate(dataInicioFeriasDate.getDate() + diasDeFeriasSelecionados -1);

        calculoAtual.diasDeFeriasSelecionados = diasDeFeriasSelecionados;
        calculoAtual.dataInicioFerias = dataInicioFeriasStr;
        calculoAtual.dataFimFerias = dataFimFeriasDate.toLocaleDateString('pt-BR');

        htmlResultadoFinal += `<div class="resumo-item"><span>TIPO:</span> <span><b>RECIBO DE FÉRIAS E SALÁRIOS</b></span></div>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Período de Gozo das Férias:</span> <span>${dataInicioFeriasDate.toLocaleDateString('pt-BR')} a ${calculoAtual.dataFimFerias}</span></div><hr>`;

        const pagAtual = calculoAtual.pagamentoAtual;
        pagAtual.referencia = mesAnoReferenciaPagamentoFormatado;

        let salarioMesAnterior = salarioBaseInput;
        const valorDiaMesAnterior = salarioMesAnterior / 30;
        const descFaltasMesAnterior = valorDiaMesAnterior * calculoAtual.diasFaltaPagAtual;
        salarioMesAnterior -= descFaltasMesAnterior;
        pagAtual.proventos.salarioMesAnterior = salarioMesAnterior;

        const valorFerias = (salarioBaseInput / 30) * diasDeFeriasSelecionados;
        pagAtual.proventos.valorFerias = valorFerias;
        const adicUmTerco = valorFerias / 3;
        pagAtual.proventos.adicionalUmTerco = adicUmTerco;

        pagAtual.totais.proventosBrutos = salarioMesAnterior + valorFerias + adicUmTerco;
        const baseINSSAtual = pagAtual.totais.proventosBrutos;
        const resultadoINSSAtual = calcularINSSContribuinteIndividual(baseINSSAtual, tetoInssInformado);
        if (resultadoINSSAtual.valor > 0) pagAtual.descontos.inss = resultadoINSSAtual.valor;
        pagAtual.baseINSSAjustada = resultadoINSSAtual.baseAjustada;
        const baseIRRFAtual = baseINSSAtual - (pagAtual.descontos.inss || 0);
        const resultadoIRRFAtual = calcularIRRF(baseIRRFAtual);
        if (resultadoIRRFAtual.valor > 0) pagAtual.descontos.irrf = resultadoIRRFAtual.valor;
        pagAtual.resultadoIRRF = resultadoIRRFAtual;
        pagAtual.totais.descontos = (pagAtual.descontos.inss || 0) + (pagAtual.descontos.irrf || 0);
        pagAtual.totais.liquido = pagAtual.totais.proventosBrutos - pagAtual.totais.descontos;

        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">PAGAMENTO ATUAL (Ref. ${pagAtual.referencia}):</p>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Salário Mês Anterior (${pagAtual.referencia}):</span> <span>${formatCurrency(pagAtual.proventos.salarioMesAnterior)}</span></div>`;
        if (calculoAtual.diasFaltaPagAtual > 0) htmlResultadoFinal += `<div class="resumo-item"><span>(Desconto Faltas Mês Anterior: ${calculoAtual.diasFaltaPagAtual}d)</span> <span style="color:red;">(${formatCurrency(descFaltasMesAnterior)})</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Férias (${diasDeFeriasSelecionados} dias):</span> <span>${formatCurrency(pagAtual.proventos.valorFerias)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Adicional 1/3 sobre Férias:</span> <span>${formatCurrency(pagAtual.proventos.adicionalUmTerco)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pagAtual.totais.proventosBrutos)}</span></div><br>`;
        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS:</p>`;
        if (pagAtual.descontos.inss > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(pagAtual.baseINSSAjustada)}):</span> <span>${formatCurrency(pagAtual.descontos.inss)}</span></div>`;
        if (pagAtual.descontos.irrf > 0) htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(Math.max(0, pagAtual.resultadoIRRF.baseCalculo))}):</span><span>${formatCurrency(pagAtual.descontos.irrf)}<small class="irrf-details">Alíq: ${(pagAtual.resultadoIRRF.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(pagAtual.resultadoIRRF.deducao)}</small></span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pagAtual.totais.descontos)}</span></div><br>`;
        htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pagAtual.totais.liquido)}</span></div>`;

        // SALDO MÊS INÍCIO FÉRIAS
        const diaInicioFerias = dataInicioFeriasDate.getDate();
        const mesInicioFerias = dataInicioFeriasDate.getMonth() + 1;
        const anoInicioFerias = dataInicioFeriasDate.getFullYear();
        const diasNoMesInicioFerias = new Date(anoInicioFerias, mesInicioFerias, 0).getDate();
        const mesAnoInicioFeriasFormatado = `${String(mesInicioFerias).padStart(2, '0')}/${anoInicioFerias}`;
        if (diaInicioFerias > 1) {
            const diasTrabalhados = diaInicioFerias - 1;
            const valorDia = salarioBaseInput / diasNoMesInicioFerias; // Correto usar diasNoMesInicioFerias
            const saldo = valorDia * diasTrabalhados;
            calculoAtual.pagamentoSaldoMesInicioFerias = {
                referencia: mesAnoInicioFeriasFormatado,
                proventos: { saldoSalario: saldo },
                descontos: {}, totais: {}, diasTrabalhados
            };
            const pag = calculoAtual.pagamentoSaldoMesInicioFerias;
            pag.totais.proventosBrutos = saldo;
            const resINSS = calcularINSSContribuinteIndividual(saldo, tetoInssInformado);
            if (resINSS.valor > 0) pag.descontos.inss = resINSS.valor;
            pag.baseINSSAjustada = resINSS.baseAjustada;
            const resIRRF = calcularIRRF(saldo - (pag.descontos.inss || 0));
            if (resIRRF.valor > 0) pag.descontos.irrf = resIRRF.valor;
            pag.resultadoIRRF = resIRRF;
            pag.totais.descontos = (pag.descontos.inss || 0) + (pag.descontos.irrf || 0);
            pag.totais.liquido = pag.totais.proventosBrutos - pag.totais.descontos;

            htmlInformativoProximoMes += `<hr style="margin: 15px 0 10px;">`;
            htmlInformativoProximoMes += `<p style="font-weight: bold; margin-bottom: 5px; color: #007bff;">PAGAMENTO SALDO MÊS INÍCIO FÉRIAS (Ref. ${mesAnoInicioFeriasFormatado}):</p>`;
            htmlInformativoProximoMes += `<div class="resumo-item"><span>Saldo de Salário (${diasTrabalhados} dias):</span> <span>${formatCurrency(pag.proventos.saldoSalario)}</span></div>`;
            htmlInformativoProximoMes += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pag.totais.proventosBrutos)}</span></div><br>`;
            htmlInformativoProximoMes += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS:</p>`;
            if (pag.descontos.inss > 0) htmlInformativoProximoMes += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(pag.baseINSSAjustada)}):</span> <span>${formatCurrency(pag.descontos.inss)}</span></div>`;
            if (pag.descontos.irrf > 0) htmlInformativoProximoMes += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(Math.max(0, pag.resultadoIRRF.baseCalculo))}):</span><span>${formatCurrency(pag.descontos.irrf)}<small class="irrf-details">Alíq: ${(pag.resultadoIRRF.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(pag.resultadoIRRF.deducao)}</small></span></div>`;
            htmlInformativoProximoMes += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pag.totais.descontos)}</span></div><br>`;
            htmlInformativoProximoMes += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pag.totais.liquido)}</span></div>`;
        }

        // SALDO MÊS TÉRMINO FÉRIAS
        const mesFimFerias = dataFimFeriasDate.getMonth() + 1;
        const anoFimFerias = dataFimFeriasDate.getFullYear();
        const diaFimFerias = dataFimFeriasDate.getDate();
        const diasNoMesFimFerias = new Date(anoFimFerias, mesFimFerias, 0).getDate();
        const mesAnoFimFeriasFormatado = `${String(mesFimFerias).padStart(2, '0')}/${anoFimFerias}`;
        let diasTrabalhadosMesTermino = 0;
        let saldoSalarioMesTermino = 0;

        // Verifica se as férias terminam antes do fim do mês E se o mês de término é diferente do mês de início (ou se é o mesmo mês mas o início não foi dia 1)
        // Ou se as férias cobrem o mês inteiro de término, mas não é o mesmo mês de início (caso de férias que cruzam meses)
        if ( (mesInicioFerias === mesFimFerias && diaFimFerias < diasNoMesFimFerias && diaInicioFerias > 1) || // Férias dentro do mesmo mês, mas não o mês todo
             (mesInicioFerias === mesFimFerias && diaFimFerias < diasNoMesFimFerias && diaInicioFerias === 1) || // Férias iniciam dia 1 e terminam antes do fim do mês
             (mesInicioFerias !== mesFimFerias && diaFimFerias < diasNoMesFimFerias) // Férias terminam em mês diferente e antes do fim desse mês
           ) {
            diasTrabalhadosMesTermino = diasNoMesFimFerias - diaFimFerias;
            const valorDiaMesFim = salarioBaseInput / diasNoMesFimFerias; // Correto usar diasNoMesFimFerias
            saldoSalarioMesTermino = valorDiaMesFim * diasTrabalhadosMesTermino;
        }


        if (saldoSalarioMesTermino > 0) { // Só processa se houver saldo
            calculoAtual.pagamentoSaldoMesTerminoFerias = {
                referencia: mesAnoFimFeriasFormatado,
                proventos: { saldoSalario: saldoSalarioMesTermino },
                descontos: {}, totais: {}, diasTrabalhados: diasTrabalhadosMesTermino
            };
            const pag = calculoAtual.pagamentoSaldoMesTerminoFerias;
            pag.totais.proventosBrutos = saldoSalarioMesTermino;
            // if(saldoSalarioMesTermino > 0){ // Redundante, já verificado acima
            const resINSS = calcularINSSContribuinteIndividual(saldoSalarioMesTermino, tetoInssInformado);
            if (resINSS.valor > 0) pag.descontos.inss = resINSS.valor;
            pag.baseINSSAjustada = resINSS.baseAjustada;
            const resIRRF = calcularIRRF(saldoSalarioMesTermino - (pag.descontos.inss || 0));
            if (resIRRF.valor > 0) pag.descontos.irrf = resIRRF.valor;
            pag.resultadoIRRF = resIRRF;
            // }
            pag.totais.descontos = (pag.descontos.inss || 0) + (pag.descontos.irrf || 0);
            pag.totais.liquido = pag.totais.proventosBrutos - pag.totais.descontos;

            htmlInformativoProximoMes += `<hr style="margin: 15px 0 10px;">`;
            htmlInformativoProximoMes += `<p style="font-weight: bold; margin-bottom: 5px; color: #007bff;">PAGAMENTO SALDO MÊS TÉRMINO FÉRIAS (Ref. ${mesAnoFimFeriasFormatado}):</p>`;
            if (pag.proventos.saldoSalario > 0) { // Mostrar apenas se houver saldo
                htmlInformativoProximoMes += `<div class="resumo-item"><span>Saldo de Salário (${diasTrabalhadosMesTermino} dias):</span> <span>${formatCurrency(pag.proventos.saldoSalario)}</span></div>`;
            }
            htmlInformativoProximoMes += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pag.totais.proventosBrutos)}</span></div><br>`;
            htmlInformativoProximoMes += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS:</p>`;
            if (pag.descontos.inss > 0) htmlInformativoProximoMes += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(pag.baseINSSAjustada)}):</span> <span>${formatCurrency(pag.descontos.inss)}</span></div>`;
            if (pag.descontos.irrf > 0) htmlInformativoProximoMes += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(Math.max(0, pag.resultadoIRRF.baseCalculo))}):</span><span>${formatCurrency(pag.descontos.irrf)}<small class="irrf-details">Alíq: ${(pag.resultadoIRRF.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(pag.resultadoIRRF.deducao)}</small></span></div>`;
            htmlInformativoProximoMes += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pag.totais.descontos)}</span></div><br>`;
            htmlInformativoProximoMes += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pag.totais.liquido)}</span></div>`;
        } else if (!calculoAtual.pagamentoSaldoMesInicioFerias && htmlInformativoProximoMes === '') { // Apenas se NENHUM pagamento de saldo foi gerado
             htmlInformativoProximoMes = `<hr style="margin: 15px 0 10px;">
                                 <p style="font-weight: bold; margin-bottom: 5px; color: #007bff;">PAGAMENTOS SUBSEQUENTES:</p>
                                 <div class="resumo-item"><span>Nenhum saldo de salário apurado para meses subsequentes.</span></div>`;
        }


   } else { // PAGAMENTO MENSAL NORMAL
        calculoAtual.tipoCalculo = "MENSAL";
        htmlResultadoFinal += '<div class="resumo-item"><span>TIPO:</span> <span><b>PAGAMENTO MENSAL (Contr. Individual)</b></span></div><hr>';
        const pagAtual = calculoAtual.pagamentoAtual;
        pagAtual.referencia = mesAnoReferenciaPagamentoFormatado;

        let salarioMensal = salarioBaseInput;
        pagAtual.proventos.salarioMensalBruto = salarioMensal;
        const valorDia = salarioMensal / 30; // Considera mês comercial de 30 dias para faltas
        const descFaltas = valorDia * diasFaltaInput;
        if (descFaltas > 0) pagAtual.descontos.faltas = descFaltas;
        pagAtual.totais.proventosBrutos = salarioMensal;
        const baseINSSMensal = pagAtual.totais.proventosBrutos - (pagAtual.descontos.faltas || 0);
        const resultadoINSSMensal = calcularINSSContribuinteIndividual(baseINSSMensal, tetoInssInformado);
        if (resultadoINSSMensal.valor > 0) pagAtual.descontos.inss = resultadoINSSMensal.valor;
        pagAtual.baseINSSAjustada = resultadoINSSMensal.baseAjustada;
        const baseIRRFMensal = baseINSSMensal - (pagAtual.descontos.inss || 0);
        const resultadoIRRFMensal = calcularIRRF(baseIRRFMensal);
        if (resultadoIRRFMensal.valor > 0) pagAtual.descontos.irrf = resultadoIRRFMensal.valor;
        pagAtual.resultadoIRRF = resultadoIRRFMensal;
        pagAtual.totais.descontos = (pagAtual.descontos.faltas || 0) + (pagAtual.descontos.inss || 0) + (pagAtual.descontos.irrf || 0);
        pagAtual.totais.liquido = pagAtual.totais.proventosBrutos - pagAtual.totais.descontos;

        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">PROVENTOS (Pagamento Atual):</p>`;
        if (pagAtual.proventos.salarioMensalBruto) htmlResultadoFinal += `<div class="resumo-item"><span>Salário Base Mensal (${pagAtual.referencia}):</span> <span>${formatCurrency(pagAtual.proventos.salarioMensalBruto)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pagAtual.totais.proventosBrutos)}</span></div><br>`;
        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS (Pagamento Atual):</p>`;
        if (pagAtual.descontos.faltas > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Faltas (${diasFaltaInput} dia(s)):</span> <span>${formatCurrency(pagAtual.descontos.faltas)}</span></div>`;
        if (pagAtual.descontos.inss > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(pagAtual.baseINSSAjustada)}):</span> <span>${formatCurrency(pagAtual.descontos.inss)}</span></div>`;
        if (pagAtual.descontos.irrf > 0) htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(Math.max(0, pagAtual.resultadoIRRF.baseCalculo))}):</span><span>${formatCurrency(pagAtual.descontos.irrf)}<small class="irrf-details">Alíq: ${(pagAtual.resultadoIRRF.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(pagAtual.resultadoIRRF.deducao)}</small></span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pagAtual.totais.descontos)}</span></div><br>`;
        htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pagAtual.totais.liquido)}</span></div>`;
   }

    resultadoHtml.innerHTML = htmlResultadoFinal + htmlInformativoProximoMes;
    divResultado.style.display = 'block';
    btnPdf.style.display = 'inline-block';
}


function gerarPDF() {
    // Adicione um try-catch para capturar erros específicos da geração do PDF
    try {
        if (!calculoAtual.nome) {
            alert("Primeiro realize um cálculo.");
            return;
        }

        // Verifique se jsPDF está carregado
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
            alert("Erro: A biblioteca jsPDF não foi carregada corretamente. Verifique o console para mais detalhes e a inclusão do script no HTML.");
            console.error("jsPDF não está definido em window.jspdf.jsPDF. Verifique se a biblioteca jsPDF está incluída corretamente no HTML antes deste script.");
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        let linhaY = 15; // Margem superior um pouco menor
        const margemEsquerda = 15;
        const margemDireita = doc.internal.pageSize.getWidth() - 15;
        const larguraPagina = doc.internal.pageSize.getWidth();
        const larguraConteudo = margemDireita - margemEsquerda;
        const espacamentoItemPDF = 5.5;
        const espacamentoEntreSecoesPDF = 8;

        // --- CABEÇALHO ---
        // const brasaoLarguraPDF = 20;
        // const proporcaoBrasao = 344 / 300; // Exemplo de proporção, ajuste se necessário
        // const brasaoAlturaPDF = brasaoLarguraPDF * proporcaoBrasao;
        // const brasaoX = (larguraPagina - brasaoLarguraPDF) / 2;
        // if (typeof brasaoBase64 !== 'undefined' && brasaoBase64) { // Verifique se brasaoBase64 está definido e não vazio
        //     doc.addImage(brasaoBase64, 'PNG', brasaoX, linhaY, brasaoLarguraPDF, brasaoAlturaPDF);
        //     linhaY += brasaoAlturaPDF + 2;
        // } else {
        //     // Se não houver brasão, adicione um espaço para manter o layout
        //     linhaY += 10; // Ou algum outro valor apropriado
        // }


        doc.setFontSize(9); doc.setFont(undefined, 'bold'); // Reduzido
        doc.text("PREFEITURA MUNICIPAL", larguraPagina / 2, linhaY, { align: 'center' }); linhaY += 4;
        doc.text("Vargem Grande do Sul - SP", larguraPagina / 2, linhaY, { align: 'center' }); linhaY += 4;
        doc.setFont(undefined, 'italic'); doc.setFontSize(8); // Reduzido
        doc.text("“A Pérola da Mantiqueira”", larguraPagina / 2, linhaY, { align: 'center' });
        linhaY += 7;

        doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(3, 86, 179); // Reduzido
        const tituloPrincipal = calculoAtual.tipoCalculo === "RESCISAO" ? "Termo de Quitação de Rescisão" : "Recibo de Pagamento";
        doc.text(tituloPrincipal, larguraPagina / 2, linhaY, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        linhaY += 8; // Reduzido

        // --- INFORMAÇÕES GERAIS ---
        doc.setFontSize(9); doc.setFont(undefined, 'normal');
        doc.setFont(undefined, 'bold'); doc.text("Nome:", margemEsquerda, linhaY);
        doc.setFont(undefined, 'normal'); doc.text(calculoAtual.nome, margemEsquerda + 12, linhaY); // Ajuste o offset conforme necessário
        
        // Referência do Pagamento Principal
        const refPrincipalFormatada = calculoAtual.referenciaPagamento.split('-').reverse().join('/');
        const textoRef = "Ref. Pag. Principal:";
        const larguraTextoRef = doc.getTextWidth(textoRef) + 2; // Adiciona um pequeno espaço
        const xRefLabel = margemDireita - doc.getTextWidth(refPrincipalFormatada) - larguraTextoRef - 10; // Ajuste o -10 para mais ou menos espaço à esquerda

        doc.setFont(undefined, 'bold'); doc.text(textoRef, xRefLabel , linhaY);
        doc.setFont(undefined, 'normal');
        doc.text(refPrincipalFormatada, xRefLabel + larguraTextoRef, linhaY);
        linhaY += espacamentoItemPDF;


        if (calculoAtual.isFeriasNormais) {
            doc.setFont(undefined, 'bold'); doc.text("Tipo:", margemEsquerda, linhaY);
            doc.setFont(undefined, 'normal'); doc.text(`RECIBO DE FÉRIAS E SALÁRIOS`, margemEsquerda + 10, linhaY); // Ajuste o offset
            linhaY += espacamentoItemPDF;
            doc.setFont(undefined, 'bold'); doc.text("Período de Gozo Férias:", margemEsquerda, linhaY);
            doc.setFont(undefined, 'normal');
            doc.text(`${calculoAtual.dataInicioFerias.split('-').reverse().join('/')} a ${calculoAtual.dataFimFerias}`, margemEsquerda + 38, linhaY); // Ajuste o offset
            linhaY += espacamentoItemPDF;
        } else if (!calculoAtual.isRescisao) { // Mensal Normal
            doc.setFont(undefined, 'bold'); doc.text("Tipo:", margemEsquerda, linhaY);
            doc.setFont(undefined, 'normal'); doc.text(`PAGAMENTO MENSAL (Contr. Individual)`, margemEsquerda + 10, linhaY); // Ajuste o offset
            linhaY += espacamentoItemPDF;
        }

        const desenharSecaoPagamentoPDF = (pagamentoObj, tituloSecao, yAtual, isEstimativa = false) => {
            let y = yAtual;
            if (!pagamentoObj || !pagamentoObj.proventos || !pagamentoObj.descontos || !pagamentoObj.totais) {
                console.error("Objeto de pagamento inválido ou incompleto para a seção:", tituloSecao, pagamentoObj);
                doc.setTextColor(255,0,0);
                doc.text(`Erro: Dados de pagamento para "${tituloSecao}" estão incompletos.`, margemEsquerda, y);
                doc.setTextColor(0,0,0);
                return y + 10; // Avança um pouco para não sobrepor
            }


            if (y + 30 > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }

            doc.setLineWidth(0.1); doc.setDrawColor(180, 180, 180);
            doc.line(margemEsquerda, y, margemDireita, y); y += 5;

            doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(3, 86, 179);
            doc.text(tituloSecao, margemEsquerda, y);
            doc.setTextColor(0, 0, 0); y += 5;

            doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.text("PROVENTOS:", margemEsquerda, y); y += 5;
            doc.setFont(undefined, 'normal');
            for (const key in pagamentoObj.proventos) {
                if (y + 5 > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }
                let desc = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()); // Formata camelCase
                if (key === "salarioMesAnterior" && pagamentoObj.referencia) desc = `Salário Mês Anterior (${pagamentoObj.referencia}):`;
                else if (key === "valorFerias" && calculoAtual.diasDeFeriasSelecionados) desc = `Férias (${calculoAtual.diasDeFeriasSelecionados} dias):`;
                else if (key === "adicionalUmTerco") desc = "Adicional 1/3 sobre Férias:";
                // else if (key === "salarioDiasTrabalhadosMesInicio") desc = `Sal. Dias Trab. Mês Início Férias (${calculoAtual.diasTrabalhadosMesInicioFerias}d de ${calculoAtual.mesAnoInicioFerias}):`; // Estas propriedades não existem em calculoAtual diretamente
                else if (key === "saldoSalario" && pagamentoObj.diasTrabalhados !== undefined) desc = `Saldo de Salário (${pagamentoObj.diasTrabalhados} dias):`;
                else if (key === "salarioMensalBruto" && pagamentoObj.referencia) desc = `Salário Base Mensal (${pagamentoObj.referencia}):`;
                else if (key === "salarioBaseReferenciaRescisao") desc = "Salário Base (Ref. Rescisão):";
                else if (key === "decimoTerceiroProp" && document.getElementById('meses13')) desc = `13º Salário Proporcional (${document.getElementById('meses13').value || 'N/A'}/12):`;
                else if (key === "feriasVencidas") desc = "Férias Vencidas + 1/3:";
                else if (key === "feriasProporcionaisBase" && document.getElementById('mesesFeriasProp')) desc = `Férias Proporcionais (${document.getElementById('mesesFeriasProp').value || 'N/A'}/12):`;
                else if (key === "umTercoFeriasProporcionais") desc = "1/3 sobre Férias Proporcionais:";


                doc.text(desc, margemEsquerda, y);
                doc.text(formatCurrency(pagamentoObj.proventos[key]), margemDireita, y, { align: 'right' });
                y += espacamentoItemPDF;
            }
            if (calculoAtual.diasFaltaPagAtual > 0 && tituloSecao.includes("PAGAMENTO ATUAL") && calculoAtual.isFeriasNormais) {
                 const descFaltasValor = (calculoAtual.salarioBaseInput / 30) * calculoAtual.diasFaltaPagAtual;
                 doc.setFont(undefined, 'normal'); doc.setTextColor(150, 0, 0);
                 doc.text(`(Desconto Faltas Mês Anterior: ${calculoAtual.diasFaltaPagAtual}d)`, margemEsquerda + 5, y);
                 doc.text(`(${formatCurrency(descFaltasValor)})`, margemDireita, y, { align: 'right' });
                 doc.setTextColor(0, 0, 0); y += espacamentoItemPDF;
            }
            doc.setFont(undefined, 'bold');
            doc.text(`TOTAL PROVENTOS BRUTOS${isEstimativa ? ' (Estimado)' : ''}:`, margemEsquerda, y);
            doc.text(formatCurrency(pagamentoObj.totais.proventosBrutos), margemDireita, y, { align: 'right' });
            y += espacamentoItemPDF + 2;

            doc.setFont(undefined, 'bold'); doc.text(`DESCONTOS${isEstimativa ? ' (Estimativa)' : ''}:`, margemEsquerda, y); y += 5;
            doc.setFont(undefined, 'normal');
            if (pagamentoObj.descontos.faltas > 0) {
                doc.text(`Faltas (${calculoAtual.diasFaltaPagAtual} dia(s)):`, margemEsquerda, y);
                doc.text(formatCurrency(pagamentoObj.descontos.faltas), margemDireita, y, { align: 'right' });
                y += espacamentoItemPDF;
            }
            if (pagamentoObj.descontos.inss > 0) {
                doc.text(`INSS 11% (s/ ${formatCurrency(pagamentoObj.baseINSSAjustada)}):`, margemEsquerda, y);
                doc.text(formatCurrency(pagamentoObj.descontos.inss), margemDireita, y, { align: 'right' });
                y += espacamentoItemPDF;
            }
            if (pagamentoObj.descontos.irrf > 0 && pagamentoObj.resultadoIRRF) { // Adicionada verificação para resultadoIRRF
                const ir = pagamentoObj.resultadoIRRF;
                const irDetalhes = `Alíq: ${(ir.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(ir.deducao)}`;
                doc.text(`IRRF (s/ ${formatCurrency(Math.max(0, ir.baseCalculo))}):`, margemEsquerda, y);
                doc.text(formatCurrency(ir.valor), margemDireita, y, { align: 'right' });
                doc.setFontSize(7); doc.setFont(undefined, 'italic'); doc.setTextColor(100,100,100); // Detalhes menores
                doc.text(irDetalhes, margemDireita, y + 2.5, { align: 'right' });
                doc.setTextColor(0,0,0); doc.setFontSize(9);
                y += espacamentoItemPDF + 1;
            }
            doc.setFont(undefined, 'bold');
            doc.text(`TOTAL DESCONTOS${isEstimativa ? ' (Estimado)' : ''}:`, margemEsquerda, y);
            doc.text(formatCurrency(pagamentoObj.totais.descontos), margemDireita, y, { align: 'right' });
            y += espacamentoItemPDF + 2;

            const alturaBlocoLiqPDF = 10;
            doc.setFillColor(isEstimativa ? 245 : 233, isEstimativa ? 245 : 236, isEstimativa ? 245 : 239);
            doc.rect(margemEsquerda - 1, y - 1.5, larguraConteudo + 2, alturaBlocoLiqPDF, 'F');
            doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(3, 86, 179);
            const yTextoLiqPDF = y + (alturaBlocoLiqPDF / 2) - (doc.getTextDimensions('LÍQUIDO A RECEBER:').h / 2) - 0.5;
            doc.text(`LÍQUIDO A RECEBER${isEstimativa ? ' (Estimado)' : ''}:`, margemEsquerda, yTextoLiqPDF);
            doc.text(formatCurrency(pagamentoObj.totais.liquido), margemDireita, yTextoLiqPDF, { align: 'right' });
            doc.setTextColor(0,0,0);
            y += alturaBlocoLiqPDF + espacamentoEntreSecoesPDF;
            return y;
        };

        // Desenhar Pagamento Atual
        linhaY = desenharSecaoPagamentoPDF(calculoAtual.pagamentoAtual, `PAGAMENTO ATUAL (Ref. ${refPrincipalFormatada})`, linhaY);

        // Desenhar Saldo Mês Início Férias, se houver
        if (calculoAtual.pagamentoSaldoMesInicioFerias) {
            linhaY = desenharSecaoPagamentoPDF(calculoAtual.pagamentoSaldoMesInicioFerias, `PAGAMENTO SALDO MÊS INÍCIO FÉRIAS (Ref. ${calculoAtual.pagamentoSaldoMesInicioFerias.referencia})`, linhaY, true);
        }

        // Desenhar Saldo Mês Término Férias, se houver
        if (calculoAtual.pagamentoSaldoMesTerminoFerias) {
            linhaY = desenharSecaoPagamentoPDF(calculoAtual.pagamentoSaldoMesTerminoFerias, `PAGAMENTO SALDO MÊS TÉRMINO FÉRIAS (Ref. ${calculoAtual.pagamentoSaldoMesTerminoFerias.referencia})`, linhaY, true);
        }


        // --- ASSINATURA ---
        if (linhaY + 20 > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); linhaY = 30; } // Aumentar um pouco a margem inferior da página
        const larguraAssinatura = 80;
        const xAssinatura = (larguraPagina - larguraAssinatura) / 2;
        doc.setLineWidth(0.3);
        doc.line(xAssinatura, linhaY, xAssinatura + larguraAssinatura, linhaY);
        linhaY += 6;
        doc.setFontSize(10); doc.setFont(undefined, 'normal');
        doc.text("Assinatura do(a) Conselheiro(a)", larguraPagina / 2, linhaY, { align: 'center'});

        let nomeArquivoRecibo = "Recibo_Pagamento";
        if (calculoAtual.isRescisao) {
            nomeArquivoRecibo = "Termo_Quitacao_Rescisao";
        } else if (calculoAtual.isFeriasNormais) {
            nomeArquivoRecibo = `Recibo_Ferias_e_Saldos`;
        }
        const fileName = `${nomeArquivoRecibo}_${calculoAtual.nome.replace(/[^a-zA-Z0-9]/g, '_')}_${calculoAtual.referenciaPagamento}.pdf`;
        doc.save(fileName);

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Ocorreu um erro ao gerar o PDF. Verifique o console do navegador para mais detalhes.\n\nErro: " + error.message);
    }
}

// --- Event Listeners e Inicialização ---
btnCalcular.addEventListener('click', executarCalculo);
btnPdf.addEventListener('click', gerarPDF);

fldDataInicioFerias.addEventListener('change', calcularDataFimFerias);
fldDiasFeriasGozo.addEventListener('change', calcularDataFimFerias);

[fldSalarioBase, fldTetoInss, fldFeriasVencidasInput].forEach(field => {
    field.addEventListener('focus', (e) => {
        e.target.classList.remove('formatted');
        let value = e.target.value.replace(/\./g, ''); // Remove todos os pontos (milhar)
        // value = value.replace(',', '.'); // Substitui vírgula por ponto para o parseFloat, se necessário
        e.target.value = value; // Deixa o valor "cru" para edição
    });
    field.addEventListener('blur', (e) => {
        let rawValue = e.target.value.replace(/\./g, '').replace(',', '.');
        let numValue = parseFloat(rawValue);
        if (!isNaN(numValue)) {
            e.target.value = formatToBRL(numValue);
            e.target.classList.add('formatted');
        } else {
            e.target.value = ''; // Limpa se não for um número válido
        }
    });
});

chkRescisao.addEventListener('change', function() {
    if (this.checked) {
        rescisaoCamposDiv.style.display = 'block';
        infoRescisaoDiv.style.display = 'block';
        labelSalarioBase.textContent = 'Salário Base Mensal (para cálculo rescisório R$):';
        chkFeriasNormais.checked = false;
        chkFeriasNormais.disabled = true;
        if (groupFeriasNormaisContainer) groupFeriasNormaisContainer.style.opacity = '0.5';
        if (groupDiasFeriasDiv) groupDiasFeriasDiv.style.display = 'none';
        if (groupDataInicioFeriasDiv) groupDataInicioFeriasDiv.style.display = 'none';
        if (groupFaltasContainer) groupFaltasContainer.style.display = 'none';
        fldFaltas.value = 0;
    } else {
        rescisaoCamposDiv.style.display = 'none';
        infoRescisaoDiv.style.display = 'none';
        labelSalarioBase.textContent = 'Salário Base Mensal (R$):';
        chkFeriasNormais.disabled = false;
        if (groupFeriasNormaisContainer) groupFeriasNormaisContainer.style.opacity = '1';
        if (groupFaltasContainer) groupFaltasContainer.style.display = 'block';
        chkAvisoPrevio.checked = false; // Desmarcar aviso prévio ao desmarcar rescisão
    }
});

 chkFeriasNormais.addEventListener('change', function() {
    if (this.checked) {
        chkRescisao.checked = false;
        chkRescisao.disabled = true;
        if (groupRescisaoContainer) groupRescisaoContainer.style.opacity = '0.5';
        rescisaoCamposDiv.style.display = 'none';
        infoRescisaoDiv.style.display = 'none';
        if(groupDiasFeriasDiv) groupDiasFeriasDiv.style.display = 'block';
        if(groupDataInicioFeriasDiv) groupDataInicioFeriasDiv.style.display = 'block';
        labelSalarioBase.textContent = 'Salário Base Mensal (para cálculo das férias R$):';
        if (groupFaltasContainer) {
            groupFaltasContainer.style.display = 'block';
            const labelFaltas = groupFaltasContainer.querySelector('label[for="faltas"]');
            if (labelFaltas) labelFaltas.textContent = 'Dias de Falta (no mês ANTERIOR ao início das férias):';
        }
    } else {
         chkRescisao.disabled = false;
         if(groupRescisaoContainer) groupRescisaoContainer.style.opacity = '1';
         if(groupDiasFeriasDiv) groupDiasFeriasDiv.style.display = 'none';
         if(groupDataInicioFeriasDiv) groupDataInicioFeriasDiv.style.display = 'none';
         fldDataInicioFerias.value = '';
         fldDataFimFerias.textContent = '';
         labelSalarioBase.textContent = 'Salário Base Mensal (R$):';
         if (groupFaltasContainer) {
            const labelFaltas = groupFaltasContainer.querySelector('label[for="faltas"]');
            if (labelFaltas) labelFaltas.textContent = 'Dias de Falta (no mês de referência, 0-30):';
        }
    }
});

// Inicialização de campos
// Valores padrão para Teto INSS e Férias Vencidas já são aplicados via value no HTML ou setados na carga
// Garantir que a formatação seja aplicada na carga se os campos tiverem valores iniciais
if (fldTetoInss.value) {
    let numValue = parseFloat(cleanNumberString(fldTetoInss.value));
    if (!isNaN(numValue)) fldTetoInss.value = formatToBRL(numValue);
    fldTetoInss.classList.add('formatted');
} else { // Define um valor padrão se estiver vazio e formata
    fldTetoInss.value = formatToBRL(8157.41); // Valor exemplo, ajuste se necessário
    fldTetoInss.classList.add('formatted');
}

if (fldFeriasVencidasInput.value) {
    let numValue = parseFloat(cleanNumberString(fldFeriasVencidasInput.value));
    if (!isNaN(numValue)) fldFeriasVencidasInput.value = formatToBRL(numValue);
    fldFeriasVencidasInput.classList.add('formatted');
} else {
    fldFeriasVencidasInput.value = formatToBRL(0);
    fldFeriasVencidasInput.classList.add('formatted');
}

document.getElementById('conselheiroNome').placeholder = 'Digite ou selecione o nome';

const hojeParaRef = new Date();
const mesAtual = String(hojeParaRef.getMonth() + 1).padStart(2, '0');
const anoAtual = hojeParaRef.getFullYear();
if (!fldReferencia.value) { // Preenche a referência apenas se estiver vazia
    fldReferencia.value = `${anoAtual}-${mesAtual}`;
}

// --- FIM DO ARQUIVO script.js ---