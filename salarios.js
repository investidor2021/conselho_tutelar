if (typeof window.salariosInicializado === 'undefined') {
  window.salariosInicializado = true;

  const formatToBRL = (value) => {
    if (isNaN(value) || value === null) return '0,00';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const cleanNumberString = (str) => {
    if (typeof str !== 'string') str = String(str);
    return str.replace(/\./g, '').replace(',', '.');
  };

  const formatCurrency = (value) => 
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const MESES = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // --- Elementos do DOM ---
  const fldAno        = document.getElementById('salAno');
  const fldMes        = document.getElementById('salMes');
  const fldSalario    = document.getElementById('salValor');
  const fldTeto       = document.getElementById('salTeto');
  const btnSalvar     = document.getElementById('btnSalvarSalario');
  const btnCarregar   = document.getElementById('btnCarregarHistorico');
  const fldAnoFiltro  = document.getElementById('salAnoFiltro');
  const tabelaBody    = document.getElementById('tabelaSalariosBody');
  const msgStatus     = document.getElementById('msgStatusSalario');

  // Preenche ano atual por padrão
  const anoAtual = new Date().getFullYear();
  if (fldAno) fldAno.value = anoAtual;
  if (fldAnoFiltro) fldAnoFiltro.value = anoAtual;

  // Formatação automática dos campos de valor
  [fldSalario, fldTeto].forEach(field => {
    if (!field) return;
    field.addEventListener('blur', (e) => {
      const num = parseFloat(cleanNumberString(e.target.value));
      e.target.value = isNaN(num) ? '0,00' : formatToBRL(num);
    });
  });

  // --- Salvar / Atualizar salário ---
  if (btnSalvar) {
    btnSalvar.addEventListener('click', async () => {
      const ano     = parseInt(fldAno.value);
      const mes     = parseInt(fldMes.value);
      const salario = parseFloat(cleanNumberString(fldSalario.value));
      const teto    = parseFloat(cleanNumberString(fldTeto.value));

      if (!ano || !mes || isNaN(salario) || salario <= 0 || isNaN(teto) || teto <= 0) {
        alert('Preencha todos os campos corretamente.');
        return;
      }

      const { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } 
        = window.firestoreFunctions;
      const db = window.db;

      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Salvando...';

      try {
        // Verifica se já existe registro para esse mês/ano
        const q = query(
          collection(db, 'historico_salarios'),
          where('ano', '==', ano),
          where('mes', '==', mes)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          // Atualiza existente
          const docRef = doc(db, 'historico_salarios', snap.docs[0].id);
          await updateDoc(docRef, { salarioBase: salario, tetoInss: teto, dataAtualizacao: serverTimestamp() });
          mostrarStatus('✅ Salário atualizado com sucesso!', 'success');
        } else {
          // Cria novo
          await addDoc(collection(db, 'historico_salarios'), {
            ano, mes, salarioBase: salario, tetoInss: teto,
            dataCadastro: serverTimestamp()
          });
          mostrarStatus('✅ Salário cadastrado com sucesso!', 'success');
        }

        await carregarHistorico();

      } catch (err) {
        console.error(err);
        mostrarStatus('❌ Erro ao salvar: ' + err.message, 'error');
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = 'Salvar Salário';
      }
    });
  }

  // --- Carregar histórico ---
  async function carregarHistorico() {
    const ano = parseInt(fldAnoFiltro.value) || anoAtual;
    const { collection, query, where, getDocs, orderBy } = window.firestoreFunctions;
    const db = window.db;

    tabelaBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    try {
      const q = query(
        collection(db, 'historico_salarios'),
        where('ano', '==', ano),
        orderBy('mes', 'asc')
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        tabelaBody.innerHTML = `<tr><td colspan="4">Nenhum registro encontrado para ${ano}.</td></tr>`;
        return;
      }

      let html = '';
      snap.forEach(d => {
        const r = d.data();
        html += `
          <tr>
            <td>${MESES[r.mes]}</td>
            <td>${r.ano}</td>
            <td>${formatCurrency(r.salarioBase)}</td>
            <td>${formatCurrency(r.tetoInss)}</td>
          </tr>`;
      });
      tabelaBody.innerHTML = html;

    } catch (err) {
      console.error(err);
      tabelaBody.innerHTML = `<tr><td colspan="4" style="color:red;">Erro ao carregar.</td></tr>`;
    }
  }

  if (btnCarregar) {
    btnCarregar.addEventListener('click', carregarHistorico);
  }

  function mostrarStatus(msg, tipo) {
    if (!msgStatus) return;
    msgStatus.textContent = msg;
    msgStatus.style.color = tipo === 'success' ? 'green' : 'red';
    setTimeout(() => { msgStatus.textContent = ''; }, 4000);
  }

  // Carrega ao abrir a página
  carregarHistorico();

  // --- Exporta função para uso no script.js ---
  window.buscarSalarioPorMesAno = async function(mes, ano) {
    const { collection, query, where, getDocs } = window.firestoreFunctions;
    const db = window.db;
    const q = query(
      collection(db, 'historico_salarios'),
      where('ano', '==', ano),
      where('mes', '==', mes)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data();
    }
    return null;
  };

  // Exporta função para calcular 13º com histórico
  window.calcular13ComHistorico = async function(anoRef, mesAtual, salarioAtual, tetoAtual) {
    const { collection, query, where, getDocs } = window.firestoreFunctions;
    const db = window.db;

    let totalBase = 0;
    let avosContados = 0;
    const detalhes = [];

    for (let m = 1; m <= mesAtual; m++) {
      const q = query(
        collection(db, 'historico_salarios'),
        where('ano', '==', anoRef),
        where('mes', '==', m)
      );
      const snap = await getDocs(q);

      let salarioMes = salarioAtual; // fallback para salário atual
      let tetoMes    = tetoAtual;

      if (!snap.empty) {
        salarioMes = snap.docs[0].data().salarioBase;
        tetoMes    = snap.docs[0].data().tetoInss;
      }

      totalBase += salarioMes / 12;
      avosContados++;
      detalhes.push({ mes: m, salario: salarioMes, teto: tetoMes, avo: salarioMes / 12 });
    }

    return {
      totalBase,          // valor total do 13º proporcional
      avos: avosContados, // quantos meses
      detalhes,           // breakdown mês a mês
      adiantamento50: totalBase / 2
    };
  };
}
