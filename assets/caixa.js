/* Medusa Gestão — página Caixa (entradas e saídas). */
(function () {
  'use strict';
  var M = window.Medusa;
  var $ = function (id) { return document.getElementById(id); };

  // Categorias vêm de Configurações > Caixa.
  var CATEGORIAS = {
    get entrada() { return M.config.caixa.catEntrada || []; },
    get saida() { return M.config.caixa.catSaida || []; }
  };

  var st = {
    itens: [],          // todos os lançamentos
    tipo: 'entrada',    // aba do formulário
    forma: 'PIX',
    editId: null,       // id do lançamento em edição
    mes: M.mesAtual(),  // mês exibido no histórico
    filtro: 'todos',
    busca: '',
    salvando: false
  };
  var lancamentos;

  M.iniciarPagina('caixa', function () {
    lancamentos = M.colecao('lancamentos');
    lancamentos.observar(function (lista) {
      st.itens = lista;
      // Se o item em edição foi apagado (em outra aba, por exemplo), sai da edição.
      if (st.editId && !lista.some(function (i) { return i.id === st.editId; })) limparForm();
      render();
    });
    iniciarForm();
  });

  /* ---------- Formulário ---------- */
  function iniciarForm() {
    $('fData').value = M.hoje();
    setTipo('entrada');

    document.querySelectorAll('.tab').forEach(function (b) {
      b.onclick = function () { setTipo(b.getAttribute('data-tipo')); };
    });
    document.querySelectorAll('.forma').forEach(function (b) {
      b.onclick = function () { setForma(b.getAttribute('data-forma')); };
    });
    $('fValor').addEventListener('blur', function () {
      var c = M.lerValor(this.value);
      if (!isNaN(c)) this.value = M.valorCampo(c);
    });
    ['fDesc', 'fValor', 'fData', 'fCat'].forEach(function (id) {
      $(id).addEventListener('input', function () { this.classList.remove('erro'); });
    });
    $('form').onsubmit = function (e) { e.preventDefault(); salvar(); };
    $('cancelarEdicao').onclick = limparForm;
    $('btnExcluir').onclick = excluir;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.editId && !document.querySelector('.overlay')) limparForm(); });

    // Histórico
    $('mesAnt').onclick = function () { mudarMes(-1); };
    $('mesProx').onclick = function () { mudarMes(1); };
    $('mesHoje').onclick = function () { st.mes = M.mesAtual(); render(); };
    document.querySelectorAll('#filtros .chip').forEach(function (b) {
      b.onclick = function () {
        st.filtro = b.getAttribute('data-f');
        document.querySelectorAll('#filtros .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
        render();
      };
    });
    $('busca').addEventListener('input', function () { st.busca = this.value; render(); });
    $('lista').addEventListener('click', function (e) {
      var row = e.target.closest('.row[data-id]');
      if (row) editar(row.getAttribute('data-id'));
    });
  }

  function setTipo(tipo, manterCategoria) {
    st.tipo = tipo;
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tipo') === tipo); });
    var atual = $('fCat').value;
    $('fCat').innerHTML = '<option value="">Selecionar categoria…</option>' +
      CATEGORIAS[tipo].map(function (c) { return '<option>' + M.esc(c) + '</option>'; }).join('');
    if (manterCategoria) {
      // Categoria antiga que não está mais na lista continua disponível.
      if (manterCategoria && CATEGORIAS[tipo].indexOf(manterCategoria) < 0) {
        $('fCat').insertAdjacentHTML('beforeend', '<option>' + M.esc(manterCategoria) + '</option>');
      }
      $('fCat').value = manterCategoria;
    } else if (CATEGORIAS[tipo].indexOf(atual) >= 0) {
      $('fCat').value = atual;
    }
    $('fDesc').placeholder = tipo === 'entrada' ? 'Ex: Pagamento cliente Agência Blur' : 'Ex: Compra de papel couchê';
    atualizarBotao();
  }

  function setForma(forma) {
    st.forma = forma;
    document.querySelectorAll('.forma').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-forma') === forma); });
  }

  function atualizarBotao() {
    var b = $('btnSalvar');
    b.classList.toggle('saida', st.tipo === 'saida');
    if (st.salvando) b.textContent = 'Salvando…';
    else if (st.editId) b.textContent = 'Salvar alterações';
    else b.textContent = st.tipo === 'entrada' ? '+ Registrar entrada' : '+ Registrar saída';
    b.disabled = st.salvando;
  }

  function msg(t, tipo) { $('fMsg').textContent = t || ''; $('fMsg').className = 'msg' + (tipo ? ' ' + tipo : ''); }

  function salvar() {
    if (st.salvando) return;
    var desc = $('fDesc').value.trim();
    var valor = M.lerValor($('fValor').value);
    var data = $('fData').value;
    var cat = $('fCat').value;
    var erro = null, campo = null;
    if (!desc) { erro = 'Preencha a descrição.'; campo = 'fDesc'; }
    else if (isNaN(valor) || valor <= 0) { erro = 'Digite um valor maior que zero (ex: 1.250,00).'; campo = 'fValor'; }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { erro = 'Escolha a data.'; campo = 'fData'; }
    else if (!cat) { erro = 'Escolha uma categoria.'; campo = 'fCat'; }
    if (erro) { msg(erro, 'erro'); $(campo).classList.add('erro'); $(campo).focus(); return; }

    var dados = {
      tipo: st.tipo, descricao: desc, valorCentavos: valor, data: data,
      categoria: cat, forma: st.forma, obs: $('fObs').value.trim(), atualizadoEm: Date.now()
    };
    var editando = st.editId;
    var p;
    if (editando) p = lancamentos.atualizar(editando, dados);
    else { dados.criadoEm = Date.now(); p = lancamentos.adicionar(dados); }

    st.salvando = true; atualizarBotao(); msg('');
    p.then(function () {
      M.toast(editando ? 'Lançamento atualizado.' : (st.tipo === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.'));
      // Mostra o mês do lançamento salvo, para a pessoa ver onde ele foi parar.
      if (data.slice(0, 7) !== st.mes) { st.mes = data.slice(0, 7); render(); }
      limparForm(true);
    }).catch(function (err) {
      console.error(err);
      msg('Não foi possível salvar: ' + (err.code || err.message || 'erro'), 'erro');
    }).then(function () { st.salvando = false; atualizarBotao(); });
  }

  // manterTipoEData: depois de registrar, segue no mesmo tipo e data (agiliza vários lançamentos seguidos).
  function limparForm(manterTipoEData) {
    var data = $('fData').value;
    st.editId = null;
    $('fDesc').value = ''; $('fValor').value = ''; $('fObs').value = '';
    $('fData').value = manterTipoEData === true && data ? data : M.hoje();
    if (manterTipoEData !== true) setTipo('entrada');
    $('fCat').value = '';
    setForma('PIX');
    $('editando').hidden = true; $('acoesEdicao').hidden = true;
    document.querySelectorAll('.input.erro').forEach(function (x) { x.classList.remove('erro'); });
    msg(''); atualizarBotao(); marcarSelecionado();
    $('fDesc').focus();
  }

  function editar(id) {
    var i = st.itens.filter(function (x) { return x.id === id; })[0];
    if (!i) return;
    st.editId = id;
    setTipo(i.tipo, i.categoria);
    $('fDesc').value = i.descricao || '';
    $('fValor').value = M.valorCampo(i.valorCentavos);
    $('fData').value = i.data || M.hoje();
    $('fObs').value = i.obs || '';
    setForma(i.forma || 'PIX');
    $('editando').hidden = false; $('acoesEdicao').hidden = false;
    $('editandoTxt').textContent = i.reciboId ? 'Editando lançamento (gerado por recibo)' : 'Editando lançamento';
    msg(''); atualizarBotao(); marcarSelecionado();
    $('fDesc').focus();
  }

  function excluir() {
    var id = st.editId;
    var i = st.itens.filter(function (x) { return x.id === id; })[0];
    if (!i) return;
    M.confirmar({
      titulo: 'Excluir lançamento?',
      texto: (i.tipo === 'entrada' ? 'Entrada' : 'Saída') + ' de ' + M.brl(i.valorCentavos) + ' — ' + i.descricao + '. Essa ação não pode ser desfeita.',
      ok: 'Excluir', perigo: true
    }).then(function (sim) {
      if (!sim) return;
      lancamentos.remover(id).then(function () {
        M.toast('Lançamento excluído.');
        limparForm();
      }).catch(function (err) { M.toast('Não foi possível excluir: ' + (err.code || err.message), 'erro'); });
    });
  }

  /* ---------- Histórico ---------- */
  function mudarMes(delta) { st.mes = M.mudarMes(st.mes, delta); render(); }

  function soma(lista, tipo) {
    return lista.reduce(function (a, i) { return a + (i.tipo === tipo ? (i.valorCentavos || 0) : 0); }, 0);
  }

  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  function render() {
    // Saldo geral (todos os meses)
    var saldo = (M.config.caixa.saldoInicialCentavos || 0) + soma(st.itens, 'entrada') - soma(st.itens, 'saida');
    $('saldoAtual').textContent = M.brl(saldo);
    $('saldoBox').classList.toggle('neg', saldo < 0);

    // Mês
    $('mesLabel').textContent = M.mesNome(st.mes);
    $('mesHoje').hidden = st.mes === M.mesAtual();
    var doMes = st.itens.filter(function (i) { return String(i.data).slice(0, 7) === st.mes; });
    var ent = soma(doMes, 'entrada'), sai = soma(doMes, 'saida');
    var ab = M.mesAbrev(st.mes);
    $('rEntLabel').textContent = 'Entradas ' + ab;
    $('rSaiLabel').textContent = 'Saídas ' + ab;
    $('rSalLabel').textContent = 'Saldo ' + ab;
    $('rEnt').textContent = '+ ' + M.brl(ent);
    $('rSai').textContent = '- ' + M.brl(sai);
    $('rSal').textContent = M.brl(ent - sai);
    $('rSal').style.color = ent - sai < 0 ? 'var(--danger)' : '';

    // Lista
    var q = semAcento(st.busca.trim());
    var lista = doMes.filter(function (i) {
      if (st.filtro !== 'todos' && i.tipo !== st.filtro) return false;
      if (!q) return true;
      return semAcento([i.descricao, i.categoria, i.forma, i.obs, M.valorCampo(i.valorCentavos)].join(' ')).indexOf(q) >= 0;
    }).sort(function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? 1 : -1;
      return (b.criadoEm || 0) - (a.criadoEm || 0);
    });

    var cab = '<div class="row cab"><div style="width:8px;"></div><div class="c-desc">Descrição</div>' +
      '<div class="c-data">Data</div><div class="c-tipo">Tipo</div><div class="c-val">Valor</div><div class="c-mais"></div></div>';

    if (!lista.length) {
      var vazio;
      if (q || st.filtro !== 'todos') vazio = '<strong>Nada encontrado</strong>Nenhum lançamento corresponde ao filtro ou à busca em ' + M.esc(M.mesNome(st.mes)) + '.';
      else vazio = '<strong>Nenhum lançamento em ' + M.esc(M.mesNome(st.mes)) + '</strong>Use o formulário ao lado para registrar a primeira entrada ou saída.';
      $('lista').innerHTML = cab + '<div class="vazio">' + vazio + '</div>';
      return;
    }

    $('lista').innerHTML = cab + lista.map(function (i) {
      var e = i.tipo === 'entrada';
      var sub = [i.forma, i.categoria].filter(Boolean).join(' · ');
      return '<div class="row" data-id="' + M.esc(i.id) + '" title="Clique para editar' + (i.obs ? ' — ' + M.esc(i.obs) : '') + '">' +
        '<div class="dot" style="background:' + (e ? 'var(--success)' : 'var(--danger)') + ';"></div>' +
        '<div class="c-desc"><div class="t">' + M.esc(i.descricao) + '</div><div class="s">' + M.esc(sub) + '</div></div>' +
        '<div class="c-data">' + M.esc(M.dataCurta(i.data)) + '</div>' +
        '<div class="c-tipo"><span class="badge ' + (e ? 'badge-in">Entrada' : 'badge-out">Saída') + '</span></div>' +
        '<div class="c-val" style="color:' + (e ? 'var(--success)' : 'var(--danger)') + ';">' + (e ? '+ ' : '- ') + M.brl(i.valorCentavos) + '</div>' +
        '<div class="c-mais"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></div>' +
        '</div>';
    }).join('');
    marcarSelecionado();
  }

  function marcarSelecionado() {
    document.querySelectorAll('#lista .row[data-id]').forEach(function (r) {
      r.classList.toggle('sel', r.getAttribute('data-id') === st.editId);
    });
  }
})();
