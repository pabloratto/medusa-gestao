/* Medusa Gestão — página Pedidos (quadro de produção). */
(function () {
  'use strict';
  var M = window.Medusa, $ = M.$;
  var COLUNAS = [
    { id: 'aguardando', nome: 'Aguardando', cor: '#FFA726' },
    { id: 'producao', nome: 'Em produção', cor: '#29B6F6' },
    { id: 'pronto', nome: 'Pronto', cor: '#AADC00' },
    { id: 'entregue', nome: 'Entregue', cor: '#66BB6A' }
  ];
  var PRIO = { urgente: ['Urgente', '#FF6B6B'], normal: ['Normal', '#FFA726'], baixa: ['Baixa', '#66BB6A'] };

  var st = { itens: [], clientes: [], filtro: 'todos', busca: '', arrastando: null };
  var pedidos;

  M.iniciarPagina('pedidos', function () {
    pedidos = M.colecao('pedidos');
    var primeira = true;
    pedidos.observar(function (l) {
      st.itens = l; render();
      if (primeira) { primeira = false; var id = new URLSearchParams(location.search).get('id'); if (id) abrir(id); }
    });
    M.colecao('clientes').observar(function (l) {
      st.clientes = l;
      $('listaClientes').innerHTML = l.filter(function (c) { return c.ativo !== false; })
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
        .map(function (c) { return '<option value="' + M.esc(c.nome) + '">'; }).join('');
    });
    iniciar();
  });

  function iniciar() {
    $('btnNovo').onclick = function () { abrir(null); };
    $('busca').addEventListener('input', function () { st.busca = this.value; render(); });
    $('filtros').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      st.filtro = b.getAttribute('data-f');
      document.querySelectorAll('#filtros .chip').forEach(function (x) { x.classList.toggle('on', x === b); });
      render();
    });
    var k = $('kanban');
    k.addEventListener('click', function (e) {
      var c = e.target.closest('.pcard'); if (c) abrir(c.getAttribute('data-id'));
      var n = e.target.closest('[data-novo]'); if (n) abrir(null, n.getAttribute('data-novo'));
    });
    // Arrastar e soltar entre colunas
    k.addEventListener('dragstart', function (e) {
      var c = e.target.closest('.pcard'); if (!c) return;
      st.arrastando = c.getAttribute('data-id'); c.classList.add('arrastando');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', st.arrastando);
    });
    k.addEventListener('dragend', function (e) {
      var c = e.target.closest('.pcard'); if (c) c.classList.remove('arrastando');
      document.querySelectorAll('.coluna.alvo').forEach(function (x) { x.classList.remove('alvo'); });
    });
    k.addEventListener('dragover', function (e) {
      var col = e.target.closest('.coluna'); if (!col || !st.arrastando) return;
      e.preventDefault();
      document.querySelectorAll('.coluna').forEach(function (x) { x.classList.toggle('alvo', x === col); });
    });
    k.addEventListener('drop', function (e) {
      var col = e.target.closest('.coluna'); if (!col || !st.arrastando) return;
      e.preventDefault();
      var id = st.arrastando; st.arrastando = null;
      col.classList.remove('alvo');
      mover(id, col.getAttribute('data-col'));
    });
  }

  function porId(id) { return st.itens.filter(function (p) { return p.id === id; })[0]; }
  function emAberto(p) { return p.status !== 'entregue'; }
  function atrasado(p) { return emAberto(p) && p.entrega && M.diasAte(p.entrega) < 0; }

  // Muda o status e faz os ajustes de cada etapa.
  function mover(id, status) {
    var p = porId(id);
    if (!p || p.status === status) return;
    var upd = { status: status, atualizadoEm: Date.now() };
    if (status === 'entregue') upd.entregueEm = M.hoje();
    if (status === 'producao' && !p.progresso) upd.progresso = 10;
    if (status === 'pronto' || status === 'entregue') upd.progresso = 100;
    if (status === 'aguardando') upd.progresso = 0;
    pedidos.atualizar(id, upd).then(function () {
      var nome = COLUNAS.filter(function (c) { return c.id === status; })[0].nome;
      M.toast('Pedido ' + p.numero + ' → ' + nome + '.');
      if (status === 'pronto' && p.clienteWhats) {
        M.confirmar({ titulo: 'Avisar o cliente?', texto: 'Enviar mensagem pelo WhatsApp avisando que o pedido ' + p.numero + ' está pronto para retirada.', ok: 'Abrir WhatsApp' })
          .then(function (sim) { if (sim) avisarPronto(Object.assign({}, p, upd)); });
      }
    }).catch(M.falha('mover o pedido'));
  }

  function avisarPronto(p) {
    var e = M.config.empresa;
    M.whatsapp(p.clienteWhats, 'Olá, ' + p.clienteNome + '! Seu pedido ' + p.numero + ' (' + p.descricao + ') está pronto para retirada aqui na ' + (e.fantasia || e.nome) + '.' +
      (p.pago ? '' : '\nValor: ' + M.brl(p.valorCentavos) + '.') + '\nQualquer dúvida, é só chamar!');
  }

  /* ---------- Quadro ---------- */
  function render() {
    var abertos = st.itens.filter(emAberto);
    var atras = abertos.filter(atrasado).length;
    $('subtitulo').textContent = abertos.length + (abertos.length === 1 ? ' pedido em aberto' : ' pedidos em aberto') +
      (atras ? ' · ' + atras + ' atrasado' + (atras > 1 ? 's' : '') : '') + ' · ' + M.mesNome(M.mesAtual());

    var lista = st.itens.filter(function (p) {
      if (st.filtro === 'urgentes' && p.prioridade !== 'urgente') return false;
      if (st.filtro === 'atrasados' && !atrasado(p)) return false;
      if (st.filtro === 'hoje' && p.entrega !== M.hoje()) return false;
      return !st.busca.trim() || M.combina([p.numero, p.clienteNome, p.descricao, p.obs].join(' '), st.busca);
    });

    $('kanban').innerHTML = COLUNAS.map(function (col) {
      var cards = lista.filter(function (p) { return (p.status || 'aguardando') === col.id; });
      if (col.id === 'entregue') {
        // Entregues: mais recentes primeiro, só os últimos 30 dias (a busca mostra todos).
        cards = cards.filter(function (p) { return st.busca.trim() || !p.entregueEm || M.diasAte(p.entregueEm) >= -30; })
          .sort(function (a, b) { return (b.entregueEm || '') < (a.entregueEm || '') ? -1 : 1; });
      } else {
        var ordem = { urgente: 0, normal: 1, baixa: 2 };
        cards.sort(function (a, b) {
          if ((a.entrega || '9') !== (b.entrega || '9')) return (a.entrega || '9') < (b.entrega || '9') ? -1 : 1;
          return (ordem[a.prioridade] || 1) - (ordem[b.prioridade] || 1);
        });
      }
      var total = cards.reduce(function (a, p) { return a + (p.valorCentavos || 0); }, 0);
      return '<div class="coluna" data-col="' + col.id + '">' +
        '<div class="col-head"><span class="bolinha" style="background:' + col.cor + '"></span><span class="nome">' + col.nome + '</span><span class="qtd">' + cards.length + '</span></div>' +
        '<div class="col-total">' + (cards.length ? M.brl(total) + (col.id === 'entregue' ? ' · últimos 30 dias' : '') : '&nbsp;') + '</div>' +
        '<div class="cards">' + (cards.length ? cards.map(card).join('') :
          '<div class="col-vazia">' + (col.id === 'aguardando' ? '<button class="link-btn" data-novo="aguardando">+ Novo pedido</button>' : 'Arraste um pedido para cá') + '</div>') +
        '</div></div>';
    }).join('');
  }

  function card(p) {
    var pr = PRIO[p.prioridade] || PRIO.normal;
    var dias = p.entrega ? M.diasAte(p.entrega) : null;
    var ent = '';
    if (p.status === 'entregue') ent = '<span class="ent">Entregue em ' + M.esc(M.diaMes(p.entregueEm)) + '</span>';
    else if (dias !== null) {
      var cls = dias < 0 ? 'atraso' : dias <= 1 ? 'alerta' : '';
      var txt = dias < 0 ? '⚠ Atrasado ' + (-dias) + (dias === -1 ? ' dia' : ' dias') : dias === 0 ? '⚠ Entrega hoje' : dias === 1 ? '⚠ Amanhã' : 'Entrega: ' + M.diaMes(p.entrega);
      ent = '<span class="ent ' + cls + '">' + txt + '</span>';
    }
    var meio = '';
    if (p.status === 'producao') meio = '<div class="barra-lab"><span>Progresso</span><span>' + (p.progresso || 0) + '%</span></div><div class="barra"><div style="width:' + (p.progresso || 0) + '%"></div></div>';
    if (p.status === 'pronto') meio = '<div class="pronto-msg">✓ Pronto! Aguardando retirada</div>';
    var pag = p.status === 'entregue' || p.status === 'pronto'
      ? '<span class="tag ' + (p.pago ? 'verde' : 'amarelo') + '">' + (p.pago ? 'Pago' : 'A receber') + '</span>'
      : '<span class="prio"><i style="background:' + pr[1] + '"></i>' + pr[0] + '</span>';
    return '<div class="pcard" draggable="true" data-id="' + M.esc(p.id) + '">' +
      '<div class="top"><div class="cli">' + M.esc(p.clienteNome) + '</div><div class="num">' + M.esc(p.numero) + '</div></div>' +
      '<div class="desc">' + M.esc(p.descricao) + '</div>' + meio +
      '<div class="bot"><span class="val">' + M.brlCurto(p.valorCentavos) + '</span>' + pag + '</div>' +
      '<div class="bot" style="margin-top:6px">' + ent + '</div></div>';
  }

  /* ---------- Janela do pedido ---------- */
  function abrir(id, statusInicial) {
    var p = id ? porId(id) : null;
    if (id && !p) { M.toast('Pedido não encontrado.', 'erro'); return; }
    p = p || { status: statusInicial || 'aguardando', prioridade: 'normal', progresso: 0, pago: false, entrega: M.somarDias(M.hoje(), 7) };
    var formas = M.formasPagamento(p.forma ? [p.forma] : []);
    var j = M.janela({
      titulo: id ? 'Pedido ' + p.numero : 'Novo pedido', largura: 560,
      corpo: '<form class="pform" id="pForm" novalidate autocomplete="off">' +
        '<div class="g2"><div class="field"><label class="label" for="pCli">Cliente *</label><input class="input" id="pCli" list="listaClientes" value="' + M.esc(p.clienteNome || '') + '" placeholder="Nome do cliente…"></div>' +
        '<div class="field"><label class="label" for="pWhats">WhatsApp</label><input class="input" id="pWhats" data-mask="tel" value="' + M.esc(p.clienteWhats || '') + '" placeholder="(00) 00000-0000"></div></div>' +
        '<div class="field"><label class="label" for="pDesc">O que será produzido *</label><textarea class="input" id="pDesc" rows="2" maxlength="300" placeholder="Ex: Banner 3×2m — lona fosca">' + M.esc(p.descricao || '') + '</textarea></div>' +
        '<div class="g3"><div class="field"><label class="label" for="pValor">Valor (R$)</label><input class="input" id="pValor" inputmode="decimal" value="' + (p.valorCentavos ? M.valorCampo(p.valorCentavos) : '') + '" placeholder="0,00"></div>' +
        '<div class="field"><label class="label" for="pEntrega">Entrega</label><input class="input" id="pEntrega" type="date" value="' + M.esc(p.entrega || '') + '"></div>' +
        '<div class="field"><label class="label" for="pPrio">Prioridade</label><select class="input" id="pPrio">' +
        Object.keys(PRIO).map(function (k) { return '<option value="' + k + '"' + (p.prioridade === k ? ' selected' : '') + '>' + PRIO[k][0] + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="g2"><div class="field"><label class="label" for="pStatus">Etapa</label><select class="input" id="pStatus">' +
        COLUNAS.map(function (c) { return '<option value="' + c.id + '"' + (p.status === c.id ? ' selected' : '') + '>' + c.nome + '</option>'; }).join('') + '</select></div>' +
        '<div class="field" id="pProgWrap"><label class="label" for="pProg">Progresso</label><div class="prog-linha"><input type="range" id="pProg" min="0" max="100" step="5" value="' + (p.progresso || 0) + '"><span id="pProgV">' + (p.progresso || 0) + '%</span></div></div></div>' +
        '<div class="g2"><div class="pago-linha"><span>Pagamento recebido</span><label class="toggle"><input type="checkbox" id="pPago"' + (p.pago ? ' checked' : '') + '><span class="trilho"></span></label></div>' +
        '<div class="field"><select class="input" id="pForma"><option value="">Forma de pagamento…</option>' +
        formas.map(function (f) { return '<option' + (p.forma === f ? ' selected' : '') + '>' + M.esc(f) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="field"><label class="label" for="pObs">Observações</label><textarea class="input" id="pObs" rows="2" maxlength="1000" placeholder="Materiais, medidas, detalhes…">' + M.esc(p.obs || '') + '</textarea></div>' +
        '<div class="msg" id="pMsg"></div>' +
        '<div class="rodape"><div class="links">' +
        (id ? '<button type="button" class="link-btn" id="pRecibo">' + (p.reciboId ? 'Ver recibo' : 'Gerar recibo') + '</button>' : '') +
        (id && p.clienteWhats ? '<button type="button" class="link-btn" id="pAvisar">Avisar no WhatsApp</button>' : '') +
        (p.orcamentoId ? '<a class="link-btn" href="orcamento.html?id=' + encodeURIComponent(p.orcamentoId) + '">Ver orçamento ' + M.esc(p.orcamentoNumero || '') + '</a>' : '') +
        (id ? '<button type="button" class="link-btn danger" id="pExcluir">Excluir</button>' : '') +
        '</div><button class="btn sm" type="submit" id="pSalvar">' + (id ? 'Salvar alterações' : 'Criar pedido') + '</button></div></form>'
    });
    var el = j.el, q = function (s) { return el.querySelector(s); };
    M.campoValor(q('#pValor'));
    function progVis() { q('#pProgWrap').style.visibility = q('#pStatus').value === 'producao' ? 'visible' : 'hidden'; }
    progVis();
    q('#pStatus').onchange = progVis;
    q('#pProg').oninput = function () { q('#pProgV').textContent = this.value + '%'; };
    q('#pCli').addEventListener('change', function () {
      var c = st.clientes.filter(function (x) { return M.semAcento(x.nome) === M.semAcento(q('#pCli').value.trim()); })[0];
      if (c && !q('#pWhats').value) q('#pWhats').value = c.whatsapp || c.telefone || '';
    });
    q('#pCli').focus();

    q('#pForm').onsubmit = function (e) {
      e.preventDefault();
      var nome = q('#pCli').value.trim(), desc = q('#pDesc').value.trim(), valor = M.lerValorOuZero(q('#pValor').value);
      var m = function (t, f) { q('#pMsg').textContent = t; q('#pMsg').className = 'msg erro'; if (f) q(f).focus(); };
      if (!nome) return m('Preencha o cliente.', '#pCli');
      if (!desc) return m('Descreva o que será produzido.', '#pDesc');
      if (isNaN(valor) || valor < 0) return m('Valor inválido.', '#pValor');
      var c = st.clientes.filter(function (x) { return M.semAcento(x.nome) === M.semAcento(nome); })[0];
      var status = q('#pStatus').value;
      var d = {
        clienteNome: nome, clienteId: c ? c.id : (p.clienteId || null), clienteWhats: q('#pWhats').value.trim(),
        descricao: desc, valorCentavos: valor, entrega: q('#pEntrega').value, prioridade: q('#pPrio').value,
        status: status, progresso: status === 'producao' ? +q('#pProg').value : status === 'aguardando' ? 0 : 100,
        pago: q('#pPago').checked, forma: q('#pForma').value, obs: q('#pObs').value.trim(), atualizadoEm: Date.now()
      };
      if (status === 'entregue' && p.status !== 'entregue') d.entregueEm = M.hoje();
      // Itens: se o valor mudou e o pedido tinha um item só (ou nenhum), mantém coerente para o recibo.
      if (!p.itens || p.itens.length <= 1) { d.itens = [{ descricao: desc, qtd: 1, unitCentavos: valor }]; d.descontoCentavos = 0; }
      q('#pSalvar').disabled = true;
      var pr = id ? pedidos.atualizar(id, d) : M.proximoNumero('ped').then(function (num) { d.numero = num; d.criadoEm = Date.now(); return pedidos.adicionar(d); });
      pr.then(function (novo) {
        M.toast(id ? 'Pedido atualizado.' : 'Pedido ' + novo.numero + ' criado.');
        j.fechar();
      }).catch(function (err) { q('#pSalvar').disabled = false; m('Não foi possível salvar: ' + (err.code || err.message)); });
    };

    if (q('#pExcluir')) q('#pExcluir').onclick = function () {
      M.confirmar({ titulo: 'Excluir pedido ' + p.numero + '?', texto: p.clienteNome + ' — ' + p.descricao + '. Essa ação não pode ser desfeita.', ok: 'Excluir', perigo: true })
        .then(function (sim) {
          if (!sim) return;
          pedidos.remover(id).then(function () {
            if (p.orcamentoId) M.colecao('orcamentos').atualizar(p.orcamentoId, { pedidoId: null }).catch(function () {});
            M.toast('Pedido excluído.'); j.fechar();
          }).catch(M.falha('excluir'));
        });
    };
    if (q('#pAvisar')) q('#pAvisar').onclick = function () { avisarPronto(p); };
    if (q('#pRecibo')) q('#pRecibo').onclick = function () {
      if (p.reciboId) { location.href = 'recibos.html?id=' + encodeURIComponent(p.reciboId); return; }
      gerarRecibo(porId(id)).then(function (r) { if (r) location.href = 'recibos.html?id=' + encodeURIComponent(r.id); });
    };
  }

  function gerarRecibo(p) {
    var c = st.clientes.filter(function (x) { return x.id === p.clienteId; })[0] || {};
    var itens = p.itens && p.itens.length ? p.itens : [{ descricao: p.descricao, qtd: 1, unitCentavos: p.valorCentavos }];
    var soma = itens.reduce(function (a, i) { return a + Math.round((i.qtd || 1) * (i.unitCentavos || 0)); }, 0);
    // Se os itens somam mais que o valor do pedido, a diferença vira desconto; se somam menos, usa uma linha só.
    var desconto = soma > p.valorCentavos ? soma - p.valorCentavos : 0;
    if (soma < p.valorCentavos) itens = [{ descricao: p.descricao, qtd: 1, unitCentavos: p.valorCentavos }];
    var total = p.valorCentavos;
    var rec;
    return M.proximoNumero('rec').then(function (num) {
      rec = {
        numero: num, data: M.hoje(), clienteId: p.clienteId || null, clienteNome: p.clienteNome, clienteWhats: p.clienteWhats || '',
        clienteDoc: c.documento || '', clienteResp: c.responsavel || '', itens: itens, descontoCentavos: desconto, totalCentavos: total, forma: p.forma || 'PIX',
        status: p.pago ? 'pago' : 'pendente', dataPagamento: p.pago ? M.hoje() : '', pedidoId: p.id, pedidoNumero: p.numero,
        obs: 'Referente ao pedido ' + p.numero + (p.orcamentoNumero ? ' (orçamento ' + p.orcamentoNumero + ')' : '') + '.',
        criadoEm: Date.now(), atualizadoEm: Date.now()
      };
      return M.colecao('recibos').adicionar(rec);
    }).then(function (r) {
      rec = r;
      if (rec.status !== 'pago') return null;
      return M.lancarRecibo(rec).then(function (lid) { return M.colecao('recibos').atualizar(rec.id, { lancamentoId: lid }); });
    }).then(function () {
      return pedidos.atualizar(p.id, { reciboId: rec.id });
    }).then(function () {
      M.toast('Recibo ' + rec.numero + ' criado' + (rec.status === 'pago' ? ' e lançado no Caixa.' : '.'));
      return rec;
    }).catch(M.falha('gerar o recibo'));
  }
})();
