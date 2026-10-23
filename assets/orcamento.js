/* Medusa Gestão — página Orçamento. */
(function () {
  'use strict';
  var M = window.Medusa, $ = M.$;
  var STATUS = { aguardando: ['Aguardando', 'amarelo'], aprovado: ['Aprovado', 'verde'], recusado: ['Recusado', 'vermelho'] };

  var st = { itens: [], clientes: [], catalogo: [], editId: null, status: 'aguardando', forma: '', filtro: 'todos', busca: '', salvando: false, sujo: false };
  var orcamentos, clientes;

  M.iniciarPagina('orcamento', function () {
    orcamentos = M.colecao('orcamentos');
    clientes = M.colecao('clientes');
    var carregou = false;
    orcamentos.observar(function (l) {
      st.itens = l;
      if (st.editId && !l.some(function (o) { return o.id === st.editId; })) novo();
      render();
      if (!carregou) { carregou = true; abrirDaURL(); }
    });
    clientes.observar(function (l) {
      st.clientes = l;
      $('listaClientes').innerHTML = l.filter(function (c) { return c.ativo !== false; })
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
        .map(function (c) { return '<option value="' + M.esc(c.nome) + '">'; }).join('');
      dicaCliente();
    });
    M.colecao('catalogo').observar(function (l) {
      st.catalogo = l;
      $('listaCatalogo').innerHTML = l.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
        .map(function (c) { return '<option value="' + M.esc(c.nome) + '">' + M.esc(M.brl(c.vendaCentavos)) + '</option>'; }).join('');
    });
    iniciar();
  });

  function abrirDaURL() {
    var q = new URLSearchParams(location.search);
    if (q.get('id')) { editar(q.get('id')); return; }
    if (q.get('cliente')) {
      clientes.obter(q.get('cliente')).then(function (c) { if (c) { $('fCliente').value = c.nome; preencherCliente(true); } });
    }
  }

  function empresaHTML() {
    var e = M.config.empresa;
    var linha1 = [e.cnpj ? 'CNPJ: ' + e.cnpj : '', e.telefone].filter(Boolean).join(' · ');
    var end = [[e.endereco, e.complemento].filter(Boolean).join(', '), e.bairro, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ');
    return M.logoHTML() + '<div><div class="doc-emp-nome">' + M.esc(e.fantasia || e.nome) + '</div>' +
      '<div class="doc-emp-info">' + M.esc(linha1 || 'Complete os dados da empresa em Configurações') + (end ? '<br>' + M.esc(end) : '') + '</div></div>';
  }

  function iniciar() {
    $('docEmpresa').innerHTML = empresaHTML();
    $('formas').innerHTML = M.formasPagamento(['2x cartão']).map(function (f) {
      return '<button type="button" class="opcao" data-forma="' + M.esc(f) + '">' + M.esc(f) + '</button>';
    }).join('');
    $('formas').addEventListener('click', function (e) {
      var b = e.target.closest('.opcao'); if (!b) return;
      setForma(st.forma === b.getAttribute('data-forma') ? '' : b.getAttribute('data-forma')); sujo();
    });
    M.aplicarMascaras();
    M.campoValor($('fDesconto'));
    $('fDesconto').addEventListener('input', totais);
    $('form').addEventListener('input', sujo);
    $('form').onsubmit = function (e) { e.preventDefault(); salvar(); };
    $('btnNovo').onclick = function () { confirmarSaida().then(function (ok) { if (ok) novo(); }); };
    $('btnAddItem').onclick = function () { addItem(); var ins = $('itens').querySelectorAll('.item'); ins[ins.length - 1].querySelector('.i-desc').focus(); };
    $('btnPDF').onclick = function () { salvar(true).then(function (o) { if (o) pdf(o); }); };
    $('btnWhats').onclick = function () { salvar(true).then(function (o) { if (o) whats(o); }); };
    $('btnPedido').onclick = gerarPedido;
    $('btnDuplicar').onclick = duplicar;
    $('btnExcluir').onclick = excluir;
    $('fCliente').addEventListener('input', function () { this.classList.remove('erro'); dicaCliente(); });
    $('fCliente').addEventListener('change', function () { preencherCliente(false); });
    $('statusBar').addEventListener('click', function (e) { var b = e.target.closest('.st-op'); if (b) mudarStatus(b.getAttribute('data-s')); });
    $('itens').addEventListener('input', function (e) {
      var it = e.target.closest('.item');
      if (e.target.classList.contains('i-desc')) doCatalogo(it, false);
      totais();
    });
    $('itens').addEventListener('change', function (e) { if (e.target.classList.contains('i-desc')) doCatalogo(e.target.closest('.item'), true); });
    $('itens').addEventListener('focusout', function (e) {
      if (e.target.classList.contains('i-unit')) { var c = M.lerValor(e.target.value); if (!isNaN(c)) e.target.value = M.valorCampo(c); }
    });
    $('itens').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rem]'); if (!b) return;
      b.closest('.item').remove();
      if (!$('itens').children.length) addItem();
      totais(); sujo();
    });
    $('busca').addEventListener('input', function () { st.busca = this.value; render(); });
    $('filtros').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      st.filtro = b.getAttribute('data-f');
      document.querySelectorAll('#filtros .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
      render();
    });
    $('lista').addEventListener('click', function (e) {
      var c = e.target.closest('.orc-card'); if (!c) return;
      var id = c.getAttribute('data-id');
      if (id === st.editId) return;
      confirmarSaida().then(function (ok) { if (ok) editar(id); });
    });
    window.addEventListener('beforeunload', function (e) { if (st.sujo) { e.preventDefault(); e.returnValue = ''; } });
    novo();
  }

  function sujo() { st.sujo = true; }
  function confirmarSaida() {
    if (!st.sujo) return Promise.resolve(true);
    return M.confirmar({ titulo: 'Descartar alterações?', texto: 'O orçamento atual tem alterações que não foram salvas.', ok: 'Descartar', perigo: true });
  }

  /* ---------- Itens ---------- */
  function addItem(i) {
    i = i || {};
    var div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = '<input class="input i-desc" list="listaCatalogo" maxlength="200" placeholder="Serviço ou produto…" value="' + M.esc(i.descricao || '') + '">' +
      '<input class="input i-qtd" inputmode="decimal" value="' + M.esc(i.qtd != null ? String(i.qtd).replace('.', ',') : '1') + '">' +
      '<input class="input i-unit" inputmode="decimal" placeholder="0,00" value="' + (i.unitCentavos ? M.valorCampo(i.unitCentavos) : '') + '">' +
      '<div class="tot">R$ 0,00</div>' +
      '<button type="button" class="icon-btn" data-rem title="Remover item">' + M.icone('lixo') + '</button>';
    if (i.catalogoId) div.setAttribute('data-cat', i.catalogoId);
    $('itens').appendChild(div);
    totais();
  }

  // Ao escolher um item do catálogo, preenche o preço.
  function doCatalogo(it, forcar) {
    var nome = it.querySelector('.i-desc').value.trim();
    var c = st.catalogo.filter(function (x) { return x.nome === nome; })[0];
    if (!c) { it.removeAttribute('data-cat'); return; }
    if (it.getAttribute('data-cat') === c.id && !forcar) return;
    it.setAttribute('data-cat', c.id);
    var u = it.querySelector('.i-unit');
    if (forcar || !u.value) { u.value = M.valorCampo(c.vendaCentavos); totais(); }
  }

  function lerQtd(v) { var n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? NaN : n; }

  function lerItens() {
    var erro = null;
    var itens = [].map.call($('itens').querySelectorAll('.item'), function (it) {
      var d = it.querySelector('.i-desc').value.trim(), q = lerQtd(it.querySelector('.i-qtd').value), u = M.lerValorOuZero(it.querySelector('.i-unit').value);
      if (!d && !u) return null;
      if (!d) erro = erro || [it.querySelector('.i-desc'), 'Preencha a descrição do item.'];
      if (isNaN(q) || q <= 0) erro = erro || [it.querySelector('.i-qtd'), 'Quantidade inválida.'];
      if (isNaN(u)) erro = erro || [it.querySelector('.i-unit'), 'Valor do item inválido.'];
      var o = { descricao: d, qtd: q, unitCentavos: u };
      if (it.getAttribute('data-cat')) o.catalogoId = it.getAttribute('data-cat');
      return o;
    }).filter(Boolean);
    return { itens: itens, erro: erro };
  }

  function subtotal(itens) { return itens.reduce(function (a, i) { return a + Math.round((i.qtd || 0) * (i.unitCentavos || 0)); }, 0); }

  function totais() {
    var sub = 0;
    [].forEach.call($('itens').querySelectorAll('.item'), function (it) {
      var q = lerQtd(it.querySelector('.i-qtd').value), u = M.lerValorOuZero(it.querySelector('.i-unit').value);
      var t = (isNaN(q) || isNaN(u)) ? 0 : Math.round(q * u);
      it.querySelector('.tot').textContent = M.brl(t);
      sub += t;
    });
    var desc = M.lerValorOuZero($('fDesconto').value);
    $('tSub').textContent = M.brl(sub);
    $('tTotal').textContent = M.brl(sub - (isNaN(desc) ? 0 : desc));
  }

  /* ---------- Cliente ---------- */
  function clientePorNome(nome) {
    var n = M.semAcento(String(nome || '').trim());
    return n ? st.clientes.filter(function (c) { return M.semAcento(c.nome) === n; })[0] : null;
  }
  function dicaCliente() {
    var nome = $('fCliente').value.trim(), h = $('hintCli');
    if (!nome) { h.textContent = ''; h.className = 'hint-cli'; return; }
    var c = clientePorNome(nome);
    h.textContent = c ? 'Cliente cadastrado' + (c.documento ? ' · ' + c.documento : '') : 'Cliente novo — será cadastrado ao salvar';
    h.className = 'hint-cli' + (c ? '' : ' novo');
  }
  function preencherCliente(forcar) {
    var c = clientePorNome($('fCliente').value);
    if (!c) return dicaCliente();
    if (forcar || !$('fWhats').value) $('fWhats').value = c.whatsapp || c.telefone || '';
    if (forcar || !$('fEmail').value) $('fEmail').value = c.email || '';
    dicaCliente();
  }

  /* ---------- Formulário ---------- */
  function setForma(f) {
    st.forma = f;
    document.querySelectorAll('#formas .opcao').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-forma') === f); });
  }
  function setStatus(s) {
    st.status = s;
    document.querySelectorAll('#statusBar .st-op').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-s') === s); });
  }
  function msg(t, tipo) { $('fMsg').textContent = t || ''; $('fMsg').className = 'msg' + (tipo ? ' ' + tipo : ''); }

  function novo() {
    st.editId = null;
    var hoje = M.hoje();
    $('fData').value = hoje;
    $('fValidade').value = M.somarDias(hoje, +M.config.docs.validadeDias || 15);
    ['fCliente', 'fWhats', 'fEmail', 'fDesconto'].forEach(function (id) { $(id).value = ''; $(id).classList.remove('erro'); });
    var d = M.config.docs;
    $('fObs').value = [d.condicoes, d.prazoEntrega ? 'Prazo de entrega: ' + d.prazoEntrega + '.' : ''].filter(Boolean).join('\n');
    $('itens').innerHTML = ''; addItem();
    setForma(M.formasPagamento()[0]); setStatus('aguardando');
    $('docNumero').textContent = 'Novo · número ao salvar'; $('docNumero').className = 'n rasc';
    $('statusBar').hidden = true; $('acoesEdicao').hidden = true;
    $('btnSalvar').textContent = 'Salvar orçamento';
    dicaCliente(); msg(''); totais(); marcar();
    st.sujo = false;
  }

  function editar(id) {
    var o = st.itens.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    st.editId = id;
    $('fData').value = o.data || M.hoje();
    $('fValidade').value = o.validade || '';
    $('fCliente').value = o.clienteNome || '';
    $('fWhats').value = o.clienteWhats || '';
    $('fEmail').value = o.clienteEmail || '';
    $('fDesconto').value = o.descontoCentavos ? M.valorCampo(o.descontoCentavos) : '';
    $('fObs').value = o.obs || '';
    $('itens').innerHTML = '';
    (o.itens && o.itens.length ? o.itens : [{}]).forEach(addItem);
    if (o.forma && !document.querySelector('#formas [data-forma="' + CSS.escape(o.forma) + '"]')) {
      $('formas').insertAdjacentHTML('beforeend', '<button type="button" class="opcao" data-forma="' + M.esc(o.forma) + '">' + M.esc(o.forma) + '</button>');
    }
    setForma(o.forma || ''); setStatus(o.status || 'aguardando');
    $('docNumero').textContent = o.numero || '—'; $('docNumero').className = 'n';
    $('statusBar').hidden = false; $('acoesEdicao').hidden = false;
    $('btnPedido').textContent = o.pedidoId ? 'Ver pedido' : 'Gerar pedido';
    $('btnSalvar').textContent = 'Salvar alterações';
    ['fCliente'].forEach(function (x) { $(x).classList.remove('erro'); });
    dicaCliente(); msg(''); totais(); marcar();
    st.sujo = false;
  }

  // Salva o orçamento. Devolve Promise com o orçamento salvo (ou null se houve erro).
  // silencioso: usado antes do PDF/WhatsApp, não mostra aviso se nada mudou.
  function salvar(silencioso) {
    if (st.salvando) return Promise.resolve(null);
    var nome = $('fCliente').value.trim();
    var li = lerItens();
    var desc = M.lerValorOuZero($('fDesconto').value);
    if (!nome) { msg('Preencha o nome do cliente.', 'erro'); $('fCliente').classList.add('erro'); $('fCliente').focus(); return Promise.resolve(null); }
    if (li.erro) { msg(li.erro[1], 'erro'); li.erro[0].focus(); return Promise.resolve(null); }
    if (!li.itens.length) { msg('Adicione pelo menos um item com valor.', 'erro'); $('itens').querySelector('.i-desc').focus(); return Promise.resolve(null); }
    if (isNaN(desc) || desc < 0) { msg('Desconto inválido.', 'erro'); $('fDesconto').focus(); return Promise.resolve(null); }
    var sub = subtotal(li.itens);
    if (desc > sub) { msg('O desconto é maior que o subtotal.', 'erro'); $('fDesconto').focus(); return Promise.resolve(null); }
    if (silencioso && st.editId && !st.sujo) return Promise.resolve(st.itens.filter(function (x) { return x.id === st.editId; })[0]);

    var d = {
      data: $('fData').value || M.hoje(), validade: $('fValidade').value || '',
      clienteNome: nome, clienteWhats: $('fWhats').value.trim(), clienteEmail: $('fEmail').value.trim(),
      itens: li.itens, subtotalCentavos: sub, descontoCentavos: desc, totalCentavos: sub - desc,
      forma: st.forma, obs: $('fObs').value.trim(), atualizadoEm: Date.now()
    };
    st.salvando = true; $('btnSalvar').disabled = true; msg('');
    var editando = st.editId;

    return garantirCliente(d).then(function (cli) {
      d.clienteId = cli ? cli.id : null;
      if (cli) d.clienteDoc = cli.documento || '';
      if (editando) return orcamentos.atualizar(editando, d).then(function () { return Object.assign({ id: editando }, st.itens.filter(function (x) { return x.id === editando; })[0], d); });
      return M.proximoNumero('orc').then(function (num) {
        d.numero = num; d.status = 'aguardando'; d.criadoEm = Date.now();
        return orcamentos.adicionar(d);
      });
    }).then(function (o) {
      M.toast(editando ? 'Orçamento atualizado.' : 'Orçamento ' + o.numero + ' salvo.');
      st.sujo = false;
      st.salvando = false; $('btnSalvar').disabled = false;
      if (!editando) { st.itens = st.itens.filter(function (x) { return x.id !== o.id; }).concat([o]); render(); }
      editar(o.id);
      return o;
    }).catch(function (err) {
      console.error(err);
      st.salvando = false; $('btnSalvar').disabled = false;
      msg('Não foi possível salvar: ' + (err.code || err.message), 'erro');
      return null;
    });
  }

  // Cadastra o cliente automaticamente se ainda não existir.
  function garantirCliente(d) {
    var c = clientePorNome(d.clienteNome);
    if (c) {
      var upd = {};
      if (d.clienteWhats && !c.whatsapp) upd.whatsapp = d.clienteWhats;
      if (d.clienteEmail && !c.email) upd.email = d.clienteEmail;
      if (Object.keys(upd).length) clientes.atualizar(c.id, upd);
      return Promise.resolve(c);
    }
    return clientes.adicionar({ nome: d.clienteNome, whatsapp: d.clienteWhats, email: d.clienteEmail, ativo: true, criadoEm: Date.now(), atualizadoEm: Date.now() })
      .then(function (novoC) { M.toast('Cliente "' + d.clienteNome + '" cadastrado.'); return novoC; });
  }

  function mudarStatus(s) {
    if (!st.editId || s === st.status) return;
    var o = st.itens.filter(function (x) { return x.id === st.editId; })[0];
    setStatus(s);
    orcamentos.atualizar(st.editId, { status: s, statusEm: Date.now() }).then(function () {
      M.toast('Orçamento marcado como ' + STATUS[s][0].toLowerCase() + '.');
      if (s === 'aprovado' && o && !o.pedidoId) {
        M.confirmar({ titulo: 'Orçamento aprovado!', texto: 'Quer criar o pedido de produção agora?', ok: 'Criar pedido' })
          .then(function (sim) { if (sim) gerarPedido(); });
      }
    }).catch(M.falha('mudar o status'));
  }

  function gerarPedido() {
    var o = st.itens.filter(function (x) { return x.id === st.editId; })[0];
    if (!o) return;
    if (o.pedidoId) { location.href = 'pedidos.html?id=' + encodeURIComponent(o.pedidoId); return; }
    if (st.sujo) { M.toast('Salve o orçamento antes de gerar o pedido.', 'erro'); return; }
    var prazo = Math.max.apply(null, [7].concat((o.itens || []).map(function (i) {
      var c = st.catalogo.filter(function (x) { return x.id === i.catalogoId; })[0]; return c && c.prazoDias ? +c.prazoDias : 0;
    })));
    M.proximoNumero('ped').then(function (num) {
      return M.colecao('pedidos').adicionar({
        numero: num, clienteId: o.clienteId || null, clienteNome: o.clienteNome, clienteWhats: o.clienteWhats || '',
        descricao: (o.itens || []).map(function (i) { return (i.qtd !== 1 ? String(i.qtd).replace('.', ',') + '× ' : '') + i.descricao; }).join(' + '),
        itens: o.itens || [], descontoCentavos: o.descontoCentavos || 0, valorCentavos: o.totalCentavos, entrega: M.somarDias(M.hoje(), prazo),
        prioridade: 'normal', status: 'aguardando', progresso: 0, pago: false, orcamentoId: o.id, orcamentoNumero: o.numero,
        forma: o.forma || '', obs: '', criadoEm: Date.now(), atualizadoEm: Date.now()
      });
    }).then(function (p) {
      var upd = { pedidoId: p.id };
      if (o.status !== 'aprovado') { upd.status = 'aprovado'; upd.statusEm = Date.now(); }
      return orcamentos.atualizar(o.id, upd).then(function () {
        if (upd.status) setStatus('aprovado');
        $('btnPedido').textContent = 'Ver pedido';
        M.toast('Pedido ' + p.numero + ' criado em Pedidos.');
      });
    }).catch(M.falha('criar o pedido'));
  }

  function duplicar() {
    var o = st.itens.filter(function (x) { return x.id === st.editId; })[0];
    if (!o) return;
    confirmarSaida().then(function (ok) {
      if (!ok) return;
      novo();
      $('fCliente').value = o.clienteNome || ''; $('fWhats').value = o.clienteWhats || ''; $('fEmail').value = o.clienteEmail || '';
      $('fDesconto').value = o.descontoCentavos ? M.valorCampo(o.descontoCentavos) : '';
      $('fObs').value = o.obs || '';
      $('itens').innerHTML = ''; (o.itens || [{}]).forEach(addItem);
      setForma(o.forma || '');
      $('docNumero').textContent = 'Cópia de ' + o.numero + ' · número ao salvar';
      dicaCliente(); totais(); st.sujo = true;
      M.toast('Cópia criada. Ajuste e salve.');
    });
  }

  function excluir() {
    var o = st.itens.filter(function (x) { return x.id === st.editId; })[0];
    if (!o) return;
    M.confirmar({ titulo: 'Excluir orçamento ' + o.numero + '?', texto: o.clienteNome + ' — ' + M.brl(o.totalCentavos) + '. Essa ação não pode ser desfeita.' + (o.pedidoId ? ' O pedido gerado continua existindo.' : ''), ok: 'Excluir', perigo: true })
      .then(function (sim) {
        if (!sim) return;
        orcamentos.remover(o.id).then(function () { M.toast('Orçamento excluído.'); st.sujo = false; novo(); }).catch(M.falha('excluir'));
      });
  }

  /* ---------- PDF e WhatsApp ---------- */
  function pdf(o) {
    var c = st.clientes.filter(function (x) { return x.id === o.clienteId; })[0] || {};
    M.imprimir(M.documentoHTML({
      titulo: 'Orçamento', numero: o.numero, data: o.data, validade: o.validade, intro: M.config.docs.intro,
      cliente: { nome: o.clienteNome, documento: c.documento || o.clienteDoc, responsavel: c.responsavel, telefone: o.clienteWhats, email: o.clienteEmail },
      itens: o.itens, descontoCentavos: o.descontoCentavos, totalCentavos: o.totalCentavos,
      forma: o.forma, obs: o.obs, extra: M.dadosBancariosHTML(), assinatura: true
    }), 'Orçamento ' + o.numero + ' - ' + o.clienteNome);
  }

  function whats(o) {
    if (!o.clienteWhats) M.toast('Sem WhatsApp do cliente: escolha o contato na conversa.');
    var e = M.config.empresa;
    var linhas = (o.itens || []).map(function (i) {
      var t = Math.round(i.qtd * i.unitCentavos);
      return '• ' + i.descricao + (i.qtd !== 1 ? ' (' + String(i.qtd).replace('.', ',') + ' × ' + M.brl(i.unitCentavos) + ')' : '') + ': ' + M.brl(t);
    });
    var txt = 'Olá' + (o.clienteNome ? ', ' + o.clienteNome : '') + '! Segue o orçamento *' + o.numero + '* da ' + (e.fantasia || e.nome) + ':\n\n' +
      linhas.join('\n') + '\n' +
      (o.descontoCentavos ? '\nDesconto: - ' + M.brl(o.descontoCentavos) : '') +
      '\n*Total: ' + M.brl(o.totalCentavos) + '*' +
      (o.forma ? '\nPagamento: ' + o.forma : '') +
      (o.validade ? '\nVálido até ' + M.dataBR(o.validade) + '.' : '') +
      (M.config.pagamentos.chavePix ? '\nChave PIX: ' + M.config.pagamentos.chavePix : '') +
      '\n\nQualquer dúvida, estou à disposição!';
    M.whatsapp(o.clienteWhats, txt);
  }

  /* ---------- Lista ---------- */
  function render() {
    var aguard = st.itens.filter(function (o) { return o.status === 'aguardando'; }).length;
    $('contagem').textContent = 'Salvos (' + st.itens.length + ')' + (aguard ? ' · ' + aguard + ' aguardando' : '');
    var lista = st.itens.filter(function (o) {
      if (st.filtro !== 'todos' && o.status !== st.filtro) return false;
      return !st.busca.trim() || M.combina([o.numero, o.clienteNome, (o.itens || []).map(function (i) { return i.descricao; }).join(' ')].join(' '), st.busca);
    }).sort(function (a, b) { return (b.criadoEm || 0) - (a.criadoEm || 0); });
    if (!lista.length) {
      $('lista').innerHTML = '<div class="vazio">' + (st.itens.length ? '<strong>Nada encontrado</strong>Tente outra busca ou filtro.'
        : '<strong>Nenhum orçamento salvo</strong>Preencha a proposta ao lado e clique em Salvar.') + '</div>';
      return;
    }
    var hoje = M.hoje();
    $('lista').innerHTML = lista.map(function (o) {
      var s = STATUS[o.status] || STATUS.aguardando;
      var vencido = o.status === 'aguardando' && o.validade && o.validade < hoje;
      return '<div class="orc-card" data-id="' + M.esc(o.id) + '">' +
        '<div class="top"><div style="min-width:0"><div class="cli">' + M.esc(o.clienteNome) + '</div>' +
        '<div class="meta">' + M.esc(o.numero) + ' · ' + M.esc(M.dataCurta(o.data)) + (o.pedidoId ? ' · pedido criado' : '') + '</div></div>' +
        '<span class="tag ' + (vencido ? 'vermelho' : s[1]) + '">' + (vencido ? 'Vencido' : s[0]) + '</span></div>' +
        '<div class="bot"><div class="desc">' + M.esc((o.itens || []).map(function (i) { return i.descricao; }).join(' + ')) + '</div>' +
        '<div class="val">' + M.brlCurto(o.totalCentavos) + '</div></div></div>';
    }).join('');
    marcar();
  }

  function marcar() {
    document.querySelectorAll('#lista .orc-card').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-id') === st.editId); });
  }
})();
