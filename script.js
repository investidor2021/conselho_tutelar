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


  // --- Funções Utilitárias ---
  const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const cleanNumberString = (str) => String(str).replace(/\./g, '').replace(',', '.');
  const truncateDecimal = (num, digits) => Math.floor(num * Math.pow(10, digits)) / Math.pow(10, digits);

  // --- Funções de Cálculo ---
  const calcularINSSContribuinteIndividual = (base, teto) => {
    if (base <= 0) return { valor: 0, baseAjustada: 0 };
    let baseAjustada = base < SALARIO_MINIMO_NACIONAL ? SALARIO_MINIMO_NACIONAL : base;
    baseAjustada = Math.min(baseAjustada, teto);
    return { valor: truncateDecimal(baseAjustada * ALIQUOTA_INSS_INDIVIDUAL, 2), baseAjustada };
  };

  const calcularIRRF = (base) => {
    if (base <= 0) return { valor: 0, aliquota: 0, deducao: 0, baseCalculo: Math.max(0, base) };
    const faixa = FAIXAS_IRRF.find(f => base <= f.baseAte) || FAIXAS_IRRF[FAIXAS_IRRF.length - 1];
    const irrf = (base * faixa.aliquota) - faixa.deducao;
    return { valor: truncateDecimal(Math.max(0, irrf), 2), ...faixa, baseCalculo: base };
  };

  function calcularDataFimFerias() {
    const inicio = fldDataInicioFerias.value;
    const dias = parseInt(fldDiasFeriasGozo.value);
    if (inicio && dias > 0) {
      const dataInicio = new Date(inicio + "T00:00:00");
      if (!isNaN(dataInicio.getTime())) {
        dataInicio.setDate(dataInicio.getDate() + dias);
        fldDataFimFerias.textContent = new Date(dataInicio.getTime() - 86400000).toLocaleDateString('pt-BR'); // Subtrai 1 dia para data fim
      }
    } else {
      fldDataFimFerias.textContent = '';
    }
  }

  // --- Lógica de Bloqueio/Consulta ao Firebase ---

  function gerarHtmlParaPagamento(pagamentoObj, titulo) {
      let html = `<hr style="margin-top: 20px;"/><p style="font-weight: bold; margin-bottom: 5px; color: #007bff;">${titulo}</p>`;
      html += `<div class="resumo-item"><span>TOTAL PROVENTOS BRUTOS:</span> <span>${formatCurrency(pagamentoObj.totais.proventosBrutos)}</span></div>`;
      html += `<div class="resumo-item"><span>TOTAL DESCONTOS:</span> <span>${formatCurrency(pagamentoObj.totais.descontos)}</span></div>`;
      html += `<div class="resumo-item total" style="margin-top:10px;"><span>LÍQUIDO A RECEBER:</span><span>${formatCurrency(pagamentoObj.totais.liquido)}</span></div>`;
      return html;
  }

  function bloquearFormularioEExibirDados(pagamentoEncontrado, calculoPai, tipoSaldo) {
      const refPaiFormatada = calculoPai.referenciaPagamento.split('-').reverse().join('/');
      infoBloqueioDiv.innerHTML = `
          <strong>Atenção:</strong> O pagamento para este mês já foi definido como parte de um cálculo de férias processado em <strong>${refPaiFormatada}</strong>.
          <br>Não é possível realizar um novo cálculo. Os detalhes do pagamento pré-definido são exibidos abaixo.`;
      infoBloqueioDiv.style.display = 'block';

      resultadoHtml.innerHTML = gerarHtmlParaPagamento(pagamentoEncontrado, `Demonstrativo de Pagamento (Pré-calculado) - ${tipoSaldo}`);
      divResultado.style.display = 'block';
      btnPdf.style.display = 'none';
      btnSalvarFirebase.style.display = 'none';

      // Desabilita todos os campos do formulário, exceto os de busca
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
      // Re-aplica a lógica de desabilitar/habilitar campos de rescisão/férias
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

      // Busca por pagamentos onde o mês de referência é um saldo de férias
      const q = query(collection(db, "calculos"),
          where("nome", "==", nome),
          where("referenciasSaldos", "array-contains", referencia)
      );

      try {
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
              const doc = querySnapshot.docs[0]; // Pega o primeiro resultado encontrado
              const calculoPai = doc.data().calculoCompleto;

              let pagamentoEncontrado = null;
              let tipoSaldo = '';

              if (calculoPai.pagamentoSaldoMesInicioFerias?.referenciaISO === referencia) {
                  pagamentoEncontrado = calculoPai.pagamentoSaldoMesInicioFerias;
                  tipoSaldo = "Saldo do Mês de Início das Férias";
              } else if (calculoPai.pagamentoSaldoMesTerminoFerias?.referenciaISO === referencia) {
                  pagamentoEncontrado = calculoPai.pagamentoSaldoMesTerminoFerias;
                  tipoSaldo = "Saldo do Mês de Término das Férias";
              }

              if (pagamentoEncontrado) {
                  bloquearFormularioEExibirDados(pagamentoEncontrado, calculoPai, tipoSaldo);
              } else {
                  resetarBloqueioFormulario();
              }
          } else {
              resetarBloqueioFormulario();
          }
      } catch (error) {
          console.error("Erro ao verificar pagamento existente: ", error);
          resetarBloqueioFormulario(); // Garante que o formulário não fique travado em caso de erro
      }
  }


  // --- Lógica Principal de Cálculo ---
  function executarCalculo() {
      //... (código de executarCalculo() continua aqui, sem alterações na maior parte)
      const nome = fldNome.value;
      const referenciaPagamento = fldReferencia.value;
      // ... resto da validação inicial
      if (!nome || !referenciaPagamento) {
         alert("Por favor, preencha Nome e Referência do Pagamento.");
         return;
      }
      
      // ... resto do código de cálculo ...
      // ATENÇÃO: Adicione a propriedade 'referenciaISO' aos objetos de pagamento de saldo
      if (isFeriasNormaisChecked) {
          // ... dentro do cálculo de férias ...
          
          // SALDO MÊS INÍCIO FÉRIAS
          if (diaInicioFerias > 1) {
              //...
              calculoAtual.pagamentoSaldoMesInicioFerias = { /* ... dados ... */ };
              const pag = calculoAtual.pagamentoSaldoMesInicioFerias;
              pag.referenciaISO = `${anoInicioFerias}-${String(mesInicioFerias).padStart(2, '0')}`;
              // ... resto do cálculo do saldo ...
          }

          // SALDO MÊS TÉRMINO FÉRIAS
          if (saldoSalarioMesTermino > 0) {
              //...
              calculoAtual.pagamentoSaldoMesTerminoFerias = { /* ... dados ... */ };
              const pag = calculoAtual.pagamentoSaldoMesTerminoFerias;
              pag.referenciaISO = `${anoFimFerias}-${String(mesFimFerias).padStart(2, '0')}`;
              // ... resto do cálculo do saldo ...
          }
      }
      
      // ... resto da função executarCalculo() ...
      // O código completo da função executarCalculo foi omitido por brevidade, 
      // mas as duas adições acima são as únicas mudanças necessárias dentro dela.
      // O código completo da função original deve ser mantido.
      
      // Exemplo de como ficaria a adição completa em um dos blocos:
      // if (diaInicioFerias > 1) {
      //     const diasTrabalhados = diaInicioFerias - 1;
      //     const valorDia = salarioBaseInput / new Date(anoInicioFerias, mesInicioFerias, 0).getDate();
      //     const saldo = valorDia * diasTrabalhados;
      //     calculoAtual.pagamentoSaldoMesInicioFerias = {
      //         referencia: `${String(mesInicioFerias).padStart(2, '0')}/${anoInicioFerias}`,
      //         referenciaISO: `${anoInicioFerias}-${String(mesInicioFerias).padStart(2, '0')}`, // ADICIONADO AQUI
      //         proventos: { saldoSalario: saldo },
      //         descontos: {}, totais: {}, diasTrabalhados
      //     };
      //     // ... resto do código
      // }
  }


  // --- Event Listeners e Inicialização ---
  btnCalcular.addEventListener('click', executarCalculo);
  btnPdf.addEventListener('click', gerarPDF);
  btnSalvarFirebase.addEventListener('click', salvarNoFirebase);

  // ADICIONADO: Event listeners para verificar o bloqueio
  fldNome.addEventListener('change', verificarPagamentoExistente);
  fldReferencia.addEventListener('change', verificarPagamentoExistente);

  fldDataInicioFerias.addEventListener('change', calcularDataFimFerias);
  fldDiasFeriasGozo.addEventListener('change', calcularDataFimFerias);

  chkRescisao.addEventListener('change', function() {
      rescisaoCamposDiv.style.display = this.checked ? 'block' : 'none';
      infoRescisaoDiv.style.display = this.checked ? 'block' : 'none';
      labelSalarioBase.textContent = this.checked ? 'Salário Base (para rescisão R$):' : 'Salário Base Mensal (R$):';
      chkFeriasNormais.disabled = this.checked;
      groupFaltasContainer.style.display = this.checked ? 'none' : 'block';
      if(this.checked) chkFeriasNormais.checked = false;
  });

  chkFeriasNormais.addEventListener('change', function() {
      groupDiasFeriasDiv.style.display = this.checked ? 'block' : 'none';
      groupDataInicioFeriasDiv.style.display = this.checked ? 'block' : 'none';
      chkRescisao.disabled = this.checked;
      labelSalarioBase.textContent = this.checked ? 'Salário Base (para férias R$):' : 'Salário Base Mensal (R$):';
      const labelFaltas = groupFaltasContainer.querySelector('label[for="faltas"]');
      if (labelFaltas) {
          labelFaltas.textContent = this.checked ? 'Faltas (mês ANTERIOR às férias):' : 'Dias de Falta (0-30):';
      }
      if(this.checked) chkRescisao.checked = false;
  });

  // NOVA FUNÇÃO PARA SALVAR NO FIREBASE (ATUALIZADA)
  async function salvarNoFirebase() {
      if (!calculoAtual || !calculoAtual.nome) {
          alert("Não há dados de cálculo para salvar.");
          return;
      }

      btnSalvarFirebase.disabled = true;
      btnSalvarFirebase.textContent = 'Salvando...';

      const { collection, addDoc, serverTimestamp } = window.firestoreFunctions;

      try {
          const dadosParaSalvar = {
              nome: calculoAtual.nome,
              referenciaPagamento: calculoAtual.referenciaPagamento,
              tipoCalculo: calculoAtual.tipoCalculo,
              calculoCompleto: calculoAtual, // Salva o objeto inteiro como antes
              dataSalvo: serverTimestamp(),
              referenciasSaldos: [] // NOVO CAMPO para facilitar a consulta
          };

          // Se for férias, preenche o array de referências de saldos
          if (calculoAtual.tipoCalculo === "FERIAS") {
              if (calculoAtual.pagamentoSaldoMesInicioFerias?.referenciaISO) {
                  dadosParaSalvar.referenciasSaldos.push(calculoAtual.pagamentoSaldoMesInicioFerias.referenciaISO);
              }
              if (calculoAtual.pagamentoSaldoMesTerminoFerias?.referenciaISO) {
                  dadosParaSalvar.referenciasSaldos.push(calculoAtual.pagamentoSaldoMesTerminoFerias.referenciaISO);
              }
          }

          const docRef = await addDoc(collection(window.db, "calculos"), dadosParaSalvar);
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

  // O restante do seu script (formatação de campos, lógicas de cálculo, PDF, etc.)
  // deve ser mantido como estava. O código acima apenas adiciona a nova funcionalidade.
  // Cole este script substituindo o conteúdo do seu arquivo script.js, mas
  // certifique-se de que a função executarCalculo() completa e as outras funções
  // permaneçam intactas, adicionando apenas as linhas indicadas.
}
