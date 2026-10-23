/* Medusa Gestão — página Recibos. */
(function () {
  'use strict';
  var M = window.Medusa, $ = M.$;
  var st = { itens: [], clientes: [], catalogo: [], selId: null, editando: false, filtro: 'todos', busca: '', salvando: false };
  var recibos;

  M.iniciarPagina('recibos', function () {
    recibos = M.colecao('recibos');
    var primeira = true;
    recibos.observar(function (l) {
      st.itens = l;
      if (st.selId && !l.some(function (r) { return r.id === st.selId; })) { st.selId = null; st.editando = false; }
      if (primeira) {
        primeira = false;
        var id = new URLSearchParams(location.search).get('id');
        if (id) st.selId = id;
        else if (l.length) st.selId = ordenar(l)[0].id;
      }
      renderLista();
      if (!st.editando) renderDireita();
    });
    M.colecao('clientes').observar(function (l) {
      st.clientes = l;
      $('listaClientes').innerHTML = l.filter(function (c) { return c.ativo !== false; })
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
        .map(function (c) { return '<option value="' + M.esc(c.nome) + '">'; }).join('');
    });
    M.colecao('catalogo').observar(function (l) {
      st.catalogo = l;
      $('listaCatalogo').innerHTML = l.map(function (c) { return '<option value="' + M.esc(c.nome) + '">' + M.esc(M.brl(c.vendaCentavos)) + '</option>'; }).join('');
    });
    iniciar();
  });

  function iniciar() {
    $('btnNovo').onclick = function () { confirmarSaida().then(function (ok) { if (ok) formulario(null); }); };
    $('busca').addEventListener('input', function () { st.busca = this.value; renderLista(); });
    $('filtros').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      st.filtro = b.getAttribute('data-f');
      document.querySelectorAll('#filtros .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
      renderLista();
    });
    $('lista').addEventListener('click', function (e) {
      var r = e.target.closest('.rrow'); if (!r) return;
      var id = r.getAttribute('data-id');
      confirmarSaida().then(function (ok) {
        if (!ok) return;
        st.selId = id; st.editando = false;
        renderLista(); renderDireita();
      });
    });
  }

  function confirmarSaida() {
    if (!st.editando) return Promise.resolve(true);
    return M.confirmar({ titulo: 'Descartar recibo?', texto: 'As alterações do formulário não foram salvas.', ok: 'Descartar', perigo: true });
  }

  function porId(id) { return st.itens.filter(function (r) { return r.id === id; })[0]; }
  function ordenar(l) {
    return l.slice().sort(function (a, b) {
      if ((a.data || '') !== (b.data || '')) return (a.data || '') < (b.data || '') ? 1 : -1;
      return (b.criadoEm || 0) - (a.criadoEm || 0);
    });
  }
  function referente(r) { return (r.itens || []).map(function (i) { return i.descricao; }).join(' + '); }

  /* ---------- Lista ---------- */
  function renderLista() {
    var mesAtual = M.mesAtual();
    var doMes = st.itens.filter(function (r) { return String(r.data).slice(0, 7) === mesAtual; });
    var receber = st.itens.filter(function (r) { return r.status !== 'pago'; });
    $('subtitulo').textContent = doMes.length + (doMes.length === 1 ? ' recibo emitido' : ' recibos emitidos') + ' · ' + M.mesNome(mesAtual) +
      (receber.length ? ' · ' + receber.length + ' a receber (' + M.brlCurto(receber.reduce(function (a, r) { return a + (r.totalCentavos || 0); }, 0)) + ')' : '');

    var lista = ordenar(st.itens.filter(function (r) {
      if (st.filtro === 'pago' && r.status !== 'pago') return false;
      if (st.filtro === 'pendente' && r.status === 'pago') return false;
      return !st.busca.trim() || M.combina([r.numero, r.clienteNome, referente(r), r.obs, r.forma].join(' '), st.busca);
    }));
    if (!lista.length) {
      $('lista').innerHTML = '<div class="vazio">' + (st.itens.length ? '<strong>Nada encontrado</strong>Tente outra busca ou filtro.'
        : '<strong>Nenhum recibo ainda</strong>Clique em "Novo recibo" ou gere um a partir de um pedido.') + '</div>';
      return;
    }
    var html = '', mes = null;
    lista.forEach(function (r) {
      var m = String(r.data || '').slice(0, 7);
      if (m !== mes) {
        mes = m;
        var tot = lista.filter(function (x) { return String(x.data).slice(0, 7) === m && x.status === 'pago'; }).reduce(function (a, x) { return a + (x.totalCentavos || 0); }, 0);
        html += '<div class="mes-grupo"><span>' + (m ? M.mesNome(m) : 'Sem data') + '</span><span>' + M.brlCurto(tot) + ' recebido</span></div>';
      }
      var pago = r.status === 'pago';
      html += '<div class="rrow' + (r.id === st.selId ? ' sel' : '') + '" data-id="' + M.esc(r.id) + '">' +
        '<div class="l1"><span class="cli">' + M.esc(r.clienteNome) + '</span><span class="v">' + M.brlCurto(r.totalCentavos) + '</span></div>' +
        '<div class="l2"><span class="ref">' + M.esc(r.numero) + ' · ' + M.esc(referente(r)) + '</span>' +
        '<span class="tag ' + (pago ? 'verde' : 'amarelo') + '">' + (pago ? 'Pago' : 'A receber') + '</span></div>' +
        '<div class="l2"><span>' + M.esc(M.dataBR(r.data)) + '</span></div></div>';
    });
    $('lista').innerHTML = html;
  }

  /* ---------- Visualização ---------- */
  function docRecibo(r) {
    var c = st.clientes.filter(function (x) { return x.id === r.clienteId; })[0] || {};
    return M.documentoHTML({
      titulo: 'Recibo', numero: r.numero, data: r.data, rotuloCliente: 'Recebi de', rotuloItens: 'Referente a',
      cliente: { nome: r.clienteNome, documento: r.clienteDoc || c.documento, responsavel: r.clienteResp || c.responsavel, telefone: r.clienteWhats },
      destaque: '<div class="pdoc-destaque"><div><div class="pdoc-lab">Valor recebido</div><div class="v">' + M.brl(r.totalCentavos) + '</div></div>' +
        '<div style="text-align:right"><div class="pdoc-lab">Forma</div><div style="font-weight:700">' + M.esc(r.forma || '—') + '</div></div></div>',
      itens: r.itens, descontoCentavos: r.descontoCentavos || 0, totalCentavos: r.totalCentavos, obs: r.obs, assinatura: true
    });
  }

  function renderDireita() {
    var r = porId(st.selId);
    var d = $('direita');
    if (!r) {
      d.innerHTML = '<div class="vazio" style="margin:auto">' + (st.itens.length ? '<strong>Selecione um recibo</strong>Escolha um recibo na lista para ver, baixar ou enviar.'
        : '<strong>Nenhum recibo</strong><button class="btn sm" id="vNovo" style="margin-top:12px">+ Criar primeiro recibo</button>') + '</div>';
      if ($('vNovo')) $('vNovo').onclick = function () { formulario(null); };
      return;
    }
    var pago = r.status === 'pago';
    d.innerHTML = '<div class="barra-acoes"><div class="info">' + M.esc(r.numero + ' · ' + r.clienteNome + ' · ' + M.dataBR(r.data)) + '</div>' +
      '<button class="btn sm sec" id="aPDF">' + M.icone('pdf') + 'Baixar PDF</button>' +
      '<button class="btn sm sec" id="aWhats">' + M.icone('whats') + 'WhatsApp</button>' +
      '<button class="btn sm sec" id="aEditar">' + M.icone('editar') + 'Editar</button>' +
      (pago ? '<button class="btn sm sec" id="aPago">Marcar a receber</button>' : '<button class="btn sm verde" id="aPago">' + M.icone('check') + 'Marcar pago</button>') +
      '<button class="icon-btn" id="aExcluir" title="Excluir recibo">' + M.icone('lixo') + '</button></div>' +
      '<div class="preview">' + (pago ? '' : '<div class="carimbo">A RECEBER — este recibo ainda não foi pago e não entrou no Caixa.</div>') + docRecibo(r) + '</div>';
    $('aPDF').onclick = function () { M.imprimir(docRecibo(r), 'Recibo ' + r.numero + ' - ' + r.clienteNome); };
    $('aWhats').onclick = function () { whats(r); };
    $('aEditar').onclick = function () { formulario(r); };
    $('aPago').onclick = function () { pago ? marcarPendente(r) : marcarPago(r); };
    $('aExcluir').onclick = function () { excluir(r); };
  }

  function whats(r) {
    var e = M.config.empresa;
    var txt = r.status === 'pago'
      ? 'Olá, ' + r.clienteNome + '! Confirmamos o recebimento de *' + M.brl(r.totalCentavos) + '* (' + (r.forma || '') + ') referente a ' + referente(r) + '.\nRecibo ' + r.numero + ' — ' + (e.fantasia || e.nome) + '. Obrigado!'
      : 'Olá, ' + r.clienteNome + '! Segue o valor de *' + M.brl(r.totalCentavos) + '* referente a ' + referente(r) + ' (' + r.numero + ').' +
        (M.config.pagamentos.chavePix ? '\nChave PIX: ' + M.config.pagamentos.chavePix : '') + '\n' + (e.fantasia || e.nome);
    M.whatsapp(r.clienteWhats, txt);
  }

  // Liga/desliga o pagamento do pedido de origem, se houver.
  function sincronizarPedido(r, pago) {
    if (!r.pedidoId) return Promise.resolve();
    var upd = { pago: pago }; if (pago && r.forma) upd.forma = r.forma;
    return M.colecao('pedidos').atualizar(r.pedidoId, upd).catch(function () {});
  }

  function marcarPago(r) {
    var r2 = Object.assign({}, r, { status: 'pago', dataPagamento: M.hoje() });
    M.lancarRecibo(r2).then(function (lid) {
      return recibos.atualizar(r.id, { status: 'pago', dataPagamento: r2.dataPagamento, lancamentoId: lid, atualizadoEm: Date.now() });
    }).then(function () { return sincronizarPedido(r, true); })
      .then(function () { M.toast('Recibo pago. Entrada de ' + M.brl(r.totalCentavos) + ' lançada no Caixa.'); })
      .catch(M.falha('marcar como pago'));
  }

  function marcarPendente(r) {
    M.confirmar({ titulo: 'Marcar como a receber?', texto: 'A entrada de ' + M.brl(r.totalCentavos) + ' lançada no Caixa por este recibo será removida.', ok: 'Marcar a receber' })
      .then(function (sim) {
        if (!sim) return;
        var p = r.lancamentoId ? M.colecao('lancamentos').remover(r.lancamentoId) : Promise.resolve();
        p.then(function () { return recibos.atualizar(r.id, { status: 'pendente', dataPagamento: '', lancamentoId: null, atualizadoEm: Date.now() }); })
          .then(function () { return sincronizarPedido(r, false); })
          .then(function () { M.toast('Recibo marcado como a receber.'); })
          .catch(M.falha('atualizar o recibo'));
      });
  }

  function excluir(r) {
    M.confirmar({ titulo: 'Excluir recibo ' + r.numero + '?', texto: r.clienteNome + ' — ' + M.brl(r.totalCentavos) + '.' + (r.lancamentoId ? ' A entrada lançada no Caixa também será removida.' : '') + ' Essa ação não pode ser desfeita.', ok: 'Excluir', perigo: true })
      .then(function (sim) {
        if (!sim) return;
        var p = r.lancamentoId ? M.colecao('lancamentos').remover(r.lancamentoId) : Promise.resolve();
        p.then(function () { return recibos.remover(r.id); })
          .then(function () { if (r.pedidoId) return M.colecao('pedidos').atualizar(r.pedidoId, { reciboId: null }).catch(function () {}); })
          .then(function () { M.toast('Recibo excluído.'); })
          .catch(M.falha('excluir'));
      });
  }

  /* ---------- Formulário (novo / editar) ---------- */
  function lerQtd(v) { var n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? NaN : n; }

  function formulario(r) {
    st.editando = true;
    var novo = !r;
    r = r || { data: M.hoje(), status: 'pago', forma: M.formasPagamento()[0], itens: [{ qtd: 1 }] };
    var formas = M.formasPagamento(r.forma ? [r.forma] : []);
    $('direita').innerHTML = '<div class="preview"><form class="rform stack" id="rForm" novalidate autocomplete="off">' +
      '<div class="form-titulo" style="margin:0"><h2>' + (novo ? 'Novo recibo' : 'Editar recibo ' + M.esc(r.numero)) + '</h2>' +
      '<button type="button" class="link-btn" id="rCancelar">Cancelar</button></div>' +
      '<div class="secao">Recebi de</div>' +
      '<div class="g2"><div class="field"><label class="label" for="rCli">Cliente *</label><input class="input" id="rCli" list="listaClientes" value="' + M.esc(r.clienteNome || '') + '" placeholder="Nome do cliente…"></div>' +
      '<div class="field"><label class="label" for="rDoc">CPF / CNPJ</label><input class="input" id="rDoc" data-mask="doc" value="' + M.esc(r.clienteDoc || '') + '" placeholder="Opcional"></div></div>' +
      '<div class="g2"><div class="field"><label class="label" for="rResp">Responsável</label><input class="input" id="rResp" value="' + M.esc(r.clienteResp || '') + '" placeholder="Opcional"></div>' +
      '<div class="field"><label class="label" for="rWhats">WhatsApp</label><input class="input" id="rWhats" data-mask="tel" value="' + M.esc(r.clienteWhats || '') + '" placeholder="(00) 00000-0000"></div></div>' +
      '<div class="secao">Referente a</div>' +
      '<div class="itens-cab"><div>Descrição</div><div>Qtd.</div><div>Valor unit.</div><div style="text-align:right">Total</div><div></div></div>' +
      '<div class="itens" id="rItens"></div>' +
      '<button type="button" class="add-item" id="rAdd">+ Adicionar item</button>' +
      '<div class="total-linha"><span>Desconto (R$)</span><input class="input" id="rDesc" inputmode="decimal" placeholder="0,00" style="width:120px;padding:7px 10px;text-align:right" value="' + (r.descontoCentavos ? M.valorCampo(r.descontoCentavos) : '') + '"></div>' +
      '<div class="total-linha">Valor total <b id="rTotal">R$ 0,00</b></div>' +
      '<div class="secao">Pagamento</div>' +
      '<div class="g2"><div class="field"><label class="label" for="rData">Data do recibo</label><input class="input" id="rData" type="date" value="' + M.esc(r.data || M.hoje()) + '"></div>' +
      '<div class="field"><label class="label" for="rForma">Forma de pagamento</label><select class="input" id="rForma">' +
      formas.map(function (f) { return '<option' + (r.forma === f ? ' selected' : '') + '>' + M.esc(f) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><div class="label">Situação</div><div class="st-ops" id="rStatus">' +
      '<button type="button" class="st-op" data-s="pago">Pago — lança entrada no Caixa</button><button type="button" class="st-op" data-s="pendente">A receber</button></div></div>' +
      '<div class="field"><label class="label" for="rObs">Observações</label><textarea class="input" id="rObs" rows="3" maxlength="1000" placeholder="Ex: Pagamento recebido via PIX. Serviços conforme proposta…">' + M.esc(r.obs || '') + '</textarea></div>' +
      '<div class="msg" id="rMsg"></div>' +
      '<button class="btn block" type="submit" id="rSalvar">' + (novo ? 'Emitir recibo' : 'Salvar alterações') + '</button></form></div>';
    M.aplicarMascaras($('direita'));

    var status = r.status === 'pago' ? 'pago' : 'pendente';
    function setStatus(s) { status = s; document.querySelectorAll('#rStatus .st-op').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-s') === s); }); }
    setStatus(status);
    $('rStatus').onclick = function (e) { var b = e.target.closest('.st-op'); if (b) setStatus(b.getAttribute('data-s')); };

    function addItem(i) {
      i = i || {};
      var div = document.createElement('div'); div.className = 'item';
      div.innerHTML = '<input class="input i-desc" list="listaCatalogo" maxlength="200" placeholder="Serviço ou produto…" value="' + M.esc(i.descricao || '') + '">' +
        '<input class="input i-qtd" inputmode="decimal" value="' + M.esc(String(i.qtd != null ? i.qtd : 1).replace('.', ',')) + '">' +
        '<input class="input i-unit" inputmode="decimal" placeholder="0,00" value="' + (i.unitCentavos ? M.valorCampo(i.unitCentavos) : '') + '">' +
        '<div class="tot">R$ 0,00</div><button type="button" class="icon-btn" data-rem title="Remover">' + M.icone('lixo') + '</button>';
      $('rItens').appendChild(div);
    }
    function total() {
      var t = 0;
      [].forEach.call($('rItens').querySelectorAll('.item'), function (it) {
        var q = lerQtd(it.querySelector('.i-qtd').value), u = M.lerValorOuZero(it.querySelector('.i-unit').value);
        var v = isNaN(q) || isNaN(u) ? 0 : Math.round(q * u);
        it.querySelector('.tot').textContent = M.brl(v); t += v;
      });
      var desc = M.lerValorOuZero($('rDesc').value);
      $('rTotal').textContent = M.brl(t - (isNaN(desc) ? 0 : desc));
      return t;
    }
    (r.itens && r.itens.length ? r.itens : [{}]).forEach(addItem); total();
    $('rAdd').onclick = function () { addItem(); total(); var l = $('rItens').querySelectorAll('.i-desc'); l[l.length - 1].focus(); };
    $('rItens').addEventListener('input', total);
    $('rDesc').addEventListener('input', total);
    M.campoValor($('rDesc'));
    $('rItens').addEventListener('change', function (e) {
      if (!e.target.classList.contains('i-desc')) return;
      var c = st.catalogo.filter(function (x) { return x.nome === e.target.value.trim(); })[0];
      var u = e.target.closest('.item').querySelector('.i-unit');
      if (c) { u.value = M.valorCampo(c.vendaCentavos); total(); }
    });
    $('rItens').addEventListener('focusout', function (e) { if (e.target.classList.contains('i-unit')) { var c = M.lerValor(e.target.value); if (!isNaN(c)) e.target.value = M.valorCampo(c); } });
    $('rItens').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rem]'); if (!b) return;
      b.closest('.item').remove(); if (!$('rItens').children.length) addItem(); total();
    });
    $('rCli').addEventListener('change', function () {
      var c = st.clientes.filter(function (x) { return M.semAcento(x.nome) === M.semAcento($('rCli').value.trim()); })[0];
      if (!c) return;
      if (!$('rDoc').value) $('rDoc').value = c.documento || '';
      if (!$('rResp').value) $('rResp').value = c.responsavel || '';
      if (!$('rWhats').value) $('rWhats').value = c.whatsapp || c.telefone || '';
    });
    $('rCancelar').onclick = function () { st.editando = false; renderDireita(); };
    $('rCli').focus();

    $('rForm').onsubmit = function (e) {
      e.preventDefault();
      if (st.salvando) return;
      var m = function (t, el) { $('rMsg').textContent = t; $('rMsg').className = 'msg erro'; if (el) el.focus(); };
      var nome = $('rCli').value.trim();
      if (!nome) return m('Preencha o nome de quem pagou.', $('rCli'));
      var itens = [], erro = null;
      [].forEach.call($('rItens').querySelectorAll('.item'), function (it) {
        var d = it.querySelector('.i-desc').value.trim(), q = lerQtd(it.querySelector('.i-qtd').value), u = M.lerValorOuZero(it.querySelector('.i-unit').value);
        if (!d && !u) return;
        if (!d) erro = erro || ['Preencha a descrição do item.', it.querySelector('.i-desc')];
        else if (isNaN(q) || q <= 0) erro = erro || ['Quantidade inválida.', it.querySelector('.i-qtd')];
        else if (isNaN(u) || u <= 0) erro = erro || ['Digite o valor do item.', it.querySelector('.i-unit')];
        itens.push({ descricao: d, qtd: q, unitCentavos: u });
      });
      if (erro) return m(erro[0], erro[1]);
      if (!itens.length) return m('Adicione pelo menos um item com valor.', $('rItens').querySelector('.i-desc'));
      var soma = itens.reduce(function (a, i) { return a + Math.round(i.qtd * i.unitCentavos); }, 0);
      var desconto = M.lerValorOuZero($('rDesc').value);
      if (isNaN(desconto) || desconto < 0 || desconto >= soma) return m('Desconto inválido (precisa ser menor que a soma dos itens).', $('rDesc'));
      var tot = soma - desconto;
      var c = st.clientes.filter(function (x) { return M.semAcento(x.nome) === M.semAcento(nome); })[0];
      var d = {
        clienteNome: nome, clienteId: c ? c.id : (r.clienteId || null), clienteDoc: $('rDoc').value.trim(), clienteResp: $('rResp').value.trim(),
        clienteWhats: $('rWhats').value.trim(), itens: itens, descontoCentavos: desconto, totalCentavos: tot, data: $('rData').value || M.hoje(),
        forma: $('rForma').value, status: status, obs: $('rObs').value.trim(), atualizadoEm: Date.now()
      };
      d.dataPagamento = status === 'pago' ? (r.status === 'pago' && r.dataPagamento ? r.dataPagamento : d.data) : '';
      st.salvando = true; $('rSalvar').disabled = true;
      var salvo;
      var p = novo
        ? M.proximoNumero('rec').then(function (num) { d.numero = num; d.criadoEm = Date.now(); return recibos.adicionar(d); })
        : recibos.atualizar(r.id, d).then(function () { return Object.assign({}, r, d); });
      p.then(function (rec) {
        salvo = rec;
        // Mantém o Caixa coerente com a situação do recibo.
        if (status === 'pago') return M.lancarRecibo(rec).then(function (lid) { salvo.lancamentoId = lid; return recibos.atualizar(rec.id, { lancamentoId: lid }); });
        if (rec.lancamentoId) return M.colecao('lancamentos').remover(rec.lancamentoId).then(function () { return recibos.atualizar(rec.id, { lancamentoId: null }); });
      }).then(function () {
        if (salvo.pedidoId && r.status !== status) return sincronizarPedido(salvo, status === 'pago');
      }).then(function () {
        M.toast((novo ? 'Recibo ' + salvo.numero + ' emitido' : 'Recibo atualizado') + (status === 'pago' ? ' · Caixa atualizado.' : '.'));
        st.salvando = false; st.editando = false; st.selId = salvo.id;
        renderLista(); renderDireita();
      }).catch(function (err) {
        console.error(err); st.salvando = false; $('rSalvar').disabled = false;
        m('Não foi possível salvar: ' + (err.code || err.message));
      });
    };
  }
})();
