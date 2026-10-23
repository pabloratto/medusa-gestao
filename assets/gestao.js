/* Medusa Gestão — página Gestão (indicadores do mês). */
(function () {
  'use strict';
  var M = window.Medusa, $ = M.$;
  var st = { mes: M.mesAtual(), db: null };

  M.iniciarPagina('gestao', function () {
    var q = new URLSearchParams(location.search).get('mes');
    if (/^\d{4}-\d{2}$/.test(q || '')) st.mes = q;
    M.dados(['lancamentos', 'pedidos', 'orcamentos', 'recibos'], function (db) { st.db = db; render(); });
    renderPeriodo();
  });

  function renderPeriodo() {
    var atual = M.mesAtual();
    var meses = [M.mudarMes(atual, -2), M.mudarMes(atual, -1), atual];
    $('periodo').innerHTML = meses.map(function (m) {
      return '<button class="chip' + (m === st.mes ? ' on' : '') + '" data-m="' + m + '">' + M.mesCurto(m) + '</button>';
    }).join('') + '<input class="input" type="month" id="mesEsc" title="Personalizar período" value="' + st.mes + '">';
    $('periodo').querySelectorAll('.chip').forEach(function (b) { b.onclick = function () { mudar(b.getAttribute('data-m')); }; });
    $('mesEsc').onchange = function () { if (this.value) mudar(this.value); };
  }
  function mudar(m) { st.mes = m; history.replaceState(null, '', '?mes=' + m); renderPeriodo(); render(); }

  function delta(v, ruimSobe) {
    if (v === null) return '<span>sem comparação</span>';
    var bom = ruimSobe ? v <= 0 : v >= 0;
    return '<span class="' + (bom ? 'up' : 'down') + '">' + (v >= 0 ? '▲ ' : '▼ ') + Math.abs(v) + '%</span> vs. mês anterior';
  }

  function render() {
    var db = st.db; if (!db) return;
    var mes = st.mes, ant = M.mudarMes(mes, -1);
    $('subtitulo').textContent = 'Visão geral · ' + M.mesNome(mes);
    var lm = M.doMes(db.lancamentos, mes), la = M.doMes(db.lancamentos, ant);
    var rec = M.somaTipo(lm, 'entrada'), recA = M.somaTipo(la, 'entrada');
    var desp = M.somaTipo(lm, 'saida'), despA = M.somaTipo(la, 'saida');
    var luc = rec - desp, lucA = recA - despA;
    var peds = M.doMes(db.pedidos, mes, 'criadoEm'), pedsA = M.doMes(db.pedidos, ant, 'criadoEm');
    var ticket = peds.length ? Math.round(peds.reduce(function (a, p) { return a + (p.valorCentavos || 0); }, 0) / peds.length) : 0;
    var ticketA = pedsA.length ? Math.round(pedsA.reduce(function (a, p) { return a + (p.valorCentavos || 0); }, 0) / pedsA.length) : 0;
    var orcs = M.doMes(db.orcamentos, mes);
    var aprov = orcs.filter(function (o) { return o.status === 'aprovado'; }).length;
    var decididos = orcs.filter(function (o) { return o.status !== 'aguardando'; }).length;

    var html = '<div class="kpis">' +
      kpi('caixa.html', 'Receita bruta', M.brlCurto(rec), delta(M.variacao(rec, recA)), 'var(--success)') +
      kpi('caixa.html', 'Despesas', M.brlCurto(desp), delta(M.variacao(desp, despA), true), 'var(--danger)') +
      kpi('caixa.html', 'Lucro líquido', M.brlCurto(luc), delta(M.variacao(luc, lucA)) + (rec ? ' · margem ' + Math.round(luc / rec * 100) + '%' : ''), luc < 0 ? 'var(--danger)' : '') +
      kpi('pedidos.html', 'Ticket médio', M.brlCurto(ticket), peds.length + (peds.length === 1 ? ' pedido' : ' pedidos') + ' · ' + delta(M.variacao(ticket, ticketA)).replace(' vs. mês anterior', ''), '') +
      kpi('orcamento.html', 'Orçamentos', orcs.length + (orcs.length === 1 ? ' enviado' : ' enviados'),
        decididos ? Math.round(aprov / decididos * 100) + '% aprovados (' + aprov + ' de ' + decididos + ')' : (orcs.length ? 'aguardando resposta' : 'nenhum no mês'), '') +
      '</div>';

    html += '<div class="linha2">' + grafico(lm, mes) + meta(rec, mes) + '</div>';
    html += '<div class="linha3">' + ranking(peds) + movimentos(db.lancamentos) +
      '<div class="card-box"><div class="ct">Alertas</div>' + M.alertasHTML(M.alertas(db)) + '</div></div>';
    $('corpo').innerHTML = html;
  }

  function kpi(href, rot, val, sub, cor) {
    return '<a class="kpi" href="' + href + '"><div class="label">' + rot + '</div><div class="v"' + (cor ? ' style="color:' + cor + '"' : '') + '>' + val + '</div><div class="d">' + sub + '</div></a>';
  }

  function grafico(lm, mes) {
    var p = mes.split('-'), dias = new Date(+p[0], +p[1], 0).getDate();
    var nSem = Math.ceil(dias / 7);
    var sem = []; for (var i = 0; i < nSem; i++) sem.push({ r: 0, d: 0 });
    lm.forEach(function (l) {
      var dia = +String(l.data).slice(8, 10) || 1, k = Math.min(nSem - 1, Math.floor((dia - 1) / 7));
      if (l.tipo === 'entrada') sem[k].r += l.valorCentavos || 0; else sem[k].d += l.valorCentavos || 0;
    });
    var max = Math.max.apply(null, sem.map(function (s) { return Math.max(s.r, s.d); }).concat([1]));
    var semAtual = mes === M.mesAtual() ? Math.min(nSem - 1, Math.floor((new Date().getDate() - 1) / 7)) : -1;
    var total = sem.reduce(function (a, s) { return a + s.r; }, 0);
    function k(v) { return v >= 100000 ? 'R$' + (v / 100000).toFixed(1).replace('.', ',') + 'k' : 'R$' + Math.round(v / 100); }
    return '<div class="card-box"><div class="ct">Faturamento semanal<span class="sub">' + M.mesNome(mes) + '</span>' +
      '<span class="legenda" style="margin-left:16px"><span><i style="background:var(--accent)"></i>Receita</span><span><i style="background:rgba(255,107,107,.6)"></i>Despesa</span></span></div>' +
      '<div class="grafico">' + sem.map(function (s) {
        return '<div class="sem"><div class="vlab">' + (s.r ? k(s.r) : '') + '</div><div class="barras">' +
          '<div class="b r" style="height:' + (s.r / max * 100) + '%" data-v="Receita ' + M.brl(s.r) + '"></div>' +
          '<div class="b d" style="height:' + (s.d / max * 100) + '%" data-v="Despesa ' + M.brl(s.d) + '"></div></div></div>';
      }).join('') + '</div>' +
      '<div class="sem-nomes">' + sem.map(function (s, i) { return '<div class="' + (i === semAtual ? 'atual' : '') + '">Sem ' + (i + 1) + '</div>'; }).join('') + '</div>' +
      '<div class="rodape-g"><span>Total do mês: <b style="color:var(--fg)">' + M.brl(total) + '</b></span><span>Média semanal: ' + M.brl(Math.round(total / nSem)) + '</span></div></div>';
  }

  function meta(rec, mes) {
    var alvo = M.config.metas.faturamentoCentavos || 0;
    if (!alvo) return '<div class="card-box"><div class="ct">Meta do mês</div><div class="vazio" style="padding:30px 10px">Defina a meta de faturamento em <a href="configuracoes.html#empresa" style="color:var(--accent)">Configurações</a>.</div></div>';
    var pct = Math.min(100, Math.round(rec / alvo * 100)), r = 58, c = 2 * Math.PI * r;
    var cor = pct >= 100 ? 'var(--success)' : 'var(--accent)';
    return '<div class="card-box"><div class="ct">Meta do mês<span class="sub">' + M.mesNome(mes) + '</span></div>' +
      '<div class="meta-anel"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="' + r + '" fill="none" stroke="#262626" stroke-width="12"/>' +
      (pct < 3 ? '' : '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="' + cor + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - pct / 100)) + '" transform="rotate(-90 75 75)"/>') + '</svg>' +
      '<div class="centro"><div class="pct" style="color:' + cor + '">' + Math.round(rec / alvo * 100) + '%</div><div class="pl">da meta</div></div></div>' +
      '<div class="meta-linhas"><div><span>Realizado</span><b>' + M.brl(rec) + '</b></div><div><span>Meta</span><b>' + M.brl(alvo) + '</b></div>' +
      '<div><span>' + (rec >= alvo ? 'Superou em' : 'Faltam') + '</span><b style="color:' + (rec >= alvo ? 'var(--success)' : 'var(--fg)') + '">' + M.brl(Math.abs(alvo - rec)) + '</b></div></div></div>';
  }

  function ranking(peds) {
    var mapa = {};
    peds.forEach(function (p) {
      var itens = p.itens && p.itens.length ? p.itens : [{ descricao: p.descricao, qtd: 1, unitCentavos: p.valorCentavos }];
      itens.forEach(function (i) {
        var nome = String(i.descricao || '—').trim(), k = M.semAcento(nome);
        mapa[k] = mapa[k] || { nome: nome, v: 0, n: 0 };
        mapa[k].v += Math.round((i.qtd || 1) * (i.unitCentavos || 0)); mapa[k].n += 1;
      });
    });
    var top = Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 5);
    var max = top.length ? top[0].v || 1 : 1;
    return '<div class="card-box"><div class="ct">Serviços mais vendidos<span class="sub">pedidos do mês</span></div>' +
      (top.length ? top.map(function (t, i) {
        return '<div class="rank"><div class="pos">' + (i + 1) + '</div><div class="rn"><div class="rt">' + M.esc(t.nome) + '</div><div class="rb"><div style="width:' + (t.v / max * 100) + '%"></div></div></div>' +
          '<div class="rv"><b>' + M.brlCurto(t.v) + '</b><span>' + t.n + (t.n === 1 ? ' pedido' : ' pedidos') + '</span></div></div>';
      }).join('') : '<div class="vazio" style="padding:24px 8px">Nenhum pedido neste mês.</div>') + '</div>';
  }

  function movimentos(lancs) {
    var ult = lancs.slice().sort(function (a, b) {
      if ((a.data || '') !== (b.data || '')) return (a.data || '') < (b.data || '') ? 1 : -1;
      return (b.criadoEm || 0) - (a.criadoEm || 0);
    }).slice(0, 6);
    return '<div class="card-box"><div class="ct">Últimas movimentações</div><div>' +
      (ult.length ? ult.map(function (l) {
        var e = l.tipo === 'entrada';
        return '<a class="mov" href="' + (l.reciboId ? 'recibos.html?id=' + encodeURIComponent(l.reciboId) : 'caixa.html') + '">' +
          '<div class="mi" style="background:' + (e ? 'var(--success-dim)' : 'var(--danger-dim)') + ';color:' + (e ? 'var(--success)' : 'var(--danger)') + '">' + (e ? '↑' : '↓') + '</div>' +
          '<div style="min-width:0"><div class="mt">' + M.esc(l.descricao) + '</div><div class="ms">' + M.esc(M.dataCurta(l.data)) + ' · ' + M.esc(l.categoria || '') + '</div></div>' +
          '<div class="mv" style="color:' + (e ? 'var(--success)' : 'var(--danger)') + '">' + (e ? '+' : '−') + M.brlCurto(l.valorCentavos) + '</div></a>';
      }).join('') : '<div class="vazio" style="padding:24px 8px">Nenhuma movimentação ainda.</div>') +
      '</div><a class="ver-todas" href="caixa.html">Ver todas as movimentações →</a></div>';
  }
})();
