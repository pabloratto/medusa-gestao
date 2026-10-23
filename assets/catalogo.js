/* Medusa Gestão — página Catálogo. */
(function () {
  'use strict';
  var M = window.Medusa, $ = M.$;
  var COR_CAT = { 'Impressão': 'azul', 'Personalização': 'roxo', 'Gravação': 'amarelo', 'Embalagem': '', 'Arte/Design': 'lima', 'Marketing': 'verde' };
  var st = { itens: [], editId: null, filtro: 'Todos', busca: '', salvando: false };
  var catalogo;

  M.iniciarPagina('catalogo', function () {
    catalogo = M.colecao('catalogo');
    catalogo.observar(function (l) {
      st.itens = l;
      if (st.editId && !l.some(function (c) { return c.id === st.editId; })) limpar();
      render();
    });
    iniciar();
  });

  function iniciar() {
    $('form').onsubmit = function (e) { e.preventDefault(); salvar(); };
    $('btnNovo').onclick = function () { limpar(); };
    $('btnCancelar').onclick = function () { limpar(); };
    $('btnExcluir').onclick = excluir;
    $('btnDuplicar').onclick = duplicar;
    M.campoValor($('fCusto')); M.campoValor($('fVenda'));
    ['fCusto', 'fVenda'].forEach(function (id) { $(id).addEventListener('input', function () { this.classList.remove('erro'); calcLucro(); }); });
    $('fNome').addEventListener('input', function () { this.classList.remove('erro'); });
    $('fUn').addEventListener('change', calcLucro);
    $('fPrazo').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
    $('busca').addEventListener('input', function () { st.busca = this.value; render(); });
    $('filtros').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      st.filtro = b.getAttribute('data-f'); render();
    });
    $('lista').addEventListener('click', function (e) {
      var row = e.target.closest('.lrow[data-id]');
      if (row) editar(row.getAttribute('data-id'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.editId && !document.querySelector('.overlay')) limpar(); });
  }

  function calcLucro() {
    var c = M.lerValorOuZero($('fCusto').value), v = M.lerValorOuZero($('fVenda').value);
    var box = $('lucroBox');
    box.classList.remove('neg', 'vazio-l');
    if (isNaN(c) || isNaN(v) || !v) {
      box.classList.add('vazio-l');
      $('lucroVal').textContent = 'R$ 0,00'; $('lucroPct').textContent = '0%';
      $('lucroSub').textContent = 'Preencha custo e venda para calcular';
      return;
    }
    var l = v - c, pct = Math.round(l / v * 100);
    if (l < 0) box.classList.add('neg');
    $('lucroVal').textContent = M.brl(l);
    $('lucroPct').textContent = pct + '%';
    $('lucroSub').textContent = '— por ' + ($('fUn').value || 'unidade') + (pct < (M.config.metas.margem || 0) ? ' · abaixo da margem mínima (' + M.config.metas.margem + '%)' : '');
  }

  function msg(t, tipo) { $('fMsg').textContent = t || ''; $('fMsg').className = 'msg' + (tipo ? ' ' + tipo : ''); }

  function salvar() {
    if (st.salvando) return;
    var nome = $('fNome').value.trim();
    var custo = M.lerValorOuZero($('fCusto').value), venda = M.lerValor($('fVenda').value);
    if (!nome) { msg('Preencha o nome do item.', 'erro'); $('fNome').classList.add('erro'); $('fNome').focus(); return; }
    if (isNaN(custo) || custo < 0) { msg('Preço de custo inválido.', 'erro'); $('fCusto').classList.add('erro'); $('fCusto').focus(); return; }
    if (isNaN(venda) || venda <= 0) { msg('Digite o preço de venda (ex: 45,00).', 'erro'); $('fVenda').classList.add('erro'); $('fVenda').focus(); return; }
    var d = { nome: nome, categoria: $('fCat').value, unidade: $('fUn').value, custoCentavos: custo, vendaCentavos: venda,
      prazoDias: $('fPrazo').value ? +$('fPrazo').value : null, descricao: $('fDesc').value.trim(), atualizadoEm: Date.now() };
    var editando = st.editId, p;
    if (editando) p = catalogo.atualizar(editando, d);
    else { d.criadoEm = Date.now(); p = catalogo.adicionar(d); }
    st.salvando = true; $('btnSalvar').disabled = true; msg('');
    p.then(function () {
      M.toast(editando ? 'Item atualizado.' : 'Item adicionado ao catálogo.');
      if (editando) editar(editando); else limpar();
    }).catch(function (err) { msg('Não foi possível salvar: ' + (err.code || err.message), 'erro'); })
      .then(function () { st.salvando = false; $('btnSalvar').disabled = false; });
  }

  function limpar() {
    st.editId = null;
    ['fNome', 'fCusto', 'fVenda', 'fPrazo', 'fDesc'].forEach(function (id) { $(id).value = ''; $(id).classList.remove('erro'); });
    $('fCat').value = ''; $('fUn').value = 'Un.';
    $('formTitulo').textContent = 'Novo item'; $('btnSalvar').textContent = 'Salvar item';
    $('btnCancelar').hidden = true; $('acoesEdicao').hidden = true;
    msg(''); calcLucro(); marcar(); $('fNome').focus();
  }

  function editar(id) {
    var c = st.itens.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    st.editId = id;
    $('fNome').value = c.nome || '';
    $('fCat').value = c.categoria || '';
    if (c.unidade && ![].some.call($('fUn').options, function (o) { return o.value === c.unidade; })) $('fUn').insertAdjacentHTML('beforeend', '<option>' + M.esc(c.unidade) + '</option>');
    $('fUn').value = c.unidade || 'Un.';
    $('fCusto').value = c.custoCentavos ? M.valorCampo(c.custoCentavos) : '';
    $('fVenda').value = M.valorCampo(c.vendaCentavos);
    $('fPrazo').value = c.prazoDias || '';
    $('fDesc').value = c.descricao || '';
    $('formTitulo').textContent = 'Editando item'; $('btnSalvar').textContent = 'Salvar alterações';
    $('btnCancelar').hidden = false; $('acoesEdicao').hidden = false;
    msg(''); calcLucro(); marcar();
  }

  function duplicar() {
    st.editId = null;
    $('fNome').value = $('fNome').value + ' (cópia)';
    $('formTitulo').textContent = 'Novo item (cópia)'; $('btnSalvar').textContent = 'Salvar item';
    $('acoesEdicao').hidden = true; marcar(); $('fNome').focus(); $('fNome').select();
  }

  function excluir() {
    var c = st.itens.filter(function (x) { return x.id === st.editId; })[0];
    if (!c) return;
    M.confirmar({ titulo: 'Excluir item?', texto: '"' + c.nome + '" sai do catálogo. Orçamentos já feitos não mudam.', ok: 'Excluir', perigo: true })
      .then(function (sim) {
        if (!sim) return;
        catalogo.remover(c.id).then(function () { M.toast('Item excluído.'); limpar(); }).catch(M.falha('excluir'));
      });
  }

  function render() {
    $('contagem').textContent = st.itens.length + (st.itens.length === 1 ? ' item no catálogo' : ' itens no catálogo');
    var cats = {}; st.itens.forEach(function (i) { if (i.categoria) cats[i.categoria] = 1; });
    var lcats = ['Todos'].concat(Object.keys(cats).sort());
    if (lcats.indexOf(st.filtro) < 0) st.filtro = 'Todos';
    $('filtros').innerHTML = lcats.map(function (c) {
      return '<button type="button" class="chip' + (c === st.filtro ? ' on' : '') + '" data-f="' + M.esc(c) + '">' + M.esc(c) + '</button>';
    }).join('');

    var lista = st.itens.filter(function (i) {
      if (st.filtro !== 'Todos' && i.categoria !== st.filtro) return false;
      return !st.busca.trim() || M.combina([i.nome, i.categoria, i.descricao].join(' '), st.busca);
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

    var cab = '<div class="lrow cab"><div class="k-nome">Produto / Serviço</div><div class="k-cat">Categoria</div><div class="k-n">Custo</div>' +
      '<div class="k-n">Venda</div><div class="k-n">Lucro</div><div class="k-un">Un.</div></div>';
    if (!lista.length) {
      $('lista').innerHTML = cab + '<div class="vazio">' + (st.itens.length
        ? '<strong>Nenhum item encontrado</strong>Tente outra busca ou categoria.'
        : '<strong>Catálogo vazio</strong>Cadastre seus serviços e produtos para usar nos orçamentos.') + '</div>';
      return;
    }
    $('lista').innerHTML = cab + lista.map(function (i) {
      var l = (i.vendaCentavos || 0) - (i.custoCentavos || 0), pct = i.vendaCentavos ? Math.round(l / i.vendaCentavos * 100) : 0;
      var sub = [i.descricao, i.prazoDias ? 'prazo: ' + i.prazoDias + (i.prazoDias == 1 ? ' dia' : ' dias') : ''].filter(Boolean).join(' — ');
      return '<div class="lrow" data-id="' + M.esc(i.id) + '">' +
        '<div class="k-nome"><div class="t">' + M.esc(i.nome) + '</div><div class="s">' + M.esc(sub || '—') + '</div></div>' +
        '<div class="k-cat">' + (i.categoria ? '<span class="tag ' + (COR_CAT[i.categoria] || '') + '">' + M.esc(i.categoria) + '</span>' : '') + '</div>' +
        '<div class="k-n" style="color:var(--fg-dim)">' + M.brl(i.custoCentavos) + '</div>' +
        '<div class="k-n" style="font-weight:700">' + M.brl(i.vendaCentavos) + '</div>' +
        '<div class="k-n" style="color:' + (l < 0 ? 'var(--danger)' : 'var(--success)') + '"><div style="font-weight:700">' + M.brl(l) + '</div><div style="font-size:10px">' + pct + '%</div></div>' +
        '<div class="k-un">' + M.esc(i.unidade || 'Un.') + '</div></div>';
    }).join('');
    marcar();
  }

  function marcar() {
    document.querySelectorAll('#lista .lrow[data-id]').forEach(function (r) { r.classList.toggle('sel', r.getAttribute('data-id') === st.editId); });
  }
})();
