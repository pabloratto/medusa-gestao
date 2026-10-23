/* Medusa Gestão — Dashboard (página inicial). */
(function () {
  'use strict';
  var M = window.Medusa, $ = M.$;
  var st = { db: null };

  M.iniciarPagina('dashboard', function () {
    var h = new Date().getHours();
    var saud = h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
    var nome = (M.config.empresa.responsavel || '').split(' ')[0] || M.config.empresa.fantasia || M.config.empresa.nome || '';
    $('ola').textContent = saud + (nome ? ', ' + nome : '') + ' 👋';
    $('hojeTxt').textContent = M.dataExtenso(M.hoje());
    M.dados(['lancamentos', 'orcamentos', 'pedidos', 'recibos', 'clientes', 'catalogo'], function (db) { st.db = db; render(); });
    iniciarBusca();
    $('sino').onclick = function (e) { e.stopPropagation(); $('popAlertas').hidden = !$('popAlertas').hidden; $('resultados').hidden = true; };
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.sino-wrap')) $('popAlertas').hidden = true;
      if (!e.target.closest('.busca-g')) $('resultados').hidden = true;
    });
  });

  function render() {
    var db = st.db, mes = M.mesAtual();
    var lm = M.doMes(db.lancamentos, mes);
    var ent = M.somaTipo(lm, 'entrada'), sai = M.somaTipo(lm, 'saida');
    var saldo = M.saldoCaixa(db.lancamentos);
    var recMes = M.doMes(db.recibos, mes).length;
    var saidasN = lm.filter(function (l) { return l.tipo === 'saida'; }).length;
    var hoje = M.hoje();
    var abertos = db.orcamentos.filter(function (o) { return o.status === 'aguardando' && !(o.validade && o.validade < hoje); });
    var valorAberto = abertos.reduce(function (a, o) { return a + (o.totalCentavos || 0); }, 0);
    var ab = M.mesAbrev(mes).replace('.', '');
    ab = ab.charAt(0).toUpperCase() + ab.slice(1) + '.';

    var alertas = M.alertas(db);
    var importantes = alertas.filter(function (a) { return a.cor === 'vermelho' || a.cor === 'amarelo'; }).length;
    $('bolha').hidden = !importantes; $('bolha').textContent = importantes;
    $('popAlertas').innerHTML = '<div class="sec-tit" style="margin-bottom:8px">Alertas</div>' + M.alertasHTML(alertas);

    var html = '<div class="stats">' +
      stat('caixa.html', 'Saldo do Caixa', M.brl(saldo), saldo < 0 ? 'var(--danger)' : 'var(--success)', (ent - sai >= 0 ? '↑ +' : '↓ ') + M.brlCurto(ent - sai) + ' este mês') +
      stat('caixa.html', 'Entradas — ' + ab, M.brl(ent), 'var(--success)', recMes + (recMes === 1 ? ' recibo emitido' : ' recibos emitidos')) +
      stat('caixa.html', 'Saídas — ' + ab, M.brl(sai), '', saidasN + (saidasN === 1 ? ' lançamento' : ' lançamentos')) +
      stat('orcamento.html', 'Orçamentos ativos', String(abertos.length), '', abertos.length ? M.brlCurto(valorAberto) + ' aguardando aprovação' : 'nenhum aguardando resposta') +
      '</div>';

    html += '<div class="linha"><div><div class="sec-tit">Acesso rápido</div><div class="atalhos">' +
      atalho('caixa.html', 'caixa', 'Caixa', 'Entradas e saídas', '#AADC00', 'linear-gradient(135deg,#1a2a00 0%,#0d1800 100%)', 'rgba(170,220,0,.15)') +
      atalho('orcamento.html', 'orcamento', 'Orçamento', 'Criar e gerenciar', '#FFD60A', 'linear-gradient(135deg,#1a1500 0%,#0d0c00 100%)', 'rgba(255,210,0,.12)') +
      atalho('recibos.html', 'recibos', 'Recibos', 'Emitir e exportar', '#00C8C8', 'linear-gradient(135deg,#001a1a 0%,#000d0d 100%)', 'rgba(0,200,200,.12)') +
      atalho('clientes.html', 'clientes', 'Clientes', 'Contatos e CRM', '#C77DFF', 'linear-gradient(135deg,#17001a 0%,#0c000d 100%)', 'rgba(180,0,220,.15)') +
      atalho('pedidos.html', 'pedidos', 'Pedidos', 'Produção e entregas', '#29B6F6', 'linear-gradient(135deg,#001522 0%,#000b12 100%)', 'rgba(41,182,246,.15)') +
      atalho('catalogo.html', 'catalogo', 'Catálogo', 'Serviços e preços', '#FFA726', 'linear-gradient(135deg,#1f1200 0%,#100900 100%)', 'rgba(255,167,38,.15)') +
      '</div><div class="sec-tit" style="margin-top:18px">Próximas entregas</div><div class="box">' + entregas(db.pedidos) + '</div></div>' +
      '<div><div class="sec-tit">Atividade recente</div><div class="box">' + atividade(db) + '</div></div></div>';
    $('corpo').innerHTML = html;
  }

  function stat(href, rot, v, cor, sub) {
    return '<a class="stat" href="' + href + '"><div class="label">' + rot + '</div><div class="v"' + (cor ? ' style="color:' + cor + '"' : '') + '>' + v + '</div><div class="s">' + sub + '</div></a>';
  }

  function atalho(href, ic, nome, desc, cor, fundo, borda) {
    return '<a class="atalho" href="' + href + '" style="background:' + fundo + ';border:1px solid ' + borda + '">' +
      '<div class="ic" style="background:' + borda + ';color:' + cor + '">' + M.icone(ic) + '</div><div><div class="n">' + nome + '</div><div class="d">' + desc + '</div></div></a>';
  }

  function entregas(pedidos) {
    var l = pedidos.filter(function (p) { return p.status !== 'entregue' && p.entrega; })
      .sort(function (a, b) { return a.entrega < b.entrega ? -1 : 1; }).slice(0, 4);
    if (!l.length) return '<div class="vazio" style="padding:20px 8px">Nenhuma entrega pendente.</div>';
    var MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return l.map(function (p) {
      var d = M.diasAte(p.entrega), dt = M.paraData(p.entrega);
      var quando = d < 0 ? '<span style="color:var(--danger);font-weight:700">atrasado</span>' : d === 0 ? '<span style="color:#FFA726;font-weight:700">hoje</span>' : d === 1 ? 'amanhã' : 'em ' + d + ' dias';
      var etapa = { aguardando: 'Aguardando', producao: 'Em produção', pronto: 'Pronto' }[p.status] || '';
      return '<a class="entrega" href="pedidos.html?id=' + encodeURIComponent(p.id) + '"><div class="dia"><b>' + dt.getDate() + '</b><span>' + MES[dt.getMonth()] + '</span></div>' +
        '<div style="min-width:0;flex:1"><div class="et">' + M.esc(p.clienteNome) + ' <span style="color:var(--fg-dim);font-weight:500;font-size:11px">' + M.esc(p.numero) + '</span></div>' +
        '<div class="es">' + M.esc(p.descricao) + '</div></div><div style="text-align:right;font-size:11px;color:var(--fg-dim)">' + quando + '<br>' + etapa + '</div></a>';
    }).join('');
  }

  function atividade(db) {
    var ev = [];
    db.lancamentos.forEach(function (l) {
      if (l.reciboId) return; // aparece pelo recibo
      var e = l.tipo === 'entrada';
      ev.push({ t: l.criadoEm, cor: e ? '#66BB6A' : '#FF6B6B', v: (e ? '+' : '-') + M.brlCurto(l.valorCentavos), titulo: l.descricao, sub: (e ? 'Entrada' : 'Saída') + ' · ' + M.quando(l.criadoEm), href: 'caixa.html' });
    });
    db.recibos.forEach(function (r) {
      ev.push({ t: r.criadoEm, cor: r.status === 'pago' ? '#66BB6A' : '#FFA726', v: (r.status === 'pago' ? '+' : '') + M.brlCurto(r.totalCentavos), titulo: 'Recibo ' + r.numero + ' — ' + r.clienteNome,
        sub: (r.status === 'pago' ? 'Entrada' : 'A receber') + ' · ' + M.quando(r.criadoEm), href: 'recibos.html?id=' + encodeURIComponent(r.id) });
    });
    db.orcamentos.forEach(function (o) {
      var st = { aguardando: 'enviado', aprovado: 'aprovado', recusado: 'recusado' }[o.status] || '';
      var t = o.statusEm || o.criadoEm;
      ev.push({ t: t, cor: o.status === 'recusado' ? '#FF6B6B' : '#AADC00', v: M.brlCurto(o.totalCentavos), titulo: 'Orç. ' + o.numero + ' ' + st + ' — ' + o.clienteNome,
        sub: 'Orçamento · ' + M.quando(t), href: 'orcamento.html?id=' + encodeURIComponent(o.id) });
    });
    db.pedidos.forEach(function (p) {
      ev.push({ t: p.criadoEm, cor: '#29B6F6', v: M.brlCurto(p.valorCentavos), titulo: 'Pedido ' + p.numero + ' — ' + p.clienteNome, sub: 'Pedido · ' + M.quando(p.criadoEm), href: 'pedidos.html?id=' + encodeURIComponent(p.id) });
    });
    db.clientes.forEach(function (c) {
      ev.push({ t: c.criadoEm, cor: '#C77DFF', v: '', titulo: 'Novo cliente: ' + c.nome, sub: 'Cliente · ' + M.quando(c.criadoEm), href: 'clientes.html?id=' + encodeURIComponent(c.id) });
    });
    ev = ev.filter(function (e) { return e.t; }).sort(function (a, b) { return b.t - a.t; }).slice(0, 8);
    if (!ev.length) return '<div class="vazio" style="padding:30px 8px"><strong>Nada por aqui ainda</strong>Comece cadastrando um cliente ou registrando uma entrada no Caixa.</div>';
    return ev.map(function (e) {
      return '<a class="ativ" href="' + e.href + '"><div class="dot" style="background:' + e.cor + '"></div><div class="av" style="color:' + e.cor + '">' + M.esc(e.v) + '</div>' +
        '<div style="min-width:0;flex:1"><div class="at">' + M.esc(e.titulo) + '</div><div class="as">' + M.esc(e.sub) + '</div></div></a>';
    }).join('');
  }

  /* ---------- Busca geral ---------- */
  function iniciarBusca() {
    var inp = $('busca'), box = $('resultados'), foco = -1;
    inp.addEventListener('input', function () { foco = -1; buscar(inp.value); });
    inp.addEventListener('focus', function () { if (inp.value.trim()) buscar(inp.value); });
    inp.addEventListener('keydown', function (e) {
      var itens = box.querySelectorAll('.res-item');
      if (e.key === 'Escape') { box.hidden = true; inp.blur(); return; }
      if (!itens.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        foco = (foco + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
        itens.forEach(function (x, i) { x.classList.toggle('foco', i === foco); });
        itens[foco].scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') { e.preventDefault(); location.href = itens[Math.max(0, foco)].getAttribute('href'); }
    });
  }

  function buscar(q) {
    var box = $('resultados');
    if (!q.trim() || !st.db) { box.hidden = true; return; }
    var db = st.db, grupos = [];
    function grupo(nome, lista, texto, linha) {
      var r = lista.filter(function (x) { return M.combina(texto(x), q); }).slice(0, 5);
      if (r.length) grupos.push('<div class="res-grupo">' + nome + '</div>' + r.map(linha).join(''));
    }
    function item(href, a, b) { return '<a class="res-item" href="' + href + '"><span>' + M.esc(a) + '</span><span>' + M.esc(b) + '</span></a>'; }
    grupo('Clientes', db.clientes, function (c) { return [c.nome, c.responsavel, c.documento, c.whatsapp, c.email].join(' '); },
      function (c) { return item('clientes.html?id=' + encodeURIComponent(c.id), c.nome, c.whatsapp || c.cidade || ''); });
    grupo('Orçamentos', db.orcamentos, function (o) { return [o.numero, o.clienteNome, (o.itens || []).map(function (i) { return i.descricao; }).join(' ')].join(' '); },
      function (o) { return item('orcamento.html?id=' + encodeURIComponent(o.id), o.numero + ' — ' + o.clienteNome, M.brlCurto(o.totalCentavos)); });
    grupo('Pedidos', db.pedidos, function (p) { return [p.numero, p.clienteNome, p.descricao].join(' '); },
      function (p) { return item('pedidos.html?id=' + encodeURIComponent(p.id), p.numero + ' — ' + p.clienteNome, M.brlCurto(p.valorCentavos)); });
    grupo('Recibos', db.recibos, function (r) { return [r.numero, r.clienteNome, (r.itens || []).map(function (i) { return i.descricao; }).join(' ')].join(' '); },
      function (r) { return item('recibos.html?id=' + encodeURIComponent(r.id), r.numero + ' — ' + r.clienteNome, M.brlCurto(r.totalCentavos)); });
    grupo('Catálogo', db.catalogo, function (c) { return [c.nome, c.categoria].join(' '); },
      function (c) { return item('catalogo.html', c.nome, M.brl(c.vendaCentavos)); });
    grupo('Caixa', db.lancamentos, function (l) { return [l.descricao, l.categoria].join(' '); },
      function (l) { return item('caixa.html', l.descricao, (l.tipo === 'entrada' ? '+' : '-') + M.brlCurto(l.valorCentavos) + ' · ' + M.dataCurta(l.data)); });
    box.innerHTML = grupos.length ? grupos.join('') : '<div class="res-grupo" style="padding:12px 10px">Nada encontrado para "' + M.esc(q) + '"</div>';
    box.hidden = false;
    $('popAlertas').hidden = true;
  }
})();
