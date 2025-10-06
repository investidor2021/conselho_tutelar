// --- START OF FILE script.js ---

// Guard against multiple initializations
if (typeof window.calculadoraInicializada === 'undefined') {
  window.calculadoraInicializada = true;

  const SALARIO_MINIMO_NACIONAL = 1412.00;
  const ALIQUOTA_INSS_INDIVIDUAL = 0.11;

  const FAIXAS_IRRF = [
    { baseAte: 2259.20, aliquota: 0.0,   deducao: 0.0 },
    { baseAte: 2826.65, aliquota: 0.075, deducao: 169.44 },
    { baseAte: 3751.05, aliquota: 0.15,  deducao: 381.44 },
    { baseAte: 4664.68, aliquota: 0.225, deducao: 662.77 },
    { baseAte: Infinity,aliquota: 0.275, deducao: 896.00 }
  ];

  // --- Referências aos Elementos do DOM ---
  const calcForm = document.getElementById('calcForm');
  const btnCalcular = document.getElementById('btnCalcular');
  const btnPdf = document.getElementById('btnPdf');
  const btnSalvarFirebase = document.getElementById('btnSalvarFirebase');
  const divResultado = document.getElementById('divResultado');
  const resultadoHtml = document.getElementById('resultado');
  const infoBloqueioDiv = document.getElementById('infoBloqueio');

  const fldNome = document.getElementById('conselheiroNome');
  const fldReferencia = document.getElementById('referencia');
  const fldSalarioBase = document.getElementById('salarioBase');
  const fldTetoInss = document.getElementById('tetoInssValor');
  const fldFeriasVencidasInput = document.getElementById('feriasVencidas');
  const labelSalarioBase = document.getElementById('labelSalarioBase');
  const fldFaltas = document.getElementById('faltas');
  const groupFaltasContainer = document.getElementById('groupFaltasContainer');
  const chkFeriasNormais = document.getElementById('isFerias');
  const chkRescisao = document.getElementById('isRescisao');
  const infoRescisaoDiv = document.getElementById('infoRescisao');

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

  let calculoAtual = {};
  let contextoAtual = { referencia: null };

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
      if (!fldDataInicioFerias || !fldDataFimFerias) return;

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

  // --- Lógica de Bloqueio/Consulta ao Firebase ---
  function bloquearFormularioEExibirDados(calculoCompleto, referenciaSelecionada) {
      const nome = calculoCompleto.nome;
      infoBloqueioDiv.innerHTML = `
          <strong>Atenção:</strong> Já existe um cálculo salvo para ${nome} neste período.
          <br>O demonstrativo do pagamento encontrado é exibido abaixo.`;
      infoBloqueioDiv.style.display = 'block';

      let htmlSalvo = '';
      let pagamentoParaExibir = null;
      let tituloDemonstrativo = '';

      if (calculoCompleto.referenciaPagamento === referenciaSelecionada) {
          pagamentoParaExibir = calculoCompleto;
          tituloDemonstrativo = `Pagamento Principal (${calculoCompleto.tipoCalculo})`;
      } else if (calculoCompleto.pagamentoSaldoMesInicioFerias?.referenciaISO === referenciaSelecionada) {
          pagamentoParaExibir = calculoCompleto.pagamentoSaldoMesInicioFerias;
          tituloDemonstrativo = 'Saldo do Mês de Início das Férias';
      } else if (calculoCompleto.pagamentoSaldoMesTerminoFerias?.referenciaISO === referenciaSelecionada) {
          pagamentoParaExibir = calculoCompleto.pagamentoSaldoMesTerminoFerias;
          tituloDemonstrativo = 'Saldo do Mês de Término das Férias';
      }

      htmlSalvo += `<div class="resumo-item"><span>Nome:</span> <span>${nome}</span></div>`;
      htmlSalvo += `<div class="resumo-item"><span>Referência do Demonstrativo:</span> <span>${referenciaSelecionada.split('-').reverse().join('/')}</span></div>`;

      if (calculoCompleto.tipoCalculo === 'FERIAS' && calculoCompleto.dataInicioFerias) {
          const dataInicioFormatada = new Date(calculoCompleto.dataInicioFerias + "T00:00:00").toLocaleDateString('pt-BR');
          htmlSalvo += `<div class="resumo-item"><span>Período de Gozo:</span> <span>${dataInicioFormatada} a ${calculoCompleto.dataFimFerias}</span></div>`;
      }
      htmlSalvo += `<hr/>`;

      if (pagamentoParaExibir) {
          if (pagamentoParaExibir.tipoCalculo === 'FERIAS') {
              const pagSalario = pagamentoParaExibir.pagamentoPrincipalSalario;
              const pagFerias = pagamentoParaExibir.pagamentoPrincipalFerias;
              const pagTotal = pagamentoParaExibir.pagamentoPrincipalTotal;

              htmlSalvo += `<p class="titulo-demonstrativo">Demonstrativo do Salário (Ref. ${pagSalario.referencia})</p>`;
              htmlSalvo += `<div class="resumo-item"><span>Salário Base:</span> <span>${formatCurrency(pagSalario.proventos.salario)}</span></div>`;
              if (pagamentoParaExibir.diasFaltaPagAtual > 0) htmlSalvo += `<div class="resumo-item"><span>Desconto Faltas (${pagamentoParaExibir.diasFaltaPagAtual}d):</span> <span style="color:red;">(${formatCurrency(pagSalario.proventos.descFaltas)})</span></div>`;
              htmlSalvo += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>PROVENTOS (Salário):</span> <span>${formatCurrency(pagSalario.totais.proventosBrutos)}</span></div><br>`;
              if (pagSalario.descontos.inss > 0) htmlSalvo += `<div class="resumo-item"><span>INSS Proporcional:</span> <span>${formatCurrency(pagSalario.descontos.inss)}</span></div>`;
              if (pagSalario.descontos.irrf > 0) {
                  const irrf = pagSalario.resultadoIRRF;
                  htmlSalvo += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
              }
              htmlSalvo += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS (Salário):</span> <span>${formatCurrency(pagSalario.totais.descontos)}</span></div><br>`;
              htmlSalvo += `<div class="resumo-item total" style="background-color: #e9ecef;"><span>LÍQUIDO (Salário):</span><span>${formatCurrency(pagSalario.totais.liquido)}</span></div>`;

              htmlSalvo += `<hr class="separador-demonstrativo">`;
              htmlSalvo += `<p class="titulo-demonstrativo">Demonstrativo das Férias (Ref. ${pagFerias.referencia})</p>`;
              htmlSalvo += `<div class="resumo-item"><span>Férias (${pagamentoParaExibir.diasDeFeriasSelecionados} dias):</span> <span>${formatCurrency(pagFerias.proventos.ferias)}</span></div>`;
              htmlSalvo += `<div class="resumo-item"><span>Adicional 1/3 sobre Férias:</span> <span>${formatCurrency(pagFerias.proventos.umTerco)}</span></div>`;
              htmlSalvo += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>PROVENTOS (Férias):</span> <span>${formatCurrency(pagFerias.totais.proventosBrutos)}</span></div><br>`;
              if (pagFerias.descontos.inss > 0) htmlSalvo += `<div class="resumo-item"><span>INSS Proporcional:</span> <span>${formatCurrency(pagFerias.descontos.inss)}</span></div>`;
              if (pagFerias.descontos.irrf > 0) {
                  const irrf = pagFerias.resultadoIRRF;
                  htmlSalvo += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
              }
              htmlSalvo += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS (Férias):</span> <span>${formatCurrency(pagFerias.totais.descontos)}</span></div><br>`;
              htmlSalvo += `<div class="resumo-item total" style="background-color: #e9ecef;"><span>LÍQUIDO (Férias):</span><span>${formatCurrency(pagFerias.totais.liquido)}</span></div>`;

              htmlSalvo += `<hr class="separador-demonstrativo" style="border-top: 2px solid #28a745;">`;
              htmlSalvo += `<div class="resumo-item total" style="font-size: 1.2em;"><span>LÍQUIDO TOTAL A RECEBER:</span><span>${formatCurrency(pagTotal.totais.liquido)}</span></div>`;

          } else {
              const pag = (pagamentoParaExibir.tipoCalculo) ? pagamentoParaExibir.pagamentoAtual : pagamentoParaExibir;
              
              htmlSalvo += `<p class="titulo-demonstrativo" style="text-align: left;">${tituloDemonstrativo}</p>`;
              
              if(pag.proventos.saldoSalario) {
                 htmlSalvo += `<div class="resumo-item"><span>Saldo de Salário (${pag.diasTrabalhados} dias):</span> <span>${formatCurrency(pag.proventos.saldoSalario)}</span></div>`;
              } else {
                  Object.keys(pag.proventos).forEach(key => {
                      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                      htmlSalvo += `<div class="resumo-item"><span>${label}:</span> <span>${formatCurrency(pag.proventos[key])}</span></div>`;
                  });
              }

              htmlSalvo += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pag.totais.proventosBrutos)}</span></div><br>`;

              htmlSalvo += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS:</p>`;
              if(pag.descontos.faltas > 0) htmlSalvo += `<div class="resumo-item"><span>Faltas:</span> <span>${formatCurrency(pag.descontos.faltas)}</span></div>`;
              if(pag.descontos.inss > 0) htmlSalvo += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(pag.baseINSSAjustada)}):</span> <span>${formatCurrency(pag.descontos.inss)}</span></div>`;
              if(pag.descontos.irrf > 0) {
                  const irrf = pag.resultadoIRRF;
                  htmlSalvo += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
              }
              htmlSalvo += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pag.totais.descontos)}</span></div><br>`;
              htmlSalvo += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pag.totais.liquido)}</span></div>`;
          }
      }

      resultadoHtml.innerHTML = htmlSalvo;
      divResultado.style.display = 'block';
      btnPdf.style.display = 'inline-block';
      btnSalvarFirebase.style.display = 'none';

      Array.from(calcForm.elements).forEach(el => {
          if (el.id !== 'conselheiroNome' && el.id !== 'referencia') {
              el.disabled = true;
          }
      });
      btnCalcular.disabled = true;
  }

  function resetarBloqueioFormulario() {
      infoBloqueioDiv.style.display = 'none';
      divResultado.style.display = 'none';
      resultadoHtml.innerHTML = '';
      
      Array.from(calcForm.elements).forEach(el => el.disabled = false);
      chkRescisao.dispatchEvent(new Event('change'));
      chkFeriasNormais.dispatchEvent(new Event('change'));
      
      btnCalcular.disabled = false;
  }

  async function verificarPagamentoExistente() {
      const nome = fldNome.value;
      const referencia = fldReferencia.value;

      if (!nome || !referencia) {
          resetarBloqueioFormulario();
          return;
      }
      
      const { collection, query, where, getDocs } = window.firestoreFunctions;
      const db = window.db;
      const q = query(collection(db, "calculos"),
          where("nome", "==", nome),
          where("referenciasSaldos", "array-contains", referencia)
      );

      try {
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
              const doc = querySnapshot.docs[0];
              const calculoPai = doc.data().calculoCompleto;
              
              const isMatch = calculoPai.referenciaPagamento === referencia ||
                              calculoPai.pagamentoSaldoMesInicioFerias?.referenciaISO === referencia ||
                              calculoPai.pagamentoSaldoMesTerminoFerias?.referenciaISO === referencia;

              if (isMatch) {
                  calculoAtual = calculoPai;
                  contextoAtual.referencia = referencia;
                  bloquearFormularioEExibirDados(calculoPai, referencia); 
              } else {
                  resetarBloqueioFormulario();
              }
          } else {
              resetarBloqueioFormulario();
          }
      } catch (error) {
          console.error("Erro ao verificar pagamento existente: ", error);
          resetarBloqueioFormulario();
      }
  }

  async function executarCalculo() {
    const nome = fldNome.value;
    const referencia = fldReferencia.value;
    
    try {
        const { collection, query, where, getDocs } = window.firestoreFunctions;
        const db = window.db;
        
        const q = query(collection(db, "calculos"),
            where("nome", "==", nome),
            where("referenciasSaldos", "array-contains", referencia)
        );
        
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            const calculoPai = doc.data().calculoCompleto;
            
            let tipoDemonstrativo = '';

            if (calculoPai.referenciaPagamento === referencia) {
                tipoDemonstrativo = `Pagamento Principal (${calculoPai.tipoCalculo})`;
            } 
            else if (calculoPai.pagamentoSaldoMesInicioFerias?.referenciaISO === referencia) {
                tipoDemonstrativo = "Saldo do Mês de Início das Férias";
            } else if (calculoPai.pagamentoSaldoMesTerminoFerias?.referenciaISO === referencia) {
                tipoDemonstrativo = "Saldo do Mês de Término das Férias";
            }
            
            if (tipoDemonstrativo) {
                alert(`Atenção: ${nome} já possui um cálculo de "${tipoDemonstrativo}" para este período.`);
                calculoAtual = calculoPai;
                contextoAtual.referencia = referencia;
                bloquearFormularioEExibirDados(calculoPai, referencia);
                return;
            }
        }
    } catch (err) {
        console.error("Erro ao verificar cálculo existente:", err);
    }
    
    contextoAtual.referencia = null;

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
    const tetoInssInformado = parseFloat(tetoInssStr) || 8157.41;
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
        diasFaltaPagAtual: diasFaltaInput,
        pagamentoPrincipalSalario: null,
        pagamentoPrincipalFerias: null,
        pagamentoPrincipalTotal: null,
        pagamentoSaldoMesInicioFerias: null,
        pagamentoSaldoMesTerminoFerias: null,
        pagamentoAtual: { proventos: {}, descontos: {}, totais: {}, baseINSSAjustada: 0, resultadoIRRF: {} }
    };

    let htmlResultadoFinal = '';
    let htmlInformativoSaldos = '';
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
          
          calculoAtual.inputsRescisao = { diasSaldo, numMeses13, numMesesFeriasProp };

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
          pagAtual.resultadoIRRF = resultadoIRRFResc;
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
          if (pagAtual.descontos.irrf > 0) {
            const irrf = pagAtual.resultadoIRRF;
            htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
          }
          htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pagAtual.totais.descontos)}</span></div><br>`;
          htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pagAtual.totais.liquido)}</span></div>`;

    } else if (isFeriasNormaisChecked) {
          calculoAtual.tipoCalculo = "FERIAS";
          const diasDeFeriasSelecionados = parseInt(fldDiasFeriasGozo.value);
          const dataInicioFeriasStr = fldDataInicioFerias ? fldDataInicioFerias.value : null;
          if (!dataInicioFeriasStr) { alert("Informe a data de início das férias."); if(fldDataInicioFerias) fldDataInicioFerias.focus(); return; }
          const dataInicioFeriasDate = new Date(dataInicioFeriasStr + "T00:00:00");
          if (isNaN(dataInicioFeriasDate.getTime())) { alert("Data de início das férias inválida."); if(fldDataInicioFerias) fldDataInicioFerias.focus(); return; }
          const dataFimFeriasDate = new Date(dataInicioFeriasDate);
          dataFimFeriasDate.setDate(dataInicioFeriasDate.getDate() + diasDeFeriasSelecionados - 1);

          calculoAtual.diasDeFeriasSelecionados = diasDeFeriasSelecionados;
          calculoAtual.dataInicioFerias = dataInicioFeriasStr;
          calculoAtual.dataFimFerias = dataFimFeriasDate.toLocaleDateString('pt-BR');

          htmlResultadoFinal += `<div class="resumo-item"><span>TIPO:</span> <span><b>RECIBO DE FÉRIAS E SALÁRIOS</b></span></div>`;
          htmlResultadoFinal += `<div class="resumo-item"><span>Período de Gozo das Férias:</span> <span>${dataInicioFeriasDate.toLocaleDateString('pt-BR')} a ${calculoAtual.dataFimFerias}</span></div><hr>`;

          const valorDia = salarioBaseInput / 30;
          const descFaltas = valorDia * calculoAtual.diasFaltaPagAtual;
          const proventosBrutosSalario = salarioBaseInput - descFaltas;
          const valorFeriasBase = (salarioBaseInput / 30) * diasDeFeriasSelecionados;
          const adicUmTerco = valorFeriasBase / 3;
          const proventosBrutosFerias = valorFeriasBase + adicUmTerco;
          const totalBrutoGeral = proventosBrutosSalario + proventosBrutosFerias;
          const resultadoINSSTotal = calcularINSSContribuinteIndividual(totalBrutoGeral, tetoInssInformado);
          let inssProporcionalSalario = 0;
          let inssProporcionalFerias = 0;
          if (totalBrutoGeral > 0 && resultadoINSSTotal.valor > 0) {
              inssProporcionalSalario = (proventosBrutosSalario / totalBrutoGeral) * resultadoINSSTotal.valor;
              inssProporcionalFerias = (proventosBrutosFerias / totalBrutoGeral) * resultadoINSSTotal.valor;
          }
          const baseIRRFSalario = proventosBrutosSalario - inssProporcionalSalario;
          const resultadoIRRFSalario = calcularIRRF(baseIRRFSalario);
          const descontosSalario = inssProporcionalSalario + resultadoIRRFSalario.valor;
          const liquidoSalario = proventosBrutosSalario - descontosSalario;
          calculoAtual.pagamentoPrincipalSalario = {
              referencia: mesAnoReferenciaPagamentoFormatado,
              proventos: { salario: salarioBaseInput, descFaltas: descFaltas },
              descontos: { inss: inssProporcionalSalario, irrf: resultadoIRRFSalario.valor },
              totais: { proventosBrutos: proventosBrutosSalario, descontos: descontosSalario, liquido: liquidoSalario },
              baseINSSAjustada: (proventosBrutosSalario / totalBrutoGeral) * resultadoINSSTotal.baseAjustada,
              resultadoIRRF: resultadoIRRFSalario
          };
          const baseIRRFFerias = proventosBrutosFerias - inssProporcionalFerias;
          const resultadoIRRFFerias = calcularIRRF(baseIRRFFerias);
          const descontosFerias = inssProporcionalFerias + resultadoIRRFFerias.valor;
          const liquidoFerias = proventosBrutosFerias - descontosFerias;
          calculoAtual.pagamentoPrincipalFerias = {
              referencia: mesAnoReferenciaPagamentoFormatado,
              proventos: { ferias: valorFeriasBase, umTerco: adicUmTerco },
              descontos: { inss: inssProporcionalFerias, irrf: resultadoIRRFFerias.valor },
              totais: { proventosBrutos: proventosBrutosFerias, descontos: descontosFerias, liquido: liquidoFerias },
              baseINSSAjustada: (proventosBrutosFerias / totalBrutoGeral) * resultadoINSSTotal.baseAjustada,
              resultadoIRRF: resultadoIRRFFerias
          };
          calculoAtual.pagamentoPrincipalTotal = {
              totais: {
                  proventosBrutos: totalBrutoGeral,
                  descontos: descontosSalario + descontosFerias,
                  liquido: liquidoSalario + liquidoFerias
              }
          };
          
          const pagSalario = calculoAtual.pagamentoPrincipalSalario;
          htmlResultadoFinal += `<p class="titulo-demonstrativo">Demonstrativo do Salário (Ref. ${pagSalario.referencia})</p>`;
          htmlResultadoFinal += `<div class="resumo-item"><span>Salário Base:</span> <span>${formatCurrency(pagSalario.proventos.salario)}</span></div>`;
          if (calculoAtual.diasFaltaPagAtual > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Desconto Faltas (${calculoAtual.diasFaltaPagAtual}d):</span> <span style="color:red;">(${formatCurrency(pagSalario.proventos.descFaltas)})</span></div>`;
          htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>PROVENTOS (Salário):</span> <span>${formatCurrency(pagSalario.totais.proventosBrutos)}</span></div><br>`;
          if (pagSalario.descontos.inss > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS Proporcional:</span> <span>${formatCurrency(pagSalario.descontos.inss)}</span></div>`;
          if (pagSalario.descontos.irrf > 0) {
              const irrf = pagSalario.resultadoIRRF;
              htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
          }
          htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS (Salário):</span> <span>${formatCurrency(pagSalario.totais.descontos)}</span></div><br>`;
          htmlResultadoFinal += `<div class="resumo-item total" style="background-color: #e9ecef;"><span>LÍQUIDO (Salário):</span><span>${formatCurrency(pagSalario.totais.liquido)}</span></div>`;

          const pagFerias = calculoAtual.pagamentoPrincipalFerias;
          htmlResultadoFinal += `<hr class="separador-demonstrativo">`;
          htmlResultadoFinal += `<p class="titulo-demonstrativo">Demonstrativo das Férias (Ref. ${pagFerias.referencia})</p>`;
          htmlResultadoFinal += `<div class="resumo-item"><span>Férias (${diasDeFeriasSelecionados} dias):</span> <span>${formatCurrency(pagFerias.proventos.ferias)}</span></div>`;
          htmlResultadoFinal += `<div class="resumo-item"><span>Adicional 1/3 sobre Férias:</span> <span>${formatCurrency(pagFerias.proventos.umTerco)}</span></div>`;
          htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>PROVENTOS (Férias):</span> <span>${formatCurrency(pagFerias.totais.proventosBrutos)}</span></div><br>`;
          if (pagFerias.descontos.inss > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS Proporcional:</span> <span>${formatCurrency(pagFerias.descontos.inss)}</span></div>`;
          if (pagFerias.descontos.irrf > 0) {
              const irrf = pagFerias.resultadoIRRF;
              htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
          }
          htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS (Férias):</span> <span>${formatCurrency(pagFerias.totais.descontos)}</span></div><br>`;
          htmlResultadoFinal += `<div class="resumo-item total" style="background-color: #e9ecef;"><span>LÍQUIDO (Férias):</span><span>${formatCurrency(pagFerias.totais.liquido)}</span></div>`;

          htmlResultadoFinal += `<hr class="separador-demonstrativo" style="border-top: 2px solid #28a745;">`;
          htmlResultadoFinal += `<div class="resumo-item total" style="font-size: 1.2em;"><span>LÍQUIDO TOTAL A RECEBER:</span><span>${formatCurrency(calculoAtual.pagamentoPrincipalTotal.totais.liquido)}</span></div>`;

          const diaInicioFerias = dataInicioFeriasDate.getDate();
          const mesInicioFerias = dataInicioFeriasDate.getMonth() + 1;
          const anoInicioFerias = dataInicioFeriasDate.getFullYear();
          if (diaInicioFerias > 1) {
              const diasTrabalhados = diaInicioFerias - 1;
              const valorDiaSaldo = salarioBaseInput / new Date(anoInicioFerias, mesInicioFerias, 0).getDate();
              const saldo = valorDiaSaldo * diasTrabalhados;
              calculoAtual.pagamentoSaldoMesInicioFerias = {
                  referencia: `${String(mesInicioFerias).padStart(2, '0')}/${anoInicioFerias}`,
                  referenciaISO: `${anoInicioFerias}-${String(mesInicioFerias).padStart(2, '0')}`,
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
          }

          if (calculoAtual.pagamentoSaldoMesInicioFerias) {
              const pag = calculoAtual.pagamentoSaldoMesInicioFerias;
              htmlInformativoSaldos += `<hr class="separador-demonstrativo">`;
              htmlInformativoSaldos += `<p class="titulo-demonstrativo">Demonstrativo do Saldo (Mês de Início das Férias)</p>`;
              htmlInformativoSaldos += `<div class="resumo-item"><span>Referência do Saldo:</span> <span>${pag.referencia}</span></div><br>`;
              htmlInformativoSaldos += `<div class="resumo-item"><span>Saldo de Salário (${pag.diasTrabalhados} dias):</span> <span>${formatCurrency(pag.proventos.saldoSalario)}</span></div>`;
              htmlInformativoSaldos += `<div class="resumo-item" style="font-weight:bold;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pag.totais.proventosBrutos)}</span></div><br>`;
              if (pag.descontos.inss > 0) htmlInformativoSaldos += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(pag.baseINSSAjustada)}):</span> <span>${formatCurrency(pag.descontos.inss)}</span></div>`;
              if (pag.descontos.irrf > 0) {
                  const irrf = pag.resultadoIRRF;
                  htmlInformativoSaldos += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
              }
              htmlInformativoSaldos += `<div class="resumo-item" style="font-weight:bold;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pag.totais.descontos)}</span></div><br>`;
              htmlInformativoSaldos += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER (Saldo):</span><span>${formatCurrency(pag.totais.liquido)}</span></div>`;
          }

          const mesFimFerias = dataFimFeriasDate.getMonth() + 1;
          const anoFimFerias = dataFimFeriasDate.getFullYear();
          const diaFimFerias = dataFimFeriasDate.getDate();
          const diasNoMesFimFerias = new Date(anoFimFerias, mesFimFerias, 0).getDate();
          let saldoSalarioMesTermino = 0;
          if ( (mesInicioFerias !== mesFimFerias && diaFimFerias < diasNoMesFimFerias) ) {
              const diasTrabalhadosMesTermino = diasNoMesFimFerias - diaFimFerias;
              saldoSalarioMesTermino = (salarioBaseInput / diasNoMesFimFerias) * diasTrabalhadosMesTermino;
          }
          if (saldoSalarioMesTermino > 0) {
              calculoAtual.pagamentoSaldoMesTerminoFerias = {
                  referencia: `${String(mesFimFerias).padStart(2, '0')}/${anoFimFerias}`,
                  referenciaISO: `${anoFimFerias}-${String(mesFimFerias).padStart(2, '0')}`,
                  proventos: { saldoSalario: saldoSalarioMesTermino },
                  descontos: {}, totais: {}, diasTrabalhados: diasNoMesFimFerias - diaFimFerias
              };
              const pag = calculoAtual.pagamentoSaldoMesTerminoFerias;
              pag.totais.proventosBrutos = saldoSalarioMesTermino;
              const resINSS = calcularINSSContribuinteIndividual(saldoSalarioMesTermino, tetoInssInformado);
              if (resINSS.valor > 0) pag.descontos.inss = resINSS.valor;
              pag.baseINSSAjustada = resINSS.baseAjustada;
              const resIRRF = calcularIRRF(saldoSalarioMesTermino - (pag.descontos.inss || 0));
              if (resIRRF.valor > 0) pag.descontos.irrf = resIRRF.valor;
              pag.resultadoIRRF = resIRRF;
              pag.totais.descontos = (pag.descontos.inss || 0) + (pag.descontos.irrf || 0);
              pag.totais.liquido = pag.totais.proventosBrutos - pag.totais.descontos;
          }

          if (calculoAtual.pagamentoSaldoMesTerminoFerias) {
              const pag = calculoAtual.pagamentoSaldoMesTerminoFerias;
              htmlInformativoSaldos += `<hr class="separador-demonstrativo">`;
              htmlInformativoSaldos += `<p class="titulo-demonstrativo">Demonstrativo do Saldo (Mês de Término das Férias)</p>`;
              htmlInformativoSaldos += `<div class="resumo-item"><span>Referência do Saldo:</span> <span>${pag.referencia}</span></div><br>`;
              htmlInformativoSaldos += `<div class="resumo-item"><span>Saldo de Salário (${pag.diasTrabalhados} dias):</span> <span>${formatCurrency(pag.proventos.saldoSalario)}</span></div>`;
              htmlInformativoSaldos += `<div class="resumo-item" style="font-weight:bold;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pag.totais.proventosBrutos)}</span></div><br>`;
              if (pag.descontos.inss > 0) htmlInformativoSaldos += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(pag.baseINSSAjustada)}):</span> <span>${formatCurrency(pag.descontos.inss)}</span></div>`;
              if (pag.descontos.irrf > 0) {
                  const irrf = pag.resultadoIRRF;
                  htmlInformativoSaldos += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
              }
              htmlInformativoSaldos += `<div class="resumo-item" style="font-weight:bold;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pag.totais.descontos)}</span></div><br>`;
              htmlInformativoSaldos += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER (Saldo):</span><span>${formatCurrency(pag.totais.liquido)}</span></div>`;
          }

    } else { 
          calculoAtual.tipoCalculo = "MENSAL";
          htmlResultadoFinal += '<div class="resumo-item"><span>TIPO:</span> <span><b>PAGAMENTO MENSAL (Contr. Individual)</b></span></div><hr>';
          const pagAtual = calculoAtual.pagamentoAtual;
          pagAtual.referencia = mesAnoReferenciaPagamentoFormatado;

          let salarioMensal = salarioBaseInput;
          pagAtual.proventos.salarioMensalBruto = salarioMensal;
          const valorDia = salarioMensal / 30; 
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
          if (pagAtual.descontos.irrf > 0) {
            const irrf = pagAtual.resultadoIRRF;
            htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(irrf.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}</small> ${formatCurrency(irrf.valor)}</span></div>`;
          }
          htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pagAtual.totais.descontos)}</span></div><br>`;
          htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pagAtual.totais.liquido)}</span></div>`;
    }

      resultadoHtml.innerHTML = htmlResultadoFinal + htmlInformativoSaldos;
      divResultado.style.display = 'block';
      btnPdf.style.display = 'inline-block';
      btnSalvarFirebase.style.display = 'inline-block';
  }

  function gerarPDF() {
    try {
        if (!calculoAtual || !calculoAtual.nome) {
            alert("Primeiro realize um cálculo.");
            return;
        }

        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
            alert("Erro: A biblioteca jsPDF não foi carregada corretamente.");
            console.error("jsPDF não está definido.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        let linhaY = 20;
        const margemEsquerda = 15;
        const margemDireita = doc.internal.pageSize.getWidth() - 15;
        const azul = '#0056b3';

        const addLinhaDupla = (textoEsquerda, textoDireita, isBold = false, tamanhoFonte = 10) => {
            if(linhaY > 270) { doc.addPage(); linhaY = 20; }
            doc.setFontSize(tamanhoFonte);
            doc.setFont(undefined, isBold ? 'bold' : 'normal');
            doc.text(textoEsquerda, margemEsquerda, linhaY);
            doc.text(textoDireita, margemDireita, linhaY, { align: 'right' });
            linhaY += 7;
        };

        const addTituloSecao = (titulo) => {
            if(linhaY > 270) { doc.addPage(); linhaY = 20; }
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(azul);
            doc.text(titulo, margemEsquerda, linhaY);
            linhaY += 8;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(0, 0, 0);
        };
        
        const addLinhaSeparadora = () => {
             linhaY += 3;
             if(linhaY > 270) { doc.addPage(); linhaY = 20; }
             doc.setLineWidth(0.2).line(margemEsquerda, linhaY, margemDireita, linhaY);
             linhaY += 8;
        }

        const renderizarSaldoPDF = (pagamentoSaldo, titulo) => {
            if (!pagamentoSaldo) return;
            addLinhaSeparadora();
            addTituloSecao(titulo);
            addLinhaDupla(`Referência do Saldo:`, pagamentoSaldo.referencia);
            addLinhaDupla(`Saldo de Salário (${pagamentoSaldo.diasTrabalhados} dias):`, formatCurrency(pagamentoSaldo.proventos.saldoSalario));
            addLinhaDupla('TOTAL PROVENTOS BRUTOS:', formatCurrency(pagamentoSaldo.totais.proventosBrutos), true);
            linhaY += 3;
            if (pagamentoSaldo.descontos.inss > 0) addLinhaDupla(`INSS 11% (s/ ${formatCurrency(pagamentoSaldo.baseINSSAjustada)}):`, formatCurrency(pagamentoSaldo.descontos.inss));
            if (pagamentoSaldo.descontos.irrf > 0) {
                const irrf = pagamentoSaldo.resultadoIRRF;
                const aliquotaStr = `(Alíq: ${(irrf.aliquota * 100).toLocaleString('pt-BR')}%, Ded: ${formatCurrency(irrf.deducao)})`;
                const valorDireita = `${aliquotaStr} ${formatCurrency(irrf.valor)}`;
                addLinhaDupla(`IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):`, valorDireita);
            }
            addLinhaDupla('TOTAL DESCONTOS:', formatCurrency(pagamentoSaldo.totais.descontos), true);
            linhaY += 3;
            addLinhaDupla('LÍQUIDO A RECEBER (Saldo):', formatCurrency(pagamentoSaldo.totais.liquido), true);
        };
        
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(azul);
        doc.text("Resumo do Cálculo", margemEsquerda, linhaY);
        linhaY += 12;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0);

        const referenciaFiltro = contextoAtual.referencia;

        if (referenciaFiltro) {
            addLinhaDupla('Nome:', calculoAtual.nome);
            addLinhaDupla('Referência do Demonstrativo:', referenciaFiltro.split('-').reverse().join('/'));
        } else {
            const refPrincipalFormatada = calculoAtual.referenciaPagamento.split('-').reverse().join('/');
            let tipoCalculoStr = 'PAGAMENTO MENSAL';
            if (calculoAtual.tipoCalculo === 'RESCISAO') tipoCalculoStr = 'RESCISÃO';
            else if (calculoAtual.tipoCalculo === 'FERIAS') tipoCalculoStr = 'RECIBO DE FÉRIAS';
            addLinhaDupla('Nome:', calculoAtual.nome);
            addLinhaDupla('Referência Principal:', refPrincipalFormatada);
            addLinhaDupla('TIPO:', tipoCalculoStr);
        }
        
        if (calculoAtual.tipoCalculo === 'FERIAS' && calculoAtual.dataInicioFerias) {
            const dataInicio = new Date(calculoAtual.dataInicioFerias + "T00:00:00").toLocaleDateString('pt-BR');
            addLinhaDupla('Período de Gozo (Completo):', `${dataInicio} a ${calculoAtual.dataFimFerias}`);
        }
        addLinhaSeparadora();
        
        const imprimirTudo = !referenciaFiltro;

        if (imprimirTudo || calculoAtual.referenciaPagamento === referenciaFiltro) {
            if (calculoAtual.tipoCalculo === 'FERIAS') {
                const pagSalario = calculoAtual.pagamentoPrincipalSalario;
                const pagFerias = calculoAtual.pagamentoPrincipalFerias;
                const pagTotal = calculoAtual.pagamentoPrincipalTotal;

                addTituloSecao(`Demonstrativo do Salário (Ref. ${pagSalario.referencia})`);
                addLinhaDupla('Salário Base:', formatCurrency(pagSalario.proventos.salario));
                if (calculoAtual.diasFaltaPagAtual > 0) addLinhaDupla(`Desconto Faltas (${calculoAtual.diasFaltaPagAtual}d):`, `(${formatCurrency(pagSalario.proventos.descFaltas)})`);
                addLinhaDupla('PROVENTOS (Salário):', formatCurrency(pagSalario.totais.proventosBrutos), true);
                linhaY += 3;
                if (pagSalario.descontos.inss > 0) addLinhaDupla('INSS Proporcional:', formatCurrency(pagSalario.descontos.inss));
                if (pagSalario.descontos.irrf > 0) {
                    const irrf = pagSalario.resultadoIRRF;
                    const aliquotaStr = `(Alíq: ${(irrf.aliquota * 100).toLocaleString('pt-BR')}%, Ded: ${formatCurrency(irrf.deducao)})`;
                    const valorDireita = `${aliquotaStr} ${formatCurrency(irrf.valor)}`;
                    addLinhaDupla(`IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):`, valorDireita);
                }
                addLinhaDupla('DESCONTOS (Salário):', formatCurrency(pagSalario.totais.descontos), true);
                linhaY += 3;
                addLinhaDupla('LÍQUIDO (Salário):', formatCurrency(pagSalario.totais.liquido), true);
                addLinhaSeparadora();
                
                addTituloSecao(`Demonstrativo das Férias (Ref. ${pagFerias.referencia})`);
                addLinhaDupla(`Férias (${calculoAtual.diasDeFeriasSelecionados} dias):`, formatCurrency(pagFerias.proventos.ferias));
                addLinhaDupla('Adicional 1/3 sobre Férias:', formatCurrency(pagFerias.proventos.umTerco));
                addLinhaDupla('PROVENTOS (Férias):', formatCurrency(pagFerias.totais.proventosBrutos), true);
                linhaY += 3;
                if (pagFerias.descontos.inss > 0) addLinhaDupla('INSS Proporcional:', formatCurrency(pagFerias.descontos.inss));
                if (pagFerias.descontos.irrf > 0) {
                    const irrf = pagFerias.resultadoIRRF;
                    const aliquotaStr = `(Alíq: ${(irrf.aliquota * 100).toLocaleString('pt-BR')}%, Ded: ${formatCurrency(irrf.deducao)})`;
                    const valorDireita = `${aliquotaStr} ${formatCurrency(irrf.valor)}`;
                    addLinhaDupla(`IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):`, valorDireita);
                }
                addLinhaDupla('DESCONTOS (Férias):', formatCurrency(pagFerias.totais.descontos), true);
                linhaY += 3;
                addLinhaDupla('LÍQUIDO (Férias):', formatCurrency(pagFerias.totais.liquido), true);
                addLinhaSeparadora();

                addLinhaDupla('LÍQUIDO TOTAL A RECEBER:', formatCurrency(pagTotal.totais.liquido), true, 12);

            } else {
                const pagAtual = calculoAtual.pagamentoAtual;
                addTituloSecao('Demonstrativo de Pagamento');
                const inputs = calculoAtual.inputsRescisao || {};
                const diasSaldo = inputs.diasSaldo || 0;
                const meses13 = inputs.numMeses13 || 0;
                if (pagAtual.proventos.salarioMensalBruto) addLinhaDupla(`Salário Base Mensal (${pagAtual.referencia}):`, formatCurrency(pagAtual.proventos.salarioMensalBruto));
                if (pagAtual.proventos.saldoSalario) addLinhaDupla(`Saldo de Salário (${diasSaldo} dias):`, formatCurrency(pagAtual.proventos.saldoSalario));
                addLinhaDupla('TOTAL PROVENTOS BRUTOS:', formatCurrency(pagAtual.totais.proventosBrutos), true);
                linhaY += 8;
                addTituloSecao('DESCONTOS');
                if (pagAtual.descontos.faltas > 0) addLinhaDupla(`Faltas (${calculoAtual.diasFaltaPagAtual} dia(s)):`, formatCurrency(pagAtual.descontos.faltas));
                if (pagAtual.descontos.inss > 0) addLinhaDupla(`INSS 11% (s/ ${formatCurrency(pagAtual.baseINSSAjustada)}):`, formatCurrency(pagAtual.descontos.inss));
                if (pagAtual.descontos.irrf > 0) {
                    const irrf = pagAtual.resultadoIRRF;
                    const aliquotaStr = `(Alíq: ${(irrf.aliquota * 100).toLocaleString('pt-BR')}%, Ded: ${formatCurrency(irrf.deducao)})`;
                    const valorDireita = `${aliquotaStr} ${formatCurrency(irrf.valor)}`;
                    addLinhaDupla(`IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):`, valorDireita);
                }
                addLinhaDupla('TOTAL DESCONTOS:', formatCurrency(pagAtual.totais.descontos), true);
                linhaY += 8;
                addLinhaDupla('LÍQUIDO A RECEBER:', formatCurrency(pagAtual.totais.liquido), true, 12);
            }
        }
        
        if (imprimirTudo || calculoAtual.pagamentoSaldoMesInicioFerias?.referenciaISO === referenciaFiltro) {
            renderizarSaldoPDF(calculoAtual.pagamentoSaldoMesInicioFerias, "Demonstrativo do Saldo (Mês de Início das Férias)");
        }
        if (imprimirTudo || calculoAtual.pagamentoSaldoMesTerminoFerias?.referenciaISO === referenciaFiltro) {
            renderizarSaldoPDF(calculoAtual.pagamentoSaldoMesTerminoFerias, "Demonstrativo do Saldo (Mês de Término das Férias)");
        }
        
        linhaY += 25;
        if(linhaY > 270) { doc.addPage(); linhaY = 40; }
        doc.text('________________________________________', margemDireita / 2 + margemEsquerda / 2, linhaY, { align: 'center' });
        linhaY += 5;
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(calculoAtual.nome, margemDireita / 2 + margemEsquerda / 2, linhaY, { align: 'center' });

        doc.save(`Recibo_${calculoAtual.nome.replace(/\s+/g, '_')}_${(referenciaFiltro || calculoAtual.referenciaPagamento)}.pdf`);

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Ocorreu um erro ao gerar o PDF: " + error.message);
    }
}

  // --- Event Listeners e Inicialização ---
  btnCalcular.addEventListener('click', executarCalculo);
  btnPdf.addEventListener('click', gerarPDF);
  btnSalvarFirebase.addEventListener('click', salvarNoFirebase);

  fldNome.addEventListener('change', verificarPagamentoExistente);
  fldReferencia.addEventListener('change', verificarPagamentoExistente);

  if (fldDataInicioFerias) fldDataInicioFerias.addEventListener('change', calcularDataFimFerias);
  if (fldDiasFeriasGozo) fldDiasFeriasGozo.addEventListener('change', calcularDataFimFerias);

  [fldSalarioBase, fldTetoInss, fldFeriasVencidasInput].forEach(field => {
    if(field) {
      field.addEventListener('blur', (e) => {
          let rawValue = e.target.value.replace(/\./g, '').replace(',', '.');
          let numValue = parseFloat(rawValue);
          if (!isNaN(numValue)) {
              e.target.value = formatToBRL(numValue);
          } else {
              e.target.value = '';
          }
      });
    }
  });

  chkRescisao.addEventListener('change', function() {
      if (this.checked) {
          rescisaoCamposDiv.style.display = 'block';
          infoRescisaoDiv.style.display = 'block';
          labelSalarioBase.textContent = 'Salário Base Mensal (para cálculo rescisório R$):';
          chkFeriasNormais.checked = false;
          chkFeriasNormais.disabled = true;
          if (groupDiasFeriasDiv) groupDiasFeriasDiv.style.display = 'none';
          if (groupDataInicioFeriasDiv) groupDataInicioFeriasDiv.style.display = 'none';
          if (groupFaltasContainer) groupFaltasContainer.style.display = 'none';
      } else {
          rescisaoCamposDiv.style.display = 'none';
          infoRescisaoDiv.style.display = 'none';
          labelSalarioBase.textContent = 'Salário Base Mensal (R$):';
          chkFeriasNormais.disabled = false;
          if (groupFaltasContainer) groupFaltasContainer.style.display = 'block';
      }
  });

  chkFeriasNormais.addEventListener('change', function() {
      if (this.checked) {
          chkRescisao.checked = false;
          chkRescisao.disabled = true;
          rescisaoCamposDiv.style.display = 'none';
          infoRescisaoDiv.style.display = 'none';
          if(groupDiasFeriasDiv) groupDiasFeriasDiv.style.display = 'block';
          if(groupDataInicioFeriasDiv) groupDataInicioFeriasDiv.style.display = 'block';
          labelSalarioBase.textContent = 'Salário Base Mensal (para cálculo das férias R$):';
      } else {
          chkRescisao.disabled = false;
          if(groupDiasFeriasDiv) groupDiasFeriasDiv.style.display = 'none';
          if(groupDataInicioFeriasDiv) groupDataInicioFeriasDiv.style.display = 'none';
          labelSalarioBase.textContent = 'Salário Base Mensal (R$):';
      }
  });
async function salvarNoFirebase() {
    if (!calculoAtual || !calculoAtual.nome) {
        alert("Não há dados de cálculo para salvar.");
        return;
    }

    btnSalvarFirebase.disabled = true;
    btnSalvarFirebase.textContent = 'Salvando...';

    const { collection, addDoc, getDocs, query, where, serverTimestamp } = window.firestoreFunctions;
    const db = window.db;

    try {
        const q = query(collection(db, "calculos"),
            where("nome", "==", calculoAtual.nome),
            where("referenciasSaldos", "array-contains", calculoAtual.referenciaPagamento)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            alert(`Já existe um cálculo salvo para ${calculoAtual.nome} na referência ${calculoAtual.referenciaPagamento}. Não será duplicado.`);
            return;
        }

        const dadosParaSalvar = {
            nome: calculoAtual.nome,
            referenciaPagamento: calculoAtual.referenciaPagamento,
            tipoCalculo: calculoAtual.tipoCalculo,
            calculoCompleto: calculoAtual,
            dataSalvo: serverTimestamp(),
            referenciasSaldos: []
        };

        if (calculoAtual.tipoCalculo === "FERIAS") {
            dadosParaSalvar.referenciasSaldos.push(calculoAtual.referenciaPagamento);
            if (calculoAtual.pagamentoSaldoMesInicioFerias?.referenciaISO) {
                dadosParaSalvar.referenciasSaldos.push(calculoAtual.pagamentoSaldoMesInicioFerias.referenciaISO);
            }
            if (calculoAtual.pagamentoSaldoMesTerminoFerias?.referenciaISO) {
                dadosParaSalvar.referenciasSaldos.push(calculoAtual.pagamentoSaldoMesTerminoFerias.referenciaISO);
            }
        } else {
            dadosParaSalvar.referenciasSaldos.push(calculoAtual.referenciaPagamento);
        }

        const docRef = await addDoc(collection(db, "calculos"), dadosParaSalvar);
        console.log("Documento salvo com ID: ", docRef.id);
        alert("Dados do cálculo salvos com sucesso!");

    } catch (error) {
        console.error("Erro ao salvar dados no Firebase: ", error);
        alert("Ocorreu um erro ao salvar os dados.");
    } finally {
        btnSalvarFirebase.disabled = false;
        btnSalvarFirebase.textContent = 'Salvar no Banco de Dados';
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
      if (fldTetoInss.value) {
          let numValue = parseFloat(cleanNumberString(fldTetoInss.value));
          if (!isNaN(numValue)) fldTetoInss.value = formatToBRL(numValue);
      }
      if (fldFeriasVencidasInput.value) {
          let numValue = parseFloat(cleanNumberString(fldFeriasVencidasInput.value));
          if (!isNaN(numValue)) fldFeriasVencidasInput.value = formatToBRL(numValue);
      }
      const hojeParaRef = new Date();
      const mesAtual = String(hojeParaRef.getMonth() + 1).padStart(2, '0');
      const anoAtual = hojeParaRef.getFullYear();
      if (!fldReferencia.value) {
          fldReferencia.value = `${anoAtual}-${mesAtual}`;
      }
  });

  // --- LÓGICA DA NOVA ABA DE CONSULTA ---
  const btnAbrirConsulta = document.getElementById('btnAbrirConsulta');
  const consultaContainer = document.getElementById('consultaContainer');
  const btnBuscarRegistros = document.getElementById('btnBuscarRegistros');
  const consultaNomeInput = document.getElementById('consultaNome');
  const listaResultadosBuscaDiv = document.getElementById('listaResultadosBusca');
  const detalheRegistroSalvoDiv = document.getElementById('detalheRegistroSalvo');
  const conteudoDetalheRegistroDiv = document.getElementById('conteudoDetalheRegistro');
  const btnPdfRegistroSalvo = document.getElementById('btnPdfRegistroSalvo');

  btnAbrirConsulta.addEventListener('click', () => {
      const isHidden = consultaContainer.style.display === 'none';
      consultaContainer.style.display = isHidden ? 'block' : 'none';
      btnAbrirConsulta.textContent = isHidden ? 'Fechar Consulta' : 'Consultar Registros Salvos';
  });

  btnBuscarRegistros.addEventListener('click', async () => {
      const nome = consultaNomeInput.value;
      if (!nome) {
          alert("Por favor, selecione um nome para a busca.");
          return;
      }
      listaResultadosBuscaDiv.innerHTML = '<p>Buscando...</p>';
      detalheRegistroSalvoDiv.style.display = 'none';

      const { collection, query, where, getDocs, orderBy } = window.firestoreFunctions;
      const db = window.db;
      
      const q = query(collection(db, "calculos"), where("nome", "==", nome), orderBy("referenciaPagamento", "desc"));
      
      try {
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
              listaResultadosBuscaDiv.innerHTML = `<p>Nenhum registro encontrado para ${nome}.</p>`;
              return;
          }
          let resultadosHtml = '<ul>';
          querySnapshot.forEach(doc => {
              const data = doc.data();
              const refFormatada = data.referenciaPagamento.split('-').reverse().join('/');
              resultadosHtml += `<li>${data.tipoCalculo} - ${refFormatada} <button class="link-button" onclick="exibirRegistroDetalhado('${doc.id}')">Ver Detalhes</button></li>`;
          });
          resultadosHtml += '</ul>';
          listaResultadosBuscaDiv.innerHTML = resultadosHtml;

      } catch (error) {
          console.error("Erro ao buscar registros: ", error);
          listaResultadosBuscaDiv.innerHTML = '<p style="color:red;">Ocorreu um erro ao buscar os registros.</p>';
      }
  });

  window.exibirRegistroDetalhado = async (docId) => {
      if (!docId) return;
      conteudoDetalheRegistroDiv.innerHTML = '<p>Carregando detalhes...</p>';
      detalheRegistroSalvoDiv.style.display = 'block';

      const { doc, getDoc, getFirestore } = await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
      const db = getFirestore();
      
      try {
          const docRef = doc(db, "calculos", docId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
              const calculoCompleto = docSnap.data().calculoCompleto;
              calculoAtual = calculoCompleto;
              
              contextoAtual.referencia = calculoCompleto.referenciaPagamento;
              bloquearFormularioEExibirDados(calculoCompleto, calculoCompleto.referenciaPagamento);
              
              conteudoDetalheRegistroDiv.innerHTML = resultadoHtml.innerHTML;
              resultadoHtml.innerHTML = '';
              divResultado.style.display = 'none';
              infoBloqueioDiv.style.display = 'none';
              
          } else {
              conteudoDetalheRegistroDiv.innerHTML = '<p style="color:red;">Registro não encontrado.</p>';
          }
      } catch (error) {
          console.error("Erro ao carregar detalhe do registro: ", error);
          conteudoDetalheRegistroDiv.innerHTML = '<p style="color:red;">Ocorreu um erro ao carregar os detalhes.</p>';
      }
  };
  
  btnPdfRegistroSalvo.addEventListener('click', gerarPDF);
}
// --- FIM DO ARQUIVO script.js ---