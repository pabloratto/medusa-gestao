/* Medusa Gestão — página Clientes. */
(function () {
  'use strict';
  var M = window.Medusa, $ = M.$;
  var CORES = ['#AADC00', '#29B6F6', '#B888FF', '#FFA726', '#66BB6A', '#FF6B6B', '#00C8C8', '#FFD60A'];
  var CAMPOS = { nome: 'fNome', responsavel: 'fResp', documento: 'fDoc', whatsapp: 'fWhats', telefone: 'fTel', email: 'fEmail',
    rua: 'fRua', numero: 'fNum', bairro: 'fBairro', cidade: 'fCidade', uf: 'fUF', cep: 'fCEP', segmento: 'fSeg', obs: 'fObs' };

  var st = { itens: [], orc: [], ped: [], rec: [], editId: null, filtro: 'todos', busca: '', salvando: false };
  var clientes;

  M.iniciarPagina('clientes', function () {
    clientes = M.colecao('clientes');
    clientes.observar(function (l) {
      st.itens = l;
      if (st.editId && !l.some(function (c) { return c.id === st.editId; })) limpar();
      render();
    });
    M.colecao('orcamentos').observar(function (l) { st.orc = l; historico(); });
    M.colecao('pedidos').observar(function (l) { st.ped = l; historico(); });
    M.colecao('recibos').observar(function (l) { st.rec = l; historico(); });
    iniciar();
    var id = new URLSearchParams(location.search).get('id');
    if (id) { var t = setInterval(function () { if (st.itens.length) { clearInterval(t); editar(id); } }, 100); setTimeout(function () { clearInterval(t); }, 5000); }
  });

  function iniciar() {
    M.aplicarMascaras();
    $('form').onsubmit = function (e) { e.preventDefault(); salvar(); };
    $('btnNovo').onclick = function () { limpar(); };
    $('btnCancelar').onclick = function () { limpar(); };
    $('btnExcluir').onclick = excluir;
    $('fNome').addEventListener('input', function () { this.classList.remove('erro'); });
    $('busca').addEventListener('input', function () { st.busca = this.value; render(); });
    document.querySelectorAll('#filtros .chip').forEach(function (b) {
      b.onclick = function () {
        st.filtro = b.getAttribute('data-f');
        document.querySelectorAll('#filtros .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
        render();
      };
    });
    $('lista').addEventListener('click', function (e) {
      var wa = e.target.closest('[data-wa]');
      if (wa) { e.stopPropagation(); abrirWhats(wa.getAttribute('data-wa')); return; }
      var row = e.target.closest('.lrow[data-id]');
      if (row) editar(row.getAttribute('data-id'));
    });
    $('hWhats').onclick = function () { abrirWhats(st.editId); };
    $('hOrcamento').onclick = function () { location.href = 'orcamento.html?cliente=' + encodeURIComponent(st.editId); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.editId && !document.querySelector('.overlay')) limpar(); });
  }

  function abrirWhats(id) {
    var c = st.itens.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var tel = c.whatsapp || c.telefone;
    if (!tel) { M.toast('Esse cliente não tem WhatsApp cadastrado.', 'erro'); return; }
    M.whatsapp(tel, 'Olá' + (c.responsavel ? ', ' + c.responsavel.split(' ')[0] : '') + '! Aqui é da ' + (M.config.empresa.fantasia || M.config.empresa.nome) + '.');
  }

  function msg(t, tipo) { $('fMsg').textContent = t || ''; $('fMsg').className = 'msg' + (tipo ? ' ' + tipo : ''); }

  function lerForm() {
    var d = {};
    Object.keys(CAMPOS).forEach(function (k) { d[k] = $(CAMPOS[k]).value.trim(); });
    d.ativo = $('fAtivo').checked;
    return d;
  }

  function salvar() {
    if (st.salvando) return;
    var d = lerForm();
    if (!d.nome) { msg('Preencha o nome do cliente ou da empresa.', 'erro'); $('fNome').classList.add('erro'); $('fNome').focus(); return; }
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) { msg('E-mail inválido.', 'erro'); $('fEmail').focus(); return; }
    var editando = st.editId;
    var repetido = st.itens.some(function (c) { return c.id !== editando && M.semAcento(c.nome) === M.semAcento(d.nome); });
    var go = repetido ? M.confirmar({ titulo: 'Cliente com o mesmo nome', texto: 'Já existe um cliente chamado "' + d.nome + '". Salvar mesmo assim?', ok: 'Salvar' }) : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return;
      d.atualizadoEm = Date.now();
      var p;
      if (editando) p = clientes.atualizar(editando, d);
      else { d.criadoEm = Date.now(); d.ativo = true; p = clientes.adicionar(d); }
      st.salvando = true; $('btnSalvar').disabled = true; msg('');
      return p.then(function (novo) {
        M.toast(editando ? 'Cliente atualizado.' : 'Cliente cadastrado.');
        if (editando) editar(editando); else limpar();
      }).catch(function (err) { msg('Não foi possível salvar: ' + (err.code || err.message), 'erro'); })
        .then(function () { st.salvando = false; $('btnSalvar').disabled = false; });
    });
  }

  function limpar() {
    st.editId = null;
    Object.keys(CAMPOS).forEach(function (k) { $(CAMPOS[k]).value = ''; });
    $('fAtivo').checked = true;
    $('formTitulo').textContent = 'Novo cadastro';
    $('btnSalvar').textContent = 'Salvar cliente';
    $('btnCancelar').hidden = true; $('acoesEdicao').hidden = true; $('historico').hidden = true; $('linhaAtivo').hidden = true;
    $('fNome').classList.remove('erro');
    msg(''); marcar(); $('fNome').focus();
  }

  function editar(id) {
    var c = st.itens.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    st.editId = id;
    Object.keys(CAMPOS).forEach(function (k) { $(CAMPOS[k]).value = c[k] || ''; });
    $('fAtivo').checked = c.ativo !== false;
    $('formTitulo').textContent = 'Editando cliente';
    $('btnSalvar').textContent = 'Salvar alterações';
    $('btnCancelar').hidden = false; $('acoesEdicao').hidden = false; $('historico').hidden = false; $('linhaAtivo').hidden = false;
    msg(''); historico(); marcar();
  }

  function doCliente(lista, c) {
    return lista.filter(function (x) { return x.clienteId === c.id || (!x.clienteId && M.semAcento(x.clienteNome) === M.semAcento(c.nome)); });
  }

  function historico() {
    if (!st.editId) return;
    var c = st.itens.filter(function (x) { return x.id === st.editId; })[0];
    if (!c) return;
    $('hOrc').textContent = doCliente(st.orc, c).length;
    $('hPed').textContent = doCliente(st.ped, c).length;
    $('hRec').textContent = M.brlCurto(doCliente(st.rec, c).filter(function (r) { return r.status === 'pago'; })
      .reduce(function (a, r) { return a + (r.totalCentavos || 0); }, 0));
  }

  function excluir() {
    var c = st.itens.filter(function (x) { return x.id === st.editId; })[0];
    if (!c) return;
    M.confirmar({ titulo: 'Excluir cliente?', texto: c.nome + ' será removido. Orçamentos, pedidos e recibos dele continuam salvos.', ok: 'Excluir', perigo: true })
      .then(function (sim) {
        if (!sim) return;
        clientes.remover(c.id).then(function () { M.toast('Cliente excluído.'); limpar(); }).catch(M.falha('excluir'));
      });
  }

  function cor(nome) { var h = 0; String(nome).split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; }); return CORES[h % CORES.length]; }

  function render() {
    var ativos = st.itens.filter(function (c) { return c.ativo !== false; }).length;
    $('contagem').textContent = st.itens.length + (st.itens.length === 1 ? ' cliente cadastrado' : ' clientes cadastrados') + ' · ' + ativos + (ativos === 1 ? ' ativo' : ' ativos');
    // Sugestões de segmento
    var segs = {}; st.itens.forEach(function (c) { if (c.segmento) segs[c.segmento] = 1; });
    $('segmentos').innerHTML = Object.keys(segs).sort().map(function (s) { return '<option value="' + M.esc(s) + '">'; }).join('');

    var lista = st.itens.filter(function (c) {
      if (st.filtro === 'ativos' && c.ativo === false) return false;
      if (st.filtro === 'inativos' && c.ativo !== false) return false;
      return !st.busca.trim() || M.combina([c.nome, c.responsavel, c.documento, c.whatsapp, c.telefone, c.email, c.cidade, c.segmento].join(' '), st.busca);
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

    var cab = '<div class="lrow cab"><div style="width:34px;"></div><div class="c-nome">Nome</div><div class="c-tel">WhatsApp</div>' +
      '<div class="c-seg">Segmento</div><div class="c-st">Status</div><div class="c-wa"></div></div>';
    if (!lista.length) {
      $('lista').innerHTML = cab + '<div class="vazio">' + (st.itens.length
        ? '<strong>Nenhum cliente encontrado</strong>Tente outra busca ou filtro.'
        : '<strong>Nenhum cliente cadastrado</strong>Preencha o formulário ao lado para cadastrar o primeiro.') + '</div>';
      return;
    }
    $('lista').innerHTML = cab + lista.map(function (c) {
      var k = cor(c.nome), ativo = c.ativo !== false;
      return '<div class="lrow" data-id="' + M.esc(c.id) + '">' +
        '<div class="ini" style="background:' + k + '22;color:' + k + ';">' + M.esc(M.iniciais(c.nome)) + '</div>' +
        '<div class="c-nome"><div class="t">' + M.esc(c.nome) + '</div><div class="s">Contato: ' + M.esc(c.responsavel || '—') +
        (c.cidade ? ' · ' + M.esc(c.cidade) + (c.uf ? '/' + M.esc(c.uf) : '') : '') + '</div></div>' +
        '<div class="c-tel">' + M.esc(c.whatsapp || c.telefone || '—') + '</div>' +
        '<div class="c-seg">' + (c.segmento ? '<span class="tag">' + M.esc(c.segmento) + '</span>' : '<span style="color:#444">—</span>') + '</div>' +
        '<div class="c-st"><span class="tag ' + (ativo ? 'verde' : '') + '">' + (ativo ? 'Ativo' : 'Inativo') + '</span></div>' +
        '<div class="c-wa">' + ((c.whatsapp || c.telefone) ? '<button class="icon-btn" data-wa="' + M.esc(c.id) + '" title="Abrir WhatsApp">' + M.icone('whats') + '</button>' : '') + '</div>' +
        '</div>';
    }).join('');
    marcar();
  }

  function marcar() {
    document.querySelectorAll('#lista .lrow[data-id]').forEach(function (r) { r.classList.toggle('sel', r.getAttribute('data-id') === st.editId); });
  }
})();
