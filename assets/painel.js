/* Medusa Gestão — cálculos compartilhados por Dashboard e Gestão. */
(function () {
  'use strict';
  var M = window.Medusa;

  // Acompanha várias coleções e chama cb(db) quando todas carregarem e a cada mudança.
  M.dados = function (nomes, cb) {
    var db = {}, prontas = 0, t = null;
    nomes.forEach(function (n) {
      var primeira = true;
      M.colecao(n).observar(function (lista) {
        db[n] = lista;
        if (primeira) { primeira = false; prontas++; }
        if (prontas === nomes.length) { clearTimeout(t); t = setTimeout(function () { cb(db); }, 30); }
      });
    });
  };

  M.somaTipo = function (lancs, tipo) {
    return lancs.reduce(function (a, l) { return a + (l.tipo === tipo ? (l.valorCentavos || 0) : 0); }, 0);
  };
  M.doMes = function (lista, ym, campo) {
    campo = campo || 'data';
    return lista.filter(function (x) {
      var v = x[campo];
      if (typeof v === 'number') v = M.isoDeTimestamp(v);
      return String(v || '').slice(0, 7) === ym;
    });
  };
  // Variação percentual (null quando não dá para comparar).
  M.variacao = function (atual, antes) {
    if (!antes) return null;
    return Math.round((atual - antes) / Math.abs(antes) * 100);
  };

  M.saldoCaixa = function (lancs) {
    return (M.config.caixa.saldoInicialCentavos || 0) + M.somaTipo(lancs, 'entrada') - M.somaTipo(lancs, 'saida');
  };

  // Lista de alertas: [{cor, titulo, texto, href}]
  M.alertas = function (db) {
    var l = [], hoje = M.hoje();
    var atrasados = (db.pedidos || []).filter(function (p) { return p.status !== 'entregue' && p.entrega && p.entrega < hoje; });
    if (atrasados.length) l.push({ cor: 'vermelho', titulo: atrasados.length + (atrasados.length > 1 ? ' pedidos atrasados' : ' pedido atrasado'),
      texto: atrasados.slice(0, 3).map(function (p) { return p.clienteNome; }).join(', ') + ' — prazo vencido', href: 'pedidos.html' });
    var hojeP = (db.pedidos || []).filter(function (p) { return p.status !== 'entregue' && p.status !== 'pronto' && p.entrega === hoje; });
    if (hojeP.length) l.push({ cor: 'amarelo', titulo: hojeP.length + (hojeP.length > 1 ? ' entregas hoje' : ' entrega hoje'),
      texto: hojeP.slice(0, 3).map(function (p) { return p.clienteNome + ' (' + p.numero + ')'; }).join(', '), href: 'pedidos.html' });
    var semResp = (db.orcamentos || []).filter(function (o) { return o.status === 'aguardando' && o.criadoEm && (Date.now() - o.criadoEm) > 3 * 86400000; });
    if (semResp.length) l.push({ cor: 'amarelo', titulo: semResp.length + (semResp.length > 1 ? ' orçamentos sem resposta' : ' orçamento sem resposta'),
      texto: 'Aguardando há mais de 3 dias — faça o follow-up', href: 'orcamento.html' });
    var receber = (db.recibos || []).filter(function (r) { return r.status !== 'pago'; });
    if (receber.length) l.push({ cor: 'azul', titulo: receber.length + (receber.length > 1 ? ' recibos a receber' : ' recibo a receber'),
      texto: M.brl(receber.reduce(function (a, r) { return a + (r.totalCentavos || 0); }, 0)) + ' em aberto', href: 'recibos.html' });
    var meta = M.config.metas.faturamentoCentavos;
    if (meta) {
      var ym = M.mesAtual(), ent = M.somaTipo(M.doMes(db.lancamentos || [], ym), 'entrada');
      var d = new Date(), fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), resta = fim - d.getDate() + 1;
      if (ent < meta) l.push({ cor: 'azul', titulo: 'Meta: faltam ' + resta + (resta > 1 ? ' dias' : ' dia'),
        texto: 'Precisa de ' + M.brlCurto(Math.ceil((meta - ent) / resta)) + '/dia para bater ' + M.brlCurto(meta), href: 'gestao.html' });
      else l.push({ cor: 'verde', titulo: 'Meta do mês batida! 🎉', texto: M.brlCurto(ent) + ' de ' + M.brlCurto(meta), href: 'gestao.html' });
    }
    return l;
  };

  M.alertasHTML = function (alertas) {
    var cores = { vermelho: ['#FF6B6B', 'rgba(255,107,107,'], amarelo: ['#FFA726', 'rgba(255,167,38,'], azul: ['#29B6F6', 'rgba(41,182,246,'], verde: ['#66BB6A', 'rgba(102,187,106,'] };
    if (!alertas.length) return '<div class="vazio" style="padding:24px 8px">Tudo em dia. Nenhum alerta.</div>';
    return alertas.map(function (a) {
      var c = cores[a.cor] || cores.azul;
      return '<a class="alerta" href="' + a.href + '" style="background:' + c[1] + '.06);border:1px solid ' + c[1] + '.18);">' +
        '<span style="color:' + c[0] + '">' + M.icone('alerta') + '</span><div><div class="at" style="color:' + c[0] + '">' + M.esc(a.titulo) + '</div>' +
        '<div class="ax">' + M.esc(a.texto) + '</div></div></a>';
    }).join('');
  };
})();
