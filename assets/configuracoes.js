/* Medusa Gestão — página Configurações. */
(function () {
  'use strict';
  var M = window.Medusa, $ = M.$;
  var ABAS = {
    empresa: ['Empresa', 'Dados e identidade da empresa'],
    documentos: ['Documentos', 'Numeração e textos padrão'],
    pagamentos: ['Pagamentos', 'Métodos aceitos e dados bancários'],
    caixa: ['Caixa', 'Saldo inicial e categorias'],
    seguranca: ['Conta e segurança', 'Senha e backup dos dados']
  };
  var COLECOES = ['lancamentos', 'clientes', 'catalogo', 'orcamentos', 'pedidos', 'recibos', 'config'];
  var st = { logo: '', sujo: false };

  M.iniciarPagina('configuracoes', function () {
    preencher();
    iniciar();
    var aba = (location.hash || '').slice(1);
    if (ABAS[aba]) mostrarAba(aba);
  });

  function campos() { return document.querySelectorAll('#form [data-k]'); }
  function ler(caminho) { return caminho.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, M.config); }

  function preencher() {
    campos().forEach(function (el) {
      var v = ler(el.getAttribute('data-k')), tipo = el.getAttribute('data-tipo');
      if (el.type === 'checkbox') el.checked = !!v;
      else if (tipo === 'valor') el.value = v ? M.valorCampo(v) : '';
      else if (tipo === 'lista') el.value = (v || []).join('\n');
      else el.value = v == null ? '' : v;
    });
    st.logo = M.config.empresa.logo || '';
    logoPrev();
    var u = M.usuario || {};
    $('contaIni').textContent = (u.email || '?').charAt(0).toUpperCase();
    $('contaEmail').textContent = u.email || '';
    $('contaModo').textContent = M.modoDemo ? 'Modo demonstração — dados só neste navegador' : 'Conectado ao Firebase · UID: ' + (u.uid || '');
    marcarSalvo(true);
  }

  function logoPrev() {
    $('logoPrev').innerHTML = st.logo ? '<img src="' + M.esc(st.logo) + '" alt="Logo">' : '<div class="logo">' + M.esc(($('e_nome').value || 'M').charAt(0).toUpperCase()) + '</div>';
    $('logoRemover').disabled = !st.logo;
  }

  function marcarSalvo(salvo) {
    st.sujo = !salvo;
    $('topSalvar').textContent = salvo ? 'Tudo salvo' : 'Salvar alterações';
    $('topSalvar').classList.toggle('salvo', salvo);
  }

  function mostrarAba(id) {
    document.querySelectorAll('.aba').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-aba') === id); });
    document.querySelectorAll('.painel-aba').forEach(function (p) { p.classList.toggle('on', p.id === 'aba-' + id); });
    $('tTitulo').textContent = ABAS[id][0]; $('tSub').textContent = ABAS[id][1];
    $('topSalvar').style.visibility = id === 'seguranca' ? 'hidden' : 'visible';
    history.replaceState(null, '', '#' + id);
  }

  function iniciar() {
    M.aplicarMascaras();
    $('abas').addEventListener('click', function (e) { var b = e.target.closest('.aba'); if (b) mostrarAba(b.getAttribute('data-aba')); });
    $('form').addEventListener('input', function (e) { if (e.target.closest('[data-k]')) marcarSalvo(false); });
    $('form').addEventListener('change', function (e) { if (e.target.closest('[data-k]')) marcarSalvo(false); });
    $('form').addEventListener('focusout', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-tipo') === 'valor') { var c = M.lerValor(e.target.value.replace('-', '')); if (!isNaN(c)) e.target.value = (e.target.value.trim().charAt(0) === '-' ? '-' : '') + M.valorCampo(c); }
    });
    $('form').onsubmit = function (e) { e.preventDefault(); salvar(); };
    $('topSalvar').onclick = salvar;
    document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); salvar(); } });
    window.addEventListener('beforeunload', function (e) { if (st.sujo) { e.preventDefault(); e.returnValue = ''; } });

    $('logoTrocar').onclick = function () { $('logoArquivo').click(); };
    $('logoRemover').onclick = function () { st.logo = ''; logoPrev(); marcarSalvo(false); };
    $('logoArquivo').onchange = function () { var f = this.files[0]; this.value = ''; if (f) carregarLogo(f); };
    $('e_nome').addEventListener('input', function () { if (!st.logo) logoPrev(); });

    $('btnSenha').onclick = trocarSenha;
    $('btnSairConta').onclick = function () { M.confirmar({ titulo: 'Sair do sistema?', ok: 'Sair' }).then(function (s) { if (s) M.sair(); }); };
    $('btnBackup').onclick = backup;
    $('btnRestaurar').onclick = function () { $('arqRestaurar').click(); };
    $('arqRestaurar').onchange = function () { var f = this.files[0]; this.value = ''; if (f) restaurar(f); };
  }

  // Reduz a imagem para no máximo 320px e guarda como texto (data URL) nas configurações.
  function carregarLogo(arquivo) {
    if (arquivo.size > 5 * 1024 * 1024) { M.toast('Imagem muito grande (máx. 5 MB).', 'erro'); return; }
    var leitor = new FileReader();
    leitor.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 320, w = img.naturalWidth || max, h = img.naturalHeight || max;
        var esc = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * esc); cv.height = Math.round(h * esc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        st.logo = cv.toDataURL('image/png');
        if (st.logo.length > 600000) st.logo = cv.toDataURL('image/jpeg', 0.85);
        logoPrev(); marcarSalvo(false);
        M.toast('Logo carregada. Clique em Salvar alterações.');
      };
      img.onerror = function () { M.toast('Não foi possível ler essa imagem.', 'erro'); };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  }

  function salvar() {
    var dados = {}, erro = null;
    campos().forEach(function (el) {
      var k = el.getAttribute('data-k'), tipo = el.getAttribute('data-tipo'), v;
      if (el.type === 'checkbox') v = el.checked;
      else if (tipo === 'valor') {
        var neg = el.value.trim().charAt(0) === '-';
        v = M.lerValorOuZero(el.value.replace('-', ''));
        if (isNaN(v)) { erro = erro || [el, 'Valor inválido.']; v = 0; }
        if (neg && el.getAttribute('data-neg')) v = -v;
      } else if (tipo === 'int') {
        v = el.value.trim() === '' ? 0 : parseInt(el.value, 10);
        if (isNaN(v) || v < 0) { erro = erro || [el, 'Use apenas números.']; v = 0; }
      } else if (tipo === 'lista') {
        v = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!v.length) { erro = erro || [el, 'Deixe pelo menos uma categoria.']; }
      } else v = el.value.trim();
      var p = k.split('.');
      dados[p[0]] = dados[p[0]] || {};
      dados[p[0]][p[1]] = v;
    });
    ['orcProximo', 'recProximo', 'pedProximo'].forEach(function (k) { if (dados.docs[k] < 1) dados.docs[k] = 1; });
    if (erro) {
      var aba = erro[0].closest('.painel-aba').id.replace('aba-', '');
      mostrarAba(aba); erro[0].focus(); erro[0].classList.add('erro');
      setTimeout(function () { erro[0].classList.remove('erro'); }, 2500);
      M.toast(erro[1], 'erro'); return;
    }
    if (!dados.empresa.nome) { mostrarAba('empresa'); $('e_nome').focus(); M.toast('Preencha o nome da empresa.', 'erro'); return; }
    dados.empresa.logo = st.logo;
    $('topSalvar').disabled = true;
    M.salvarConfig(dados).then(function () {
      M.toast('Configurações salvas.');
      marcarSalvo(true);
      M.montarMenu('configuracoes');
    }).catch(M.falha('salvar')).then(function () { $('topSalvar').disabled = false; });
  }

  function trocarSenha() {
    var a = $('s_atual').value, n = $('s_nova').value, c = $('s_conf').value;
    var m = function (t, tipo) { $('sMsg').textContent = t; $('sMsg').className = 'msg ' + (tipo || 'erro'); };
    if (M.modoDemo) return m('No modo demonstração não há senha. Configure o Firebase primeiro.');
    if (!a) return m('Digite a senha atual.');
    if (n.length < 8) return m('A nova senha precisa de pelo menos 8 caracteres.');
    if (n !== c) return m('A confirmação não confere com a nova senha.');
    $('btnSenha').disabled = true;
    M.trocarSenha(a, n).then(function () {
      m('Senha atualizada!', 'ok');
      $('s_atual').value = $('s_nova').value = $('s_conf').value = '';
    }).catch(function (err) { m(M.erroLogin(err)); }).then(function () { $('btnSenha').disabled = false; });
  }

  function backup() {
    $('bMsg').textContent = 'Preparando…'; $('bMsg').className = 'msg';
    Promise.all(COLECOES.map(function (c) { return M.colecao(c).listar(); })).then(function (res) {
      var dados = { app: 'medusa-gestao', versao: 1, geradoEm: new Date().toISOString(), colecoes: {} };
      var total = 0;
      COLECOES.forEach(function (c, i) { dados.colecoes[c] = res[i]; total += res[i].length; });
      var blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'medusa-backup-' + M.hoje() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      $('bMsg').textContent = 'Backup baixado (' + total + ' registros).'; $('bMsg').className = 'msg ok';
    }).catch(function (err) { $('bMsg').textContent = 'Erro: ' + (err.code || err.message); $('bMsg').className = 'msg erro'; });
  }

  function restaurar(arquivo) {
    var leitor = new FileReader();
    leitor.onload = function () {
      var dados;
      try { dados = JSON.parse(leitor.result); } catch (e) { M.toast('Arquivo inválido.', 'erro'); return; }
      if (!dados || dados.app !== 'medusa-gestao' || !dados.colecoes) { M.toast('Esse arquivo não é um backup do Medusa Gestão.', 'erro'); return; }
      var total = 0; Object.keys(dados.colecoes).forEach(function (c) { total += (dados.colecoes[c] || []).length; });
      M.confirmar({ titulo: 'Restaurar backup?', texto: 'Serão gravados ' + total + ' registros de ' + (dados.geradoEm || '').slice(0, 10) + '. Registros com o mesmo código serão substituídos; os outros continuam.', ok: 'Restaurar' })
        .then(function (sim) {
          if (!sim) return;
          $('bMsg').textContent = 'Restaurando…'; $('bMsg').className = 'msg';
          var tarefas = [];
          COLECOES.forEach(function (c) {
            (dados.colecoes[c] || []).forEach(function (item) {
              if (!item || !item.id) return;
              var o = Object.assign({}, item); delete o.id;
              tarefas.push(function () { return M.colecao(c).definir(item.id, o); });
            });
          });
          // Grava em sequência para não sobrecarregar.
          var i = 0;
          (function prox() {
            if (i >= tarefas.length) {
              $('bMsg').textContent = 'Backup restaurado (' + tarefas.length + ' registros).'; $('bMsg').className = 'msg ok';
              M.carregarConfig().then(preencher);
              return;
            }
            tarefas[i++]().then(prox).catch(function (err) { $('bMsg').textContent = 'Erro: ' + (err.code || err.message); $('bMsg').className = 'msg erro'; });
          })();
        });
    };
    leitor.readAsText(arquivo);
  }
})();
