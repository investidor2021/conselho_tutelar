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

  // --- Referências aos Elementos do 13º Salário ---
  const chkDecimoTerceiro = document.getElementById('isDecimoTerceiro');
  const decimoTerceiroCamposDiv = document.getElementById('decimoTerceiroCampos');
  const radioPrimeiraParcela = document.getElementById('primeiraParcela');
  const radioSegundaParcela = document.getElementById('segundaParcela');
  const fldMeses13Avos = document.getElementById('meses13Avos');
  const groupAdiantamentoPago = document.getElementById('groupAdiantamentoPago');
  const fldValorAdiantamentoPago = document.getElementById('valorAdiantamentoPago');

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

  // ============================================================
  // FUNÇÃO AUXILIAR: Busca salário do histórico para um mês/ano
  // Se não encontrar, usa o salário atual como fallback
  // ============================================================
  async function buscarSalarioHistorico(mes, ano, salarioFallback, tetoFallback) {
    try {
      if (typeof window.buscarSalarioPorMesAno === 'function') {
        const registro = await window.buscarSalarioPorMesAno(mes, ano);
        if (registro) {
          return {
            salario: registro.salarioBase,
            teto: registro.tetoInss,
            origem: 'historico'
          };
        }
      }
    } catch (e) {
      console.warn(`Histórico não disponível para ${mes}/${ano}, usando fallback.`, e);
    }
    return {
      salario: salarioFallback,
      teto: tetoFallback,
      origem: 'fallback'
    };
  }

  // ============================================================
  // FUNÇÃO AUXILIAR: Calcula 13º com histórico de salários
  // Busca o salário de cada mês de Janeiro até mesAtual
  // e soma os avos proporcionais usando o salário correto de cada mês
  // ============================================================
  async function calcular13ComHistoricoLocal(anoRef, mesAtual, salarioFallback, tetoFallback) {
    const MESES_LABEL = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                         'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    let totalBase = 0;
    const detalhes = [];

    for (let m = 1; m <= mesAtual; m++) {
      const registro = await buscarSalarioHistorico(m, anoRef, salarioFallback, tetoFallback);
      const avo = registro.salario / 12;
      totalBase += avo;
      detalhes.push({
        mes: m,
        label: MESES_LABEL[m],
        salario: registro.salario,
        teto: registro.teto,
        avo,
        origem: registro.origem
      });
    }

    return {
      totalBase,
      avos: mesAtual,
      detalhes,
      adiantamento50: totalBase / 2
    };
  }

  async function calcular13AutomaticoPrimeiraParcela(mesRefPag, anoRefPag, salarioBaseInput, tetoInssInformado) {
    const resultado13 = await calcular13ComHistoricoLocal(
      anoRefPag,
      mesRefPag,
      salarioBaseInput,
      tetoInssInformado
    );

    return {
      mesesAvos: mesRefPag,
      valorTotal13: resultado13.totalBase,
      valorAdiantamento: truncateDecimal(resultado13.totalBase / 2, 2),
      detalhes: resultado13.detalhes
    };
  }

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

              if (calculoCompleto.pagamento13Adiantamento) {
                  const pag13 = calculoCompleto.pagamento13Adiantamento;
                  htmlSalvo += `<hr class="separador-demonstrativo"><p class="titulo-demonstrativo">13º Salário - 1ª Parcela Automática</p>`;
                  htmlSalvo += `<div class="resumo-item"><span>Referência do 13º:</span> <span>${pag13.referencia}</span></div>`;
                  htmlSalvo += `<div class="resumo-item"><span>Meses considerados:</span> <span>${pag13.mesesAvos}/12</span></div>`;
                  htmlSalvo += `<div class="resumo-item"><span>Valor Total 13º:</span> <span>${formatCurrency(pag13.valorTotal13)}</span></div>`;
                  htmlSalvo += `<div class="resumo-item"><span>Adiantamento 50%:</span> <span>${formatCurrency(pag13.adiantamento13)}</span></div>`;
              }

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
      chkDecimoTerceiro.dispatchEvent(new Event('change'));
      
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
    const isDecimoTerceiroChecked = chkDecimoTerceiro.checked;
    
    if (!nome || !referenciaPagamento || salarioBaseInput <= 0 || tetoInssInformado <= 0) {
        alert("Por favor, preencha Nome, Referência do Pagamento, Salário Base (maior que zero) e Teto INSS (maior que zero).");
        return;
    }
    
    calculoAtual = {
        nome, referenciaPagamento, salarioBaseInput, tetoInssInformado,
        isRescisao: isRescisaoChecked, isFeriasNormais: isFeriasNormaisChecked, isDecimoTerceiro: isDecimoTerceiroChecked,
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
    htmlResultadoFinal += `<div class="resumo-item"><span>Referência do Pagamento:</span> <span>${mesAnoReferenciaPagamentoFormatado}</span></div>`;

    // ============================================================
    // BLOCO: 13º SALÁRIO
    // ============================================================
    if (isDecimoTerceiroChecked) {
        calculoAtual.tipoCalculo = "DECIMO_TERCEIRO";
        const pagAtual = calculoAtual.pagamentoAtual;
        const isPrimeiraParcela = radioPrimeiraParcela.checked;
        const mesesAvos = parseInt(fldMeses13Avos.value);

        pagAtual.parcelaInfo = { isPrimeira: isPrimeiraParcela, avos: mesesAvos };

        if (isPrimeiraParcela) {
            // ========================================================
            // 1ª PARCELA: Usa histórico de salários para calcular
            // os avos corretos mês a mês
            // ========================================================
            htmlResultadoFinal += '<div class="resumo-item"><span>TIPO:</span> <span><b>13º SALÁRIO - 1ª PARCELA (ADIANTAMENTO)</b></span></div><hr>';

            // Mostra loading enquanto busca o histórico
            btnCalcular.disabled = true;
            btnCalcular.textContent = 'Calculando...';

            let resultado13 = null;
            try {
              resultado13 = await calcular13ComHistoricoLocal(
                anoRefPag,
                mesesAvos,
                salarioBaseInput,
                tetoInssInformado
              );
            } catch(e) {
              console.warn('Erro ao calcular 13º com histórico, usando salário fixo.', e);
            }

            btnCalcular.disabled = false;
            btnCalcular.textContent = 'Calcular';

            // Valores finais
            const valorTotal13    = resultado13 ? resultado13.totalBase : (salarioBaseInput / 12) * mesesAvos;
            const valorAdiantamento = valorTotal13 / 2;
            const detalhes13      = resultado13 ? resultado13.detalhes : [];
            const usouHistorico   = resultado13 !== null;

            // Salva no calculoAtual para o Firebase e PDF
            pagAtual.proventos.adiantamento13 = valorAdiantamento;
            pagAtual.totais.proventosBrutos   = valorAdiantamento;
            pagAtual.totais.descontos         = 0;
            pagAtual.totais.liquido           = valorAdiantamento;
            pagAtual.historico13              = detalhes13;
            pagAtual.valorTotal13             = valorTotal13;

            // Monta breakdown mês a mês (se veio do histórico)
            let detalheHtml = '';
            if (usouHistorico && detalhes13.length > 0) {
              detalheHtml += `<div style="background:#f0f7ff; border-left:4px solid #17a2b8; padding:8px 12px; margin:8px 0; border-radius:4px;">`;
              detalheHtml += `<small style="color:#555;"><b>📊 Breakdown por mês (via histórico):</b><br>`;
              detalhes13.forEach(d => {
                const origemIcon = d.origem === 'historico' ? '✅' : '⚠️';
                detalheHtml += `${origemIcon} <b>${d.label}:</b> ${formatCurrency(d.salario)} → avo: ${formatCurrency(d.avo)}<br>`;
              });
              detalheHtml += `</small></div>`;
            } else if (!usouHistorico) {
              detalheHtml += `<div style="background:#fff3cd; border-left:4px solid #ffc107; padding:8px 12px; margin:8px 0; border-radius:4px;">
                <small>⚠️ Histórico de salários não encontrado. Usando salário atual (${formatCurrency(salarioBaseInput)}) para todos os ${mesesAvos} avos.</small>
              </div>`;
            }

            htmlResultadoFinal += `<div class="resumo-item"><span>Salário Base (Ref. 13º):</span> <span>${formatCurrency(salarioBaseInput)}</span></div>`;
            htmlResultadoFinal += detalheHtml;
            htmlResultadoFinal += `<div class="resumo-item"><span>Valor Total 13º (${mesesAvos}/12 com histórico):</span> <span>${formatCurrency(valorTotal13)}</span></div><hr>`;
            htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">PAGAMENTO:</p>`;
            htmlResultadoFinal += `<div class="resumo-item"><span>Adiantamento 50%:</span> <span>${formatCurrency(valorAdiantamento)}</span></div>`;
            htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pagAtual.totais.liquido)}</span></div>`;

        } else {
            // ========================================================
            // 2ª PARCELA: Usa salário base atual (referência dezembro)
            // O cálculo da 2ª parcela usa o salário de dezembro/atual
            // ========================================================
            htmlResultadoFinal += '<div class="resumo-item"><span>TIPO:</span> <span><b>13º SALÁRIO - 2ª PARCELA (PAGAMENTO FINAL)</b></span></div><hr>';
            const valorAdiantamentoPago = parseFloat(cleanNumberString(fldValorAdiantamentoPago.value)) || 0;

            // Para 2ª parcela: recalcula total com histórico também
            btnCalcular.disabled = true;
            btnCalcular.textContent = 'Calculando...';

            let resultado13_2a = null;
            try {
              resultado13_2a = await calcular13ComHistoricoLocal(
                anoRefPag,
                mesesAvos,
                salarioBaseInput,
                tetoInssInformado
              );
            } catch(e) {
              console.warn('Erro ao calcular 2ª parcela com histórico.', e);
            }

            btnCalcular.disabled = false;
            btnCalcular.textContent = 'Calcular';

            const valorTotal13 = resultado13_2a ? resultado13_2a.totalBase : (salarioBaseInput / 12) * mesesAvos;

            const resultadoINSS = calcularINSSContribuinteIndividual(valorTotal13, tetoInssInformado);
            const baseIRRF = valorTotal13 - resultadoINSS.valor;
            const resultadoIRRF = calcularIRRF(baseIRRF);

            const totalDescontos = valorAdiantamentoPago + resultadoINSS.valor + resultadoIRRF.valor;
            const valorLiquido = valorTotal13 - totalDescontos;
            
            pagAtual.proventos.decimoTerceiroTotal = valorTotal13;
            if (valorAdiantamentoPago > 0) pagAtual.descontos.adiantamentoPago = valorAdiantamentoPago;
            if (resultadoINSS.valor > 0) pagAtual.descontos.inssSobre13 = resultadoINSS.valor;
            if (resultadoIRRF.valor > 0) pagAtual.descontos.irrfSobre13 = resultadoIRRF.valor;

            pagAtual.baseINSSAjustada = resultadoINSS.baseAjustada;
            pagAtual.resultadoIRRF = resultadoIRRF;
            pagAtual.historico13   = resultado13_2a ? resultado13_2a.detalhes : [];
            pagAtual.valorTotal13  = valorTotal13;
            
            pagAtual.totais.proventosBrutos = valorTotal13;
            pagAtual.totais.descontos = totalDescontos;
            pagAtual.totais.liquido = valorLiquido;

            // Breakdown 2ª parcela
            let detalheHtml2 = '';
            if (resultado13_2a && resultado13_2a.detalhes.length > 0) {
              detalheHtml2 += `<div style="background:#f0f7ff; border-left:4px solid #17a2b8; padding:8px 12px; margin:8px 0; border-radius:4px;">`;
              detalheHtml2 += `<small style="color:#555;"><b>📊 Breakdown por mês (via histórico):</b><br>`;
              resultado13_2a.detalhes.forEach(d => {
                const origemIcon = d.origem === 'historico' ? '✅' : '⚠️';
                detalheHtml2 += `${origemIcon} <b>${d.label}:</b> ${formatCurrency(d.salario)} → avo: ${formatCurrency(d.avo)}<br>`;
              });
              detalheHtml2 += `</small></div>`;
            }

            htmlResultadoFinal += `<div class="resumo-item"><span>Salário Base (Ref. 13º):</span> <span>${formatCurrency(salarioBaseInput)}</span></div>`;
            htmlResultadoFinal += detalheHtml2;
            htmlResultadoFinal += `<hr><p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">PROVENTOS:</p>`;
            htmlResultadoFinal += `<div class="resumo-item"><span>13º Salário Total (${mesesAvos}/12 com histórico):</span> <span>${formatCurrency(valorTotal13)}</span></div>`;
            htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pagAtual.totais.proventosBrutos)}</span></div><br>`;
            
            htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS:</p>`;
            if (pagAtual.descontos.adiantamentoPago > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Adiantamento (1ª Parcela):</span> <span>${formatCurrency(pagAtual.descontos.adiantamentoPago)}</span></div>`;
            if (pagAtual.descontos.inssSobre13 > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS s/ 13º (s/ ${formatCurrency(pagAtual.baseINSSAjustada)}):</span> <span>${formatCurrency(pagAtual.descontos.inssSobre13)}</span></div>`;
            if (pagAtual.descontos.irrfSobre13 > 0) htmlResultadoFinal += `<div class="resumo-item"><span>IRRF s/ 13º (s/ ${formatCurrency(pagAtual.resultadoIRRF.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(pagAtual.resultadoIRRF.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(pagAtual.resultadoIRRF.deducao)}</small> ${formatCurrency(pagAtual.descontos.irrfSobre13)}</span></div>`;
            htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pagAtual.totais.descontos)}</span></div><br>`;
            
            htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER (2ª Parcela):</span><span>${formatCurrency(pagAtual.totais.liquido)}</span></div>`;
        }

    // ============================================================
    // BLOCO: RESCISÃO
    // ============================================================
    } else if (isRescisaoChecked) {
        calculoAtual.tipoCalculo = "RESCISAO";
        const pagAtual = calculoAtual.pagamentoAtual;

        const saldoSalarioDias = parseInt(fldSaldoSalarioDias.value) || 0;
        const meses13Rescisao = parseInt(fldMeses13.value) || 0;
        const mesesFeriasProp = parseInt(fldMesesFeriasProp.value) || 0;
        const incluirAviso = chkAvisoPrevio.checked;
        const valorFeriasVencidas = valorFeriasVencidasInput;

        const saldoSalario = (salarioBaseInput / 30) * saldoSalarioDias;
        const valor13Rescisao = (salarioBaseInput / 12) * meses13Rescisao;
        const feriasProp = (salarioBaseInput / 12) * mesesFeriasProp;
        const umTercoFeriasProp = feriasProp / 3;
        const avisoPrevio = incluirAviso ? salarioBaseInput : 0;

        const totalProventosBrutos = saldoSalario + valor13Rescisao + feriasProp + umTercoFeriasProp + avisoPrevio + valorFeriasVencidas;

        const baseInssRescisao = saldoSalario + valor13Rescisao;
        const resultadoINSSRescisao = calcularINSSContribuinteIndividual(baseInssRescisao, tetoInssInformado);

        const baseIRRFRescisao = totalProventosBrutos - resultadoINSSRescisao.valor;
        const resultadoIRRFRescisao = calcularIRRF(baseIRRFRescisao);

        const totalDescontosRescisao = resultadoINSSRescisao.valor + resultadoIRRFRescisao.valor;
        const liquidoRescisao = totalProventosBrutos - totalDescontosRescisao;

        pagAtual.proventos.saldoSalario = saldoSalario;
        pagAtual.diasTrabalhados = saldoSalarioDias;
        if (valor13Rescisao > 0) pagAtual.proventos.decimoTerceiroProp = valor13Rescisao;
        if (feriasProp > 0) pagAtual.proventos.feriasProp = feriasProp;
        if (umTercoFeriasProp > 0) pagAtual.proventos.umTercoFeriasProp = umTercoFeriasProp;
        if (avisoPrevio > 0) pagAtual.proventos.avisoPrevio = avisoPrevio;
        if (valorFeriasVencidas > 0) pagAtual.proventos.feriasVencidas = valorFeriasVencidas;

        pagAtual.baseINSSAjustada = resultadoINSSRescisao.baseAjustada;
        pagAtual.resultadoIRRF = resultadoIRRFRescisao;
        if (resultadoINSSRescisao.valor > 0) pagAtual.descontos.inss = resultadoINSSRescisao.valor;
        if (resultadoIRRFRescisao.valor > 0) pagAtual.descontos.irrf = resultadoIRRFRescisao.valor;

        pagAtual.totais.proventosBrutos = totalProventosBrutos;
        pagAtual.totais.descontos = totalDescontosRescisao;
        pagAtual.totais.liquido = liquidoRescisao;

        htmlResultadoFinal += `<div class="resumo-item"><span>TIPO:</span> <span><b>RESCISÃO DE CONTRATO</b></span></div><hr>`;
        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">PROVENTOS:</p>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Saldo de Salário (${saldoSalarioDias} dias):</span> <span>${formatCurrency(saldoSalario)}</span></div>`;
        if (valor13Rescisao > 0) htmlResultadoFinal += `<div class="resumo-item"><span>13º Salário Prop. (${meses13Rescisao}/12):</span> <span>${formatCurrency(valor13Rescisao)}</span></div>`;
        if (feriasProp > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Férias Proporcionais (${mesesFeriasProp}/12):</span> <span>${formatCurrency(feriasProp)}</span></div>`;
        if (umTercoFeriasProp > 0) htmlResultadoFinal += `<div class="resumo-item"><span>1/3 sobre Férias Prop.:</span> <span>${formatCurrency(umTercoFeriasProp)}</span></div>`;
        if (valorFeriasVencidas > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Férias Vencidas + 1/3:</span> <span>${formatCurrency(valorFeriasVencidas)}</span></div>`;
        if (avisoPrevio > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Aviso Prévio Indenizado:</span> <span>${formatCurrency(avisoPrevio)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(totalProventosBrutos)}</span></div><br>`;

        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS:</p>`;
        if (resultadoINSSRescisao.valor > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(resultadoINSSRescisao.baseAjustada)}):</span> <span>${formatCurrency(resultadoINSSRescisao.valor)}</span></div>`;
        if (resultadoIRRFRescisao.valor > 0) htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(resultadoIRRFRescisao.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(resultadoIRRFRescisao.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(resultadoIRRFRescisao.deducao)}</small> ${formatCurrency(resultadoIRRFRescisao.valor)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(totalDescontosRescisao)}</span></div><br>`;
        htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(liquidoRescisao)}</span></div>`;

    // ============================================================
    // BLOCO: FÉRIAS
    // ============================================================
    } else if (isFeriasNormaisChecked) {
        calculoAtual.tipoCalculo = "FERIAS";
        const dataInicioFeriasStr = fldDataInicioFerias.value;
        const diasFeriasGozo = parseInt(fldDiasFeriasGozo.value) || 30;

        if (!dataInicioFeriasStr) {
            alert("Por favor, informe a Data de Início das Férias.");
            return;
        }

        const dataInicioFerias = new Date(dataInicioFeriasStr + "T00:00:00");
        const dataFimFerias = new Date(dataInicioFerias);
        dataFimFerias.setDate(dataInicioFerias.getDate() + diasFeriasGozo - 1);

        const mesInicioFerias = dataInicioFerias.getMonth() + 1;
        const anoInicioFerias = dataInicioFerias.getFullYear();
        const mesFimFerias = dataFimFerias.getMonth() + 1;
        const anoFimFerias = dataFimFerias.getFullYear();

        calculoAtual.dataInicioFerias = dataInicioFeriasStr;
        calculoAtual.dataFimFerias = dataFimFerias.toLocaleDateString('pt-BR');
        calculoAtual.diasDeFeriasSelecionados = diasFeriasGozo;

        const diaInicioFerias = dataInicioFerias.getDate();
        const diasTrabalhadosMesRef = diaInicioFerias - 1;
        const diasNoMesRef = 30;
        const diasFaltaMesRef = diasFaltaInput;

        const salarioProporcionalMesRef = (salarioBaseInput / diasNoMesRef) * Math.max(0, diasTrabalhadosMesRef - diasFaltaMesRef);
        const descontoFaltasMesRef = (salarioBaseInput / diasNoMesRef) * diasFaltaMesRef;

        const resultadoINSSMesRef = calcularINSSContribuinteIndividual(salarioProporcionalMesRef, tetoInssInformado);
        const baseIRRFMesRef = salarioProporcionalMesRef - resultadoINSSMesRef.valor;
        const resultadoIRRFMesRef = calcularIRRF(baseIRRFMesRef);
        const totalDescontosMesRef = resultadoINSSMesRef.valor + resultadoIRRFMesRef.valor + descontoFaltasMesRef;
        const liquidoMesRef = salarioProporcionalMesRef - resultadoINSSMesRef.valor - resultadoIRRFMesRef.valor;

        const pagamentoSalario = {
            referencia: mesAnoReferenciaPagamentoFormatado,
            proventos: { salario: salarioProporcionalMesRef, descFaltas: descontoFaltasMesRef },
            descontos: { inss: resultadoINSSMesRef.valor, irrf: resultadoIRRFMesRef.valor },
            baseINSSAjustada: resultadoINSSMesRef.baseAjustada,
            resultadoIRRF: resultadoIRRFMesRef,
            totais: { proventosBrutos: salarioProporcionalMesRef, descontos: totalDescontosMesRef, liquido: liquidoMesRef }
        };
        calculoAtual.pagamentoPrincipalSalario = pagamentoSalario;

        const salarioFeriasIntegral = salarioBaseInput;
        const feriasProporcionais = (salarioFeriasIntegral / 30) * diasFeriasGozo;
        const umTercoFerias = feriasProporcionais / 3;
        const totalFeriasBruto = feriasProporcionais + umTercoFerias;

        const resultadoINSSFerias = calcularINSSContribuinteIndividual(feriasProporcionais, tetoInssInformado);
        const baseIRRFFerias = totalFeriasBruto - resultadoINSSFerias.valor;
        const resultadoIRRFFerias = calcularIRRF(baseIRRFFerias);
        const totalDescontosFerias = resultadoINSSFerias.valor + resultadoIRRFFerias.valor;
        const liquidoFerias = totalFeriasBruto - totalDescontosFerias;

        const mesAnoFeriasFormatado = `${String(mesInicioFerias).padStart(2,'0')}/${anoInicioFerias}`;
        const pagamentoFerias = {
            referencia: mesAnoFeriasFormatado,
            proventos: { ferias: feriasProporcionais, umTerco: umTercoFerias },
            descontos: { inss: resultadoINSSFerias.valor, irrf: resultadoIRRFFerias.valor },
            baseINSSAjustada: resultadoINSSFerias.baseAjustada,
            resultadoIRRF: resultadoIRRFFerias,
            totais: { proventosBrutos: totalFeriasBruto, descontos: totalDescontosFerias, liquido: liquidoFerias }
        };
        calculoAtual.pagamentoPrincipalFerias = pagamentoFerias;

        const liquidoTotal = liquidoMesRef + liquidoFerias;
        calculoAtual.pagamentoPrincipalTotal = {
            totais: { liquido: liquidoTotal }
        };

        let avisoDecimo13 = '';
        if (mesInicioFerias === 11) {
            avisoDecimo13 = `<div class="info" style="margin-top:15px; background:#fff3cd; border-left: 4px solid #ffc107; padding: 10px;">
                <strong>⚠️ Atenção – Férias em Novembro:</strong> Por lei, a 1ª parcela do 13º salário deve ser paga junto com as férias de novembro. 
                Utilize o módulo <b>13º Salário → 1ª Parcela</b> para calcular e incluir o adiantamento de 50% (${Math.min(mesInicioFerias, 12)}/12 avos) e somar ao líquido total.
            </div>`;
        } else if (mesInicioFerias === 6) {
            avisoDecimo13 = `<div class="info" style="margin-top:15px; background:#d1ecf1; border-left: 4px solid #17a2b8; padding: 10px;">
                <strong>ℹ️ Atenção – Férias em Junho / 1ª Parcela do 13º em Julho:</strong><br>
                Como as férias iniciam em junho, o pagamento de férias cobre o salário proporcional de junho e o adiantamento de férias.<br>
                <b>A 1ª parcela do 13º salário (adiantamento de 50% sobre 6/12 avos) deve ser calculada e paga SEPARADAMENTE em julho (mês 07/${anoInicioFerias})</b>, 
                utilizando o módulo <b>13º Salário → 1ª Parcela → 6 avos</b>. Ela NÃO soma para a base de IRRF das férias.
            </div>`;
        } else if (mesInicioFerias === 7) {
            avisoDecimo13 = `<div class="info" style="margin-top:15px; background:#d1ecf1; border-left: 4px solid #17a2b8; padding: 10px;">
                <strong>ℹ️ Atenção – Férias em Julho / 1ª Parcela do 13º:</strong><br>
                Como as férias iniciam em julho, o sistema calculará automaticamente a 1ª parcela do 13º salário (adiantamento de 50% sobre 7/12 avos) e registrará o pagamento como referência 06 para evitar confusão.<br>
                <b>O valor do adiantamento do 13º NÃO soma para a base de cálculo do IRRF das férias.</b> Na 2ª parcela (dezembro), 
                deduz-se o adiantamento já pago e aplica-se INSS e IRRF sobre o total do 13º (12/12 avos).
            </div>`;
        } else {
            avisoDecimo13 = `<div class="info" style="margin-top:15px; background:#e2e3e5; border-left: 4px solid #6c757d; padding: 10px;">
                <strong>ℹ️ 13º Salário:</strong> O adiantamento da 1ª parcela do 13º salário não é pago junto com as férias neste mês. 
                Utilize o módulo <b>13º Salário → 1ª Parcela</b> separadamente, conforme o calendário de pagamento.
            </div>`;
        }

        let pagamento13Automatica = null;
        let valorAdiantamento13 = 0;
        const isAuto13Ferias = (mesRefPag === 7 && mesInicioFerias === 7) || (mesRefPag === 6 && mesInicioFerias === 6);
        let mesReferencia13 = mesRefPag;
        let anoReferencia13 = anoRefPag;

        if (mesRefPag === 7 && mesInicioFerias === 7) {
            mesReferencia13 = 6;
        }

        if (isAuto13Ferias) {
            try {
                pagamento13Automatica = await calcular13AutomaticoPrimeiraParcela(
                    mesInicioFerias,
                    anoRefPag,
                    salarioBaseInput,
                    tetoInssInformado
                );
            } catch (e) {
                console.warn('Erro ao calcular 13º automático para férias com referência junho/julho.', e);
            }
        }

        if (pagamento13Automatica) {
            valorAdiantamento13 = pagamento13Automatica.valorAdiantamento;
            calculoAtual.pagamento13Adiantamento = {
                referencia: `${String(mesReferencia13).padStart(2, '0')}/${anoReferencia13}`,
                mesesAvos: pagamento13Automatica.mesesAvos,
                valorTotal13: pagamento13Automatica.valorTotal13,
                adiantamento13: pagamento13Automatica.valorAdiantamento,
                detalhes13: pagamento13Automatica.detalhes,
                totais: {
                    proventosBrutos: pagamento13Automatica.valorAdiantamento,
                    descontos: 0,
                    liquido: pagamento13Automatica.valorAdiantamento
                }
            };

            htmlResultadoFinal += `<hr class="separador-demonstrativo"><p class="titulo-demonstrativo">13º Salário - 1ª Parcela Automática</p>`;
            htmlResultadoFinal += `<div class="resumo-item"><span>Referência do 13º:</span> <span>${String(mesReferencia13).padStart(2, '0')}/${anoReferencia13}</span></div>`;
            htmlResultadoFinal += `<div class="resumo-item"><span>Meses considerados:</span> <span>${pagamento13Automatica.mesesAvos}/12</span></div>`;
            htmlResultadoFinal += `<div class="resumo-item"><span>Valor Total 13º:</span> <span>${formatCurrency(pagamento13Automatica.valorTotal13)}</span></div>`;
            htmlResultadoFinal += `<div class="resumo-item"><span>Adiantamento 50%:</span> <span>${formatCurrency(pagamento13Automatica.valorAdiantamento)}</span></div>`;
        }

        htmlResultadoFinal += `<div class="resumo-item"><span>TIPO:</span> <span><b>RECIBO DE FÉRIAS</b></span></div>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Período de Gozo:</span> <span>${dataInicioFerias.toLocaleDateString('pt-BR')} a ${dataFimFerias.toLocaleDateString('pt-BR')} (${diasFeriasGozo} dias)</span></div>`;
        htmlResultadoFinal += `<hr>`;

        htmlResultadoFinal += `<p class="titulo-demonstrativo">Demonstrativo do Salário (Ref. ${mesAnoReferenciaPagamentoFormatado})</p>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Salário Base:</span> <span>${formatCurrency(salarioBaseInput)}</span></div>`;
        if (diasTrabalhadosMesRef < 30) htmlResultadoFinal += `<div class="resumo-item"><span>Salário Proporcional (${diasTrabalhadosMesRef} dias):</span> <span>${formatCurrency(salarioProporcionalMesRef)}</span></div>`;
        if (diasFaltaMesRef > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Desconto Faltas (${diasFaltaMesRef}d):</span> <span style="color:red;">(${formatCurrency(descontoFaltasMesRef)})</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>PROVENTOS (Salário):</span> <span>${formatCurrency(salarioProporcionalMesRef)}</span></div><br>`;
        if (resultadoINSSMesRef.valor > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS Proporcional:</span> <span>${formatCurrency(resultadoINSSMesRef.valor)}</span></div>`;
        if (resultadoIRRFMesRef.valor > 0) htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(resultadoIRRFMesRef.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(resultadoIRRFMesRef.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(resultadoIRRFMesRef.deducao)}</small> ${formatCurrency(resultadoIRRFMesRef.valor)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS (Salário):</span> <span>${formatCurrency(totalDescontosMesRef)}</span></div><br>`;
        htmlResultadoFinal += `<div class="resumo-item total" style="background-color: #e9ecef;"><span>LÍQUIDO (Salário):</span><span>${formatCurrency(liquidoMesRef)}</span></div>`;

        htmlResultadoFinal += `<hr class="separador-demonstrativo">`;

        htmlResultadoFinal += `<p class="titulo-demonstrativo">Demonstrativo das Férias (Ref. ${mesAnoFeriasFormatado})</p>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Férias (${diasFeriasGozo} dias):</span> <span>${formatCurrency(feriasProporcionais)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Adicional 1/3 sobre Férias:</span> <span>${formatCurrency(umTercoFerias)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>PROVENTOS (Férias):</span> <span>${formatCurrency(totalFeriasBruto)}</span></div><br>`;
        if (resultadoINSSFerias.valor > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS Proporcional:</span> <span>${formatCurrency(resultadoINSSFerias.valor)}</span></div>`;
        if (resultadoIRRFFerias.valor > 0) htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(resultadoIRRFFerias.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(resultadoIRRFFerias.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(resultadoIRRFFerias.deducao)}</small> ${formatCurrency(resultadoIRRFFerias.valor)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS (Férias):</span> <span>${formatCurrency(totalDescontosFerias)}</span></div><br>`;
        htmlResultadoFinal += `<div class="resumo-item total" style="background-color: #e9ecef;"><span>LÍQUIDO (Férias):</span><span>${formatCurrency(liquidoFerias)}</span></div>`;

        htmlResultadoFinal += `<hr class="separador-demonstrativo" style="border-top: 2px solid #28a745;">`;
        htmlResultadoFinal += `<div class="resumo-item total" style="font-size: 1.2em;"><span>LÍQUIDO TOTAL A RECEBER:</span><span>${formatCurrency(liquidoTotal)}</span></div>`;
        htmlResultadoFinal += avisoDecimo13;

        const totalDiasNoMesInicio = new Date(anoInicioFerias, mesInicioFerias, 0).getDate();
        const diasFeriasNoMesInicio = Math.min(diasFeriasGozo, totalDiasNoMesInicio - dataInicioFerias.getDate() + 1);
        const diasRestantesAposFerias = totalDiasNoMesInicio - dataInicioFerias.getDate() + 1 - diasFeriasNoMesInicio;

        if (mesFimFerias !== mesInicioFerias) {
            const diasNoMesTermino = dataFimFerias.getDate();
            const diasTrabalhadosMesTermino = 30 - diasNoMesTermino;
            if (diasTrabalhadosMesTermino > 0) {
                const saldoMesTermino = (salarioBaseInput / 30) * diasTrabalhadosMesTermino;
                const resultadoINSSTermino = calcularINSSContribuinteIndividual(saldoMesTermino, tetoInssInformado);
                const baseIRRFTermino = saldoMesTermino - resultadoINSSTermino.valor;
                const resultadoIRRFTermino = calcularIRRF(baseIRRFTermino);
                const totalDescontosTermino = resultadoINSSTermino.valor + resultadoIRRFTermino.valor;
                const liquidoTermino = saldoMesTermino - totalDescontosTermino;

                const mesAnoTerminoFormatado = `${String(mesFimFerias).padStart(2,'0')}/${anoFimFerias}`;
                const referenciaISOTermino = `${anoFimFerias}-${String(mesFimFerias).padStart(2,'0')}`;
                calculoAtual.pagamentoSaldoMesTerminoFerias = {
                    referencia: mesAnoTerminoFormatado,
                    referenciaISO: referenciaISOTermino,
                    diasTrabalhados: diasTrabalhadosMesTermino,
                    proventos: { saldoSalario: saldoMesTermino },
                    descontos: { inss: resultadoINSSTermino.valor, irrf: resultadoIRRFTermino.valor },
                    baseINSSAjustada: resultadoINSSTermino.baseAjustada,
                    resultadoIRRF: resultadoIRRFTermino,
                    totais: { proventosBrutos: saldoMesTermino, descontos: totalDescontosTermino, liquido: liquidoTermino }
                };

                htmlInformativoSaldos += `<hr class="separador-demonstrativo"><p class="titulo-demonstrativo">Saldo do Mês de Término das Férias (${mesAnoTerminoFormatado})</p>`;
                htmlInformativoSaldos += `<div class="resumo-item"><span>Saldo de Salário (${diasTrabalhadosMesTermino} dias trabalhados após férias):</span> <span>${formatCurrency(saldoMesTermino)}</span></div>`;
                htmlInformativoSaldos += `<div class="resumo-item" style="font-weight:bold;"><span>PROVENTOS BRUTOS:</span> <span>${formatCurrency(saldoMesTermino)}</span></div><br>`;
                if (resultadoINSSTermino.valor > 0) htmlInformativoSaldos += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(resultadoINSSTermino.baseAjustada)}):</span> <span>${formatCurrency(resultadoINSSTermino.valor)}</span></div>`;
                if (resultadoIRRFTermino.valor > 0) htmlInformativoSaldos += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(resultadoIRRFTermino.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(resultadoIRRFTermino.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(resultadoIRRFTermino.deducao)}</small> ${formatCurrency(resultadoIRRFTermino.valor)}</span></div>`;
                htmlInformativoSaldos += `<div class="resumo-item" style="font-weight:bold;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(totalDescontosTermino)}</span></div><br>`;
                htmlInformativoSaldos += `<div class="resumo-item total"><span>LÍQUIDO (Saldo Mês Término):</span><span>${formatCurrency(liquidoTermino)}</span></div>`;
            }
        }

    // ============================================================
    // BLOCO: PAGAMENTO MENSAL
    // ============================================================
    } else {
        calculoAtual.tipoCalculo = "MENSAL";
        const pagAtual = calculoAtual.pagamentoAtual;

        const diasNoMes = 30;
        const diasFalta = diasFaltaInput;
        const diasTrabalhados = diasNoMes - diasFalta;
        const descontoFaltas = diasFalta > 0 ? (salarioBaseInput / diasNoMes) * diasFalta : 0;
        const salarioProporcional = salarioBaseInput - descontoFaltas;

        const resultadoINSSMensal = calcularINSSContribuinteIndividual(salarioProporcional, tetoInssInformado);
        const baseIRRFMensal = salarioProporcional - resultadoINSSMensal.valor;
        const resultadoIRRFMensal = calcularIRRF(baseIRRFMensal);

        let pagamento13Automatica = null;
        let valorAdiantamento13 = 0;

        if (mesRefPag === 7) {
            try {
                pagamento13Automatica = await calcular13AutomaticoPrimeiraParcela(
                    7,
                    anoRefPag,
                    salarioBaseInput,
                    tetoInssInformado
                );
            } catch (e) {
                console.warn('Erro ao calcular 13º automático para pagamento mensal no mês 7.', e);
            }
        }

        if (pagamento13Automatica) {
            valorAdiantamento13 = pagamento13Automatica.valorAdiantamento;
            calculoAtual.pagamento13Adiantamento = {
                referencia: `07/${anoRefPag}`,
                mesesAvos: pagamento13Automatica.mesesAvos,
                valorTotal13: pagamento13Automatica.valorTotal13,
                adiantamento13: pagamento13Automatica.valorAdiantamento,
                detalhes13: pagamento13Automatica.detalhes,
                totais: {
                    proventosBrutos: pagamento13Automatica.valorAdiantamento,
                    descontos: 0,
                    liquido: pagamento13Automatica.valorAdiantamento
                }
            };
        }

        const totalProventosBrutos = salarioProporcional + valorAdiantamento13;
        const totalDescontos = resultadoINSSMensal.valor + resultadoIRRFMensal.valor;
        const liquido = salarioProporcional - resultadoINSSMensal.valor - resultadoIRRFMensal.valor + valorAdiantamento13;

        pagAtual.proventos.salario = salarioBaseInput;
        if (valorAdiantamento13 > 0) {
            pagAtual.proventos.adiantamento13 = valorAdiantamento13;
        }
        if (descontoFaltas > 0) pagAtual.descontos.faltas = descontoFaltas;
        pagAtual.descontos.inss = resultadoINSSMensal.valor;
        pagAtual.descontos.irrf = resultadoIRRFMensal.valor;
        pagAtual.baseINSSAjustada = resultadoINSSMensal.baseAjustada;
        pagAtual.resultadoIRRF = resultadoIRRFMensal;
        pagAtual.totais.proventosBrutos = totalProventosBrutos;
        pagAtual.totais.descontos = totalDescontos;
        pagAtual.totais.liquido = liquido;

        htmlResultadoFinal += `<div class="resumo-item"><span>TIPO:</span> <span><b>PAGAMENTO MENSAL</b></span></div><hr>`;
        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">PROVENTOS:</p>`;
        htmlResultadoFinal += `<div class="resumo-item"><span>Salário Base:</span> <span>${formatCurrency(salarioBaseInput)}</span></div>`;
        if (valorAdiantamento13 > 0) {
            htmlResultadoFinal += `<div class="resumo-item"><span>13º Salário (1ª Parcela - Automática 7/12 avos):</span> <span>${formatCurrency(valorAdiantamento13)}</span></div>`;
        }
        if (diasFalta > 0) htmlResultadoFinal += `<div class="resumo-item"><span>Desconto por Faltas (${diasFalta} dia(s)):</span> <span style="color: red;">(${formatCurrency(descontoFaltas)})</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(totalProventosBrutos)}</span></div><br>`;

        htmlResultadoFinal += `<p style="font-weight: bold; margin-bottom: 5px; color: #0056b3;">DESCONTOS:</p>`;
        if (resultadoINSSMensal.valor > 0) htmlResultadoFinal += `<div class="resumo-item"><span>INSS 11% (s/ ${formatCurrency(resultadoINSSMensal.baseAjustada)}):</span> <span>${formatCurrency(resultadoINSSMensal.valor)}</span></div>`;
        if (resultadoIRRFMensal.valor > 0) htmlResultadoFinal += `<div class="resumo-item"><span>IRRF (s/ ${formatCurrency(resultadoIRRFMensal.baseCalculo)}):</span><span><small class="irrf-details">Alíq: ${(resultadoIRRFMensal.aliquota * 100).toFixed(1)}%, Ded: ${formatCurrency(resultadoIRRFMensal.deducao)}</small> ${formatCurrency(resultadoIRRFMensal.valor)}</span></div>`;
        htmlResultadoFinal += `<div class="resumo-item" style="font-weight:bold; margin-top: 5px;"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(totalDescontos)}</span></div><br>`;
        htmlResultadoFinal += `<div class="resumo-item total"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(liquido)}</span></div>`;
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
        };

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
            else if (calculoAtual.tipoCalculo === 'DECIMO_TERCEIRO') tipoCalculoStr = '13º SALÁRIO';
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
            if (calculoAtual.tipoCalculo === 'DECIMO_TERCEIRO') {
                const pagAtual = calculoAtual.pagamentoAtual;
                const { isPrimeira, avos } = pagAtual.parcelaInfo;

                if (isPrimeira) {
                    addTituloSecao('13º SALÁRIO - 1ª PARCELA (ADIANTAMENTO)');

                    // Breakdown do histórico no PDF
                    if (pagAtual.historico13 && pagAtual.historico13.length > 0) {
                        addTituloSecao('Breakdown por mês (histórico de salários):');
                        pagAtual.historico13.forEach(d => {
                            const origemStr = d.origem === 'historico' ? '✓' : '~fallback';
                            addLinhaDupla(
                                `  ${d.label} ${origemStr} (${formatCurrency(d.salario)}):`,
                                `avo: ${formatCurrency(d.avo)}`
                            );
                        });
                        addLinhaSeparadora();
                    }

                    addLinhaDupla('Valor Total 13º (' + avos + '/12 com histórico):', formatCurrency(pagAtual.valorTotal13 || pagAtual.proventos.adiantamento13 * 2));
                    addLinhaDupla('Adiantamento (50%):', formatCurrency(pagAtual.proventos.adiantamento13), true);
                    addLinhaDupla('LÍQUIDO A RECEBER:', formatCurrency(pagAtual.totais.liquido), true, 12);

                } else {
                    addTituloSecao('13º SALÁRIO - 2ª PARCELA (PAGAMENTO FINAL)');

                    // Breakdown no PDF da 2ª parcela
                    if (pagAtual.historico13 && pagAtual.historico13.length > 0) {
                        addTituloSecao('Breakdown por mês (histórico de salários):');
                        pagAtual.historico13.forEach(d => {
                            const origemStr = d.origem === 'historico' ? '✓' : '~fallback';
                            addLinhaDupla(
                                `  ${d.label} ${origemStr} (${formatCurrency(d.salario)}):`,
                                `avo: ${formatCurrency(d.avo)}`
                            );
                        });
                        addLinhaSeparadora();
                    }

                    addTituloSecao('PROVENTOS');
                    addLinhaDupla('13º Salário Total (' + avos + '/12 com histórico):', formatCurrency(pagAtual.proventos.decimoTerceiroTotal));
                    addLinhaDupla('TOTAL PROVENTOS:', formatCurrency(pagAtual.totais.proventosBrutos), true);
                    linhaY += 5;
                    addTituloSecao('DESCONTOS');
                    if (pagAtual.descontos.adiantamentoPago) addLinhaDupla('Adiantamento (1ª Parcela):', formatCurrency(pagAtual.descontos.adiantamentoPago));
                    if (pagAtual.descontos.inssSobre13) addLinhaDupla(`INSS s/ 13º (s/ ${formatCurrency(pagAtual.baseINSSAjustada)}):`, formatCurrency(pagAtual.descontos.inssSobre13));
                    if (pagAtual.descontos.irrfSobre13) {
                        const irrf = pagAtual.resultadoIRRF;
                        const aliquotaStr = `(Alíq: ${(irrf.aliquota * 100).toLocaleString('pt-BR')}%, Ded: ${formatCurrency(irrf.deducao)})`;
                        const valorDireita = `${aliquotaStr} ${formatCurrency(irrf.valor)}`;
                        addLinhaDupla(`IRRF s/ 13º (s/ ${formatCurrency(irrf.baseCalculo)}):`, valorDireita);
                    }
                    addLinhaDupla('TOTAL DESCONTOS:', formatCurrency(pagAtual.totais.descontos), true);
                    linhaY += 5;
                    addLinhaDupla('LÍQUIDO A RECEBER (2ª Parcela):', formatCurrency(pagAtual.totais.liquido), true, 12);
                }

            } else if (calculoAtual.tipoCalculo === 'FERIAS') {
                const pagSalario = calculoAtual.pagamentoPrincipalSalario;
                const pagFerias = calculoAtual.pagamentoPrincipalFerias;
                const pagTotal = calculoAtual.pagamentoPrincipalTotal;

                addTituloSecao(`Demonstrativo do Salário (Ref. ${pagSalario.referencia})`);
                addLinhaDupla('Salário Base:', formatCurrency(calculoAtual.salarioBaseInput));
                if (calculoAtual.diasFaltaPagAtual > 0) addLinhaDupla(`Desconto Faltas (${calculoAtual.diasFaltaPagAtual}d):`, `(${formatCurrency(pagSalario.proventos.descFaltas)})`);
                addLinhaDupla('PROVENTOS (Salário):', formatCurrency(pagSalario.totais.proventosBrutos), true);
                linhaY += 3;
                if (pagSalario.descontos.inss > 0) addLinhaDupla(`INSS Proporcional:`, formatCurrency(pagSalario.descontos.inss));
                if (pagSalario.descontos.irrf > 0) {
                    const irrf = pagSalario.resultadoIRRF;
                    addLinhaDupla(`IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):`, `(Alíq: ${(irrf.aliquota*100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}) ${formatCurrency(irrf.valor)}`);
                }
                addLinhaDupla('TOTAL DESCONTOS (Salário):', formatCurrency(pagSalario.totais.descontos), true);
                linhaY += 3;
                addLinhaDupla('LÍQUIDO (Salário):', formatCurrency(pagSalario.totais.liquido), true);

                addLinhaSeparadora();
                addTituloSecao(`Demonstrativo das Férias (Ref. ${pagFerias.referencia})`);
                addLinhaDupla(`Férias (${calculoAtual.diasDeFeriasSelecionados} dias):`, formatCurrency(pagFerias.proventos.ferias));
                addLinhaDupla('Adicional 1/3 sobre Férias:', formatCurrency(pagFerias.proventos.umTerco));
                addLinhaDupla('PROVENTOS (Férias):', formatCurrency(pagFerias.totais.proventosBrutos), true);
                linhaY += 3;
                if (pagFerias.descontos.inss > 0) addLinhaDupla(`INSS Proporcional:`, formatCurrency(pagFerias.descontos.inss));
                if (pagFerias.descontos.irrf > 0) {
                    const irrf = pagFerias.resultadoIRRF;
                    addLinhaDupla(`IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):`, `(Alíq: ${(irrf.aliquota*100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}) ${formatCurrency(irrf.valor)}`);
                }
                addLinhaDupla('TOTAL DESCONTOS (Férias):', formatCurrency(pagFerias.totais.descontos), true);
                linhaY += 5;
                addLinhaDupla('LÍQUIDO TOTAL A RECEBER:', formatCurrency(pagTotal.totais.liquido), true, 12);

                if (calculoAtual.pagamento13Adiantamento) {
                    addLinhaSeparadora();
                    addTituloSecao('13º Salário - 1ª Parcela Automática');
                    addLinhaDupla('Meses considerados:', `${calculoAtual.pagamento13Adiantamento.mesesAvos}/12`);
                    addLinhaDupla('Valor Total 13º:', formatCurrency(calculoAtual.pagamento13Adiantamento.valorTotal13));
                    addLinhaDupla('Adiantamento 50%:', formatCurrency(calculoAtual.pagamento13Adiantamento.adiantamento13), true);
                }

            } else {
                 const pagAtual = calculoAtual.pagamentoAtual;
                 const tipoStr = calculoAtual.tipoCalculo === 'RESCISAO' ? 'RESCISÃO DE CONTRATO' : 'PAGAMENTO MENSAL';
                 addTituloSecao(tipoStr);
                 addTituloSecao('PROVENTOS');
                 if (pagAtual.proventos.salario) addLinhaDupla('Salário Base:', formatCurrency(pagAtual.proventos.salario));
                 if (pagAtual.proventos.saldoSalario) addLinhaDupla(`Saldo de Salário (${pagAtual.diasTrabalhados} dias):`, formatCurrency(pagAtual.proventos.saldoSalario));
                 if (pagAtual.proventos.adiantamento13) addLinhaDupla('13º Salário (1ª Parcela - Automática):', formatCurrency(pagAtual.proventos.adiantamento13));
                 if (pagAtual.proventos.decimoTerceiroProp) addLinhaDupla('13º Salário Proporcional:', formatCurrency(pagAtual.proventos.decimoTerceiroProp));
                 if (pagAtual.proventos.feriasProp) addLinhaDupla('Férias Proporcionais:', formatCurrency(pagAtual.proventos.feriasProp));
                 if (pagAtual.proventos.umTercoFeriasProp) addLinhaDupla('1/3 sobre Férias Prop.:', formatCurrency(pagAtual.proventos.umTercoFeriasProp));
                 if (pagAtual.proventos.feriasVencidas) addLinhaDupla('Férias Vencidas + 1/3:', formatCurrency(pagAtual.proventos.feriasVencidas));
                 if (pagAtual.proventos.avisoPrevio) addLinhaDupla('Aviso Prévio Indenizado:', formatCurrency(pagAtual.proventos.avisoPrevio));
                 if (pagAtual.descontos.faltas > 0) addLinhaDupla('Desconto Faltas:', `(${formatCurrency(pagAtual.descontos.faltas)})`);
                 addLinhaDupla('TOTAL PROVENTOS BRUTOS:', formatCurrency(pagAtual.totais.proventosBrutos), true);
                 linhaY += 5;
                 addTituloSecao('DESCONTOS');
                 if (pagAtual.descontos.inss > 0) addLinhaDupla(`INSS 11% (s/ ${formatCurrency(pagAtual.baseINSSAjustada)}):`, formatCurrency(pagAtual.descontos.inss));
                 if (pagAtual.descontos.irrf > 0) {
                     const irrf = pagAtual.resultadoIRRF;
                     addLinhaDupla(`IRRF (s/ ${formatCurrency(irrf.baseCalculo)}):`, `(Alíq: ${(irrf.aliquota*100).toFixed(1)}%, Ded: ${formatCurrency(irrf.deducao)}) ${formatCurrency(irrf.valor)}`);
                 }
                 addLinhaDupla('TOTAL DESCONTOS:', formatCurrency(pagAtual.totais.descontos), true);
                 linhaY += 5;
                 addLinhaDupla('LÍQUIDO A RECEBER:', formatCurrency(pagAtual.totais.liquido), true, 12);

                 if (calculoAtual.pagamento13Adiantamento) {
                     addLinhaSeparadora();
                     addTituloSecao('13º Salário - 1ª Parcela Automática');
                     addLinhaDupla('Meses considerados:', `${calculoAtual.pagamento13Adiantamento.mesesAvos}/12`);
                     addLinhaDupla('Valor Total 13º:', formatCurrency(calculoAtual.pagamento13Adiantamento.valorTotal13));
                     addLinhaDupla('Adiantamento 50%:', formatCurrency(calculoAtual.pagamento13Adiantamento.adiantamento13), true);
                 }
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

  [fldSalarioBase, fldTetoInss, fldFeriasVencidasInput, fldValorAdiantamentoPago].forEach(field => {
    if(field) {
      field.addEventListener('blur', (e) => {
          let rawValue = e.target.value.replace(/\./g, '').replace(',', '.');
          let numValue = parseFloat(rawValue);
          if (!isNaN(numValue)) {
              e.target.value = formatToBRL(numValue);
          } else {
              e.target.value = '0,00';
          }
      });
    }
  });

  chkRescisao.addEventListener('change', function() {
      if (this.checked) {
          rescisaoCamposDiv.style.display = 'block';
          infoRescisaoDiv.style.display = 'block';
          chkFeriasNormais.checked = false;
          chkFeriasNormais.disabled = true;
          chkDecimoTerceiro.checked = false;
          chkDecimoTerceiro.disabled = true;
      } else {
          rescisaoCamposDiv.style.display = 'none';
          infoRescisaoDiv.style.display = 'none';
          chkFeriasNormais.disabled = false;
          chkDecimoTerceiro.disabled = false;
      }
  });

  chkFeriasNormais.addEventListener('change', function() {
      if (this.checked) {
          chkRescisao.checked = false;
          chkRescisao.disabled = true;
          chkDecimoTerceiro.checked = false;
          chkDecimoTerceiro.disabled = true;
          if (groupDiasFeriasDiv) groupDiasFeriasDiv.style.display = 'block';
          if (groupDataInicioFeriasDiv) groupDataInicioFeriasDiv.style.display = 'block';
      } else {
          chkRescisao.disabled = false;
          chkDecimoTerceiro.disabled = false;
          if (groupDiasFeriasDiv) groupDiasFeriasDiv.style.display = 'none';
          if (groupDataInicioFeriasDiv) groupDataInicioFeriasDiv.style.display = 'none';
      }
  });

  chkDecimoTerceiro.addEventListener('change', function() {
      if (this.checked) {
          decimoTerceiroCamposDiv.style.display = 'block';
          chkRescisao.checked = false;
          chkRescisao.disabled = true;
          chkFeriasNormais.checked = false;
          chkFeriasNormais.disabled = true;
          groupFaltasContainer.style.display = 'none';
      } else {
          decimoTerceiroCamposDiv.style.display = 'none';
          chkRescisao.disabled = false;
          chkFeriasNormais.disabled = false;
          groupFaltasContainer.style.display = 'block';
      }
  });
  
  [radioPrimeiraParcela, radioSegundaParcela].forEach(radio => {
    radio.addEventListener('change', function() {
        if(radioSegundaParcela.checked) {
            groupAdiantamentoPago.style.display = 'block';
        } else {
            groupAdiantamentoPago.style.display = 'none';
        }
    });
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
              if (calculoAtual.pagamento13Adiantamento?.referencia) {
                  const [mes13, ano13] = calculoAtual.pagamento13Adiantamento.referencia.split('/');
                  dadosParaSalvar.referenciasSaldos.push(`${ano13}-${mes13}`);
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
