/* Medusa Gestão — núcleo compartilhado: login, dados, configurações, menu e utilidades. */
(function () {
  'use strict';
  var M = window.Medusa = {};
  var cfg = window.MEDUSA_FIREBASE || {};
  M.modoDemo = !cfg.apiKey || /COLE_AQUI/.test(cfg.apiKey);

  var auth = null, db = null;
  if (!M.modoDemo) {
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
  }

  // Permite instalar como app no computador (Chrome/Edge). Só funciona no site publicado (https).
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  /* ================= Login ================= */
  var DEMO_KEY = 'medusa:demo:logado';
  var DEMO_USER = { uid: 'demo', email: 'demonstracao@medusa' };

  function lerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravarLS(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  // Chama cb(usuario) quando souber se há alguém logado (usuario = null se não houver).
  M.aoMudarLogin = function (cb) {
    if (M.modoDemo) { cb(lerLS(DEMO_KEY) ? DEMO_USER : null); return; }
    auth.onAuthStateChanged(function (u) { cb(u); });
  };

  // Usada nas páginas internas: sem login, volta para a tela de entrada.
  M.exigirLogin = function (cb) {
    var feito = false;
    M.aoMudarLogin(function (u) {
      if (!u) { location.replace('index.html'); return; }
      M.usuario = u;
      if (!feito) { feito = true; cb(u); }
    });
  };

  // Abre a página: confere login, carrega configurações e monta o menu.
  M.iniciarPagina = function (id, cb) {
    M.exigirLogin(function () {
      M.carregarConfig().then(function () {
        M.montarMenu(id);
        cb(M.config);
      }).catch(function (err) {
        console.error(err);
        M.montarMenu(id);
        M.toast('Não foi possível carregar as configurações: ' + (err.code || err.message), 'erro');
        cb(M.config);
      });
    });
  };

  M.entrar = function (email, senha) {
    if (M.modoDemo) { gravarLS(DEMO_KEY, '1'); return Promise.resolve(DEMO_USER); }
    return auth.signInWithEmailAndPassword(email, senha);
  };

  M.sair = function () {
    if (M.modoDemo) { gravarLS(DEMO_KEY, null); location.replace('index.html'); return; }
    auth.signOut().then(function () { location.replace('index.html'); });
  };

  M.recuperarSenha = function (email) {
    if (M.modoDemo) return Promise.reject({ code: 'demo' });
    return auth.sendPasswordResetEmail(email);
  };

  M.trocarSenha = function (atual, nova) {
    if (M.modoDemo) return Promise.reject({ code: 'demo' });
    var u = auth.currentUser;
    var cred = firebase.auth.EmailAuthProvider.credential(u.email, atual);
    return u.reauthenticateWithCredential(cred).then(function () { return u.updatePassword(nova); });
  };

  M.erroLogin = function (e) {
    var c = (e && e.code) || '';
    if (c === 'demo') return 'No modo demonstração não há senha.';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'E-mail ou senha incorretos.';
    if (/invalid-email/.test(c)) return 'E-mail inválido.';
    if (/too-many-requests/.test(c)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    if (/network/.test(c)) return 'Sem conexão com a internet.';
    if (/missing-password/.test(c)) return 'Digite a senha.';
    if (/weak-password/.test(c)) return 'A nova senha é fraca. Use pelo menos 8 caracteres.';
    if (/requires-recent-login/.test(c)) return 'Por segurança, saia e entre de novo antes de trocar a senha.';
    return 'Não foi possível concluir (' + (c || 'erro desconhecido') + ').';
  };

  /* ================= Dados =================
     Cada coleção fica em users/{uid}/{nome} no Firestore.
     No modo demonstração, fica no localStorage deste navegador. */
  var cacheCol = {};
  M.colecao = function (nome) {
    if (cacheCol[nome]) return cacheCol[nome];
    return (cacheCol[nome] = M.modoDemo ? colecaoLocal(nome) : colecaoFirestore(nome));
  };

  function colecaoFirestore(nome) {
    var ref = db.collection('users').doc(M.usuario.uid).collection(nome);
    return {
      ref: ref,
      observar: function (cb) {
        return ref.onSnapshot(function (snap) {
          cb(snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; }));
        }, function (err) {
          console.error(err);
          M.toast('Erro ao carregar dados: ' + (err.code || err.message), 'erro');
        });
      },
      listar: function () {
        return ref.get().then(function (snap) { return snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; }); });
      },
      obter: function (id) {
        return ref.doc(id).get().then(function (d) { if (!d.exists) return null; var o = d.data(); o.id = d.id; return o; });
      },
      adicionar: function (obj) { obj = limpo(obj); return ref.add(obj).then(function (r) { return Object.assign({}, obj, { id: r.id }); }); },
      definir: function (id, obj) { return ref.doc(id).set(limpo(obj), { merge: true }); },
      atualizar: function (id, obj) { return ref.doc(id).update(limpo(obj)); },
      remover: function (id) { return ref.doc(id).delete(); }
    };
  }

  // O Firestore recusa campos "undefined"; remove antes de gravar.
  function limpo(obj) { var o = JSON.parse(JSON.stringify(obj || {})); delete o.id; return o; }

  function colecaoLocal(nome) {
    var key = 'medusa:demo:' + nome;
    var ouvintes = [];
    function ler() { try { return JSON.parse(lerLS(key) || '[]'); } catch (e) { return []; } }
    function gravar(lista) {
      gravarLS(key, JSON.stringify(lista));
      ouvintes.forEach(function (cb) { cb(ler()); });
    }
    window.addEventListener('storage', function (ev) {
      if (ev.key === key) ouvintes.forEach(function (cb) { cb(ler()); });
    });
    return {
      observar: function (cb) { ouvintes.push(cb); cb(ler()); },
      listar: function () { return Promise.resolve(ler()); },
      obter: function (id) { return Promise.resolve(ler().filter(function (i) { return i.id === id; })[0] || null); },
      adicionar: function (obj) {
        var lista = ler(); var novo = Object.assign({}, obj, { id: M.novoId() });
        lista.push(novo); gravar(lista); return Promise.resolve(novo);
      },
      definir: function (id, obj) {
        var lista = ler(); var achou = false;
        lista = lista.map(function (i) { if (i.id !== id) return i; achou = true; return mesclar(i, obj); });
        if (!achou) lista.push(Object.assign({ id: id }, obj));
        gravar(lista); return Promise.resolve();
      },
      atualizar: function (id, obj) {
        gravar(ler().map(function (i) { return i.id === id ? Object.assign({}, i, obj) : i; }));
        return Promise.resolve();
      },
      remover: function (id) {
        gravar(ler().filter(function (i) { return i.id !== id; }));
        return Promise.resolve();
      }
    };
  }

  // Mescla objetos em profundidade (listas são substituídas, não mescladas).
  function mesclar(base, extra) {
    var r = Object.assign({}, base);
    Object.keys(extra || {}).forEach(function (k) {
      var v = extra[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && r[k] && typeof r[k] === 'object' && !Array.isArray(r[k])) r[k] = mesclar(r[k], v);
      else r[k] = v;
    });
    return r;
  }
  M.mesclar = mesclar;

  /* ================= Configurações ================= */
  M.CONFIG_PADRAO = {
    empresa: { nome: 'Medusa Marketing', fantasia: '', cnpj: '', ie: '', responsavel: '', telefone: '', email: '',
      endereco: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '', logo: '' },
    metas: { faturamentoCentavos: 2500000, novosClientes: 8, margem: 50 },
    docs: { orcPrefixo: 'ORC-', orcProximo: 1, recPrefixo: 'REC-', recProximo: 1, pedProximo: 1, validadeDias: 15,
      intro: 'Prezado(a) cliente, segue orçamento conforme solicitação.',
      condicoes: '50% na aprovação · 50% na entrega. Aceitamos PIX, boleto e cartão.',
      prazoEntrega: '7 a 10 dias úteis após aprovação' },
    pagamentos: { pix: true, dinheiro: true, cartao: true, boleto: true, transferencia: false,
      banco: '', tipoConta: 'Conta Corrente', agencia: '', conta: '', chavePix: '', favorecido: '' },
    caixa: {
      saldoInicialCentavos: 0,
      catEntrada: ['Serviço de marketing', 'Social media', 'Tráfego pago', 'Design / Identidade visual', 'Impressão', 'Personalização', 'Consultoria', 'Outras entradas'],
      catSaida: ['Fornecedores / Insumos', 'Aluguel', 'Internet / Telefone', 'Ferramentas / Assinaturas', 'Impostos e taxas', 'Freelancers / Equipe', 'Marketing próprio', 'Outras saídas']
    }
  };
  M.config = JSON.parse(JSON.stringify(M.CONFIG_PADRAO));

  M.carregarConfig = function () {
    return M.colecao('config').obter('geral').then(function (doc) {
      M.config = mesclar(JSON.parse(JSON.stringify(M.CONFIG_PADRAO)), doc || {});
      delete M.config.id;
      return M.config;
    });
  };

  M.salvarConfig = function (parcial) {
    M.config = mesclar(M.config, parcial);
    return M.colecao('config').definir('geral', parcial);
  };

  // Reserva o próximo número de orçamento ('orc'), recibo ('rec') ou pedido ('ped').
  M.proximoNumero = function (tipo) {
    var campo = tipo + 'Proximo';
    function formatar(n) {
      if (tipo === 'ped') return '#' + pad3(n);
      return (M.config.docs[tipo + 'Prefixo'] || '') + pad4(n);
    }
    if (M.modoDemo) {
      var col = M.colecao('config');
      return col.obter('geral').then(function (doc) {
        var n = +(((doc || {}).docs || {})[campo] || M.config.docs[campo] || 1);
        var p = { docs: {} }; p.docs[campo] = n + 1;
        M.config.docs[campo] = n + 1;
        return col.definir('geral', p).then(function () { return formatar(n); });
      });
    }
    var ref = M.colecao('config').ref.doc('geral');
    return db.runTransaction(function (t) {
      return t.get(ref).then(function (d) {
        var n = +((((d.exists && d.data()) || {}).docs || {})[campo] || M.config.docs[campo] || 1);
        var p = { docs: {} }; p.docs[campo] = n + 1;
        t.set(ref, p, { merge: true });
        return n;
      });
    }).then(function (n) { M.config.docs[campo] = n + 1; return formatar(n); });
  };
  function pad3(n) { return ('00' + n).slice(-Math.max(3, String(n).length)); }
  function pad4(n) { return ('000' + n).slice(-Math.max(4, String(n).length)); }

  /* ================= Menu lateral ================= */
  var ICONES = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    caixa: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    orcamento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    clientes: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    pedidos: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8l5 3-5 3V8z"/>',
    catalogo: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
    gestao: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    recibos: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    configuracoes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    mais: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    busca: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    lixo: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    pdf: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    whats: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    sino: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    alerta: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
  };
  M.icone = function (nome) { return '<svg viewBox="0 0 24 24">' + (ICONES[nome] || '') + '</svg>'; };

  var PAGINAS = [
    { id: 'dashboard', nome: 'Dashboard' },
    { id: 'caixa', nome: 'Caixa' },
    { id: 'orcamento', nome: 'Orçamento' },
    { id: 'clientes', nome: 'Clientes' },
    '-',
    { id: 'pedidos', nome: 'Pedidos' },
    { id: 'catalogo', nome: 'Catálogo' },
    { id: 'gestao', nome: 'Gestão' },
    '-',
    { id: 'recibos', nome: 'Recibos' },
    { id: 'configuracoes', nome: 'Configurações' }
  ];
  M.paginaInicial = 'dashboard.html';

  M.logoHTML = function (cls) {
    var logo = M.config && M.config.empresa && M.config.empresa.logo;
    if (logo) return '<img class="' + (cls || 'logo') + ' logo-img" src="' + M.esc(logo) + '" alt="Logo">';
    var nome = (M.config && M.config.empresa && M.config.empresa.nome) || 'M';
    return '<div class="' + (cls || 'logo') + '">' + M.esc(nome.charAt(0).toUpperCase()) + '</div>';
  };

  M.montarMenu = function (ativa) {
    var u = M.usuario || {};
    var nav = PAGINAS.map(function (p) {
      if (p === '-') return '<div class="nav-sep"></div>';
      return '<a class="nav-item' + (p.id === ativa ? ' active' : '') + '" href="' + p.id + '.html">' + M.icone(p.id) + p.nome + '</a>';
    }).join('');
    var atual = PAGINAS.filter(function (p) { return p.id === ativa; })[0];
    var el = document.getElementById('sidebar');
    el.className = 'sidebar';
    el.innerHTML =
      '<a class="brand" href="dashboard.html">' + M.logoHTML() + '<div>' +
      '<div class="brand-name">Medusa Gestão</div><div class="brand-sub">' + M.esc(atual ? atual.nome : '') + '</div></div></a>' +
      '<nav class="nav">' + nav + '</nav>' +
      '<div class="user"><div class="avatar">' + M.esc((u.email || '?').charAt(0).toUpperCase()) + '</div>' +
      '<div class="user-info"><div class="user-name" title="' + M.esc(u.email || '') + '">' + M.esc(u.email || '') + '</div><div class="user-sub">' + M.esc(M.config.empresa.nome || '') + '</div></div>' +
      '<button class="icon-btn" id="btnSair" title="Sair">' + M.icone('sair') + '</button></div>';
    document.getElementById('btnSair').onclick = function () {
      M.confirmar({ titulo: 'Sair do sistema?', texto: 'Você vai precisar entrar com e-mail e senha de novo.', ok: 'Sair' })
        .then(function (sim) { if (sim) M.sair(); });
    };
    if (M.modoDemo && !document.querySelector('.demo-bar')) {
      var bar = document.createElement('div');
      bar.className = 'demo-bar';
      bar.textContent = 'Modo demonstração: os dados ficam salvos só neste navegador. Configure o Firebase em assets/firebase-config.js para usar de verdade.';
      var main = document.querySelector('.main');
      main.insertBefore(bar, main.firstChild);
    }
  };

  /* ================= Utilidades ================= */
  M.novoId = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  M.$ = function (id) { return document.getElementById(id); };

  M.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  M.semAcento = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  // Busca simples: todas as palavras digitadas precisam aparecer no texto.
  M.combina = function (texto, busca) {
    var t = M.semAcento(texto);
    return M.semAcento(busca).split(/\s+/).filter(Boolean).every(function (p) { return t.indexOf(p) >= 0; });
  };

  // Valores são guardados em centavos (inteiros) para não ter erro de arredondamento.
  M.brl = function (centavos) {
    return ((centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  // "R$ 1.234" (sem centavos, para cards)
  M.brlCurto = function (centavos) {
    return 'R$ ' + Math.round((centavos || 0) / 100).toLocaleString('pt-BR');
  };

  // Aceita "1.234,56", "1234,56", "1234.56", "R$ 50". Devolve centavos ou NaN.
  M.lerValor = function (txt) {
    var t = String(txt == null ? '' : txt).replace(/R\$|\s/g, '');
    if (!t) return NaN;
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if (/\.\d{3}$/.test(t) || (t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    return Math.round(parseFloat(t) * 100);
  };
  // Igual a lerValor, mas vazio vira 0.
  M.lerValorOuZero = function (txt) { return String(txt || '').trim() ? M.lerValor(txt) : 0; };

  // Centavos -> "1.234,56" (para preencher campos).
  M.valorCampo = function (centavos) {
    return ((centavos || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  // Formata o campo de valor ao sair dele.
  M.campoValor = function (el) {
    el.addEventListener('blur', function () {
      var c = M.lerValor(el.value);
      if (!isNaN(c)) el.value = M.valorCampo(c);
    });
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  M.iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  M.hoje = function () { return M.iso(new Date()); };
  M.mesAtual = function () { return M.hoje().slice(0, 7); };
  M.paraData = function (iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2] || 1); };
  M.somarDias = function (iso, n) { var d = M.paraData(iso); d.setDate(d.getDate() + n); return M.iso(d); };
  // Dias entre hoje e a data (positivo = futuro).
  M.diasAte = function (iso) { return Math.round((M.paraData(iso) - M.paraData(M.hoje())) / 86400000); };
  M.dataCurta = function (iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0].slice(2) : ''; };
  M.dataBR = function (iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
  M.diaMes = function (iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; };
  M.isoDeTimestamp = function (ms) { return M.iso(new Date(ms || Date.now())); };
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  M.mesNome = function (ym) { var p = ym.split('-'); return MESES[+p[1] - 1] + ' ' + p[0]; };
  M.mesAbrev = function (ym) { return MESES[+ym.split('-')[1] - 1].slice(0, 3).toLowerCase() + '.'; };
  M.mesCurto = function (ym) { return MESES[+ym.split('-')[1] - 1].slice(0, 3); };
  M.dataExtenso = function (iso) {
    var d = M.paraData(iso);
    return SEMANA[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()].toLowerCase() + ' de ' + d.getFullYear();
  };
  M.mudarMes = function (ym, delta) {
    var p = ym.split('-'); var d = new Date(+p[0], +p[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  };
  // "hoje 10:45", "ontem 14:00", "19/10"
  M.quando = function (ms) {
    if (!ms) return '';
    var d = new Date(ms), iso = M.iso(d), dif = M.diasAte(iso);
    var hora = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (dif === 0) return 'hoje ' + hora;
    if (dif === -1) return 'ontem ' + hora;
    return M.diaMes(iso);
  };

  M.iniciais = function (nome) {
    var p = String(nome || '?').trim().split(/\s+/).filter(function (w) { return w.length > 1 || /[A-Z0-9]/.test(w); });
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : (p[0] || '').charAt(1) || '')).toUpperCase();
  };

  /* ---------- Máscaras de campos ---------- */
  function digitos(v) { return String(v || '').replace(/\D/g, ''); }
  M.digitos = digitos;
  M.fmtTelefone = function (v) {
    var d = digitos(v).slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  };
  M.fmtDocumento = function (v) {
    var d = digitos(v).slice(0, 14);
    if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  };
  M.fmtCEP = function (v) { var d = digitos(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; };
  // Campos com data-mask="tel|doc|cep|uf" ganham formatação automática.
  M.aplicarMascaras = function (raiz) {
    (raiz || document).querySelectorAll('[data-mask]').forEach(function (el) {
      var tipo = el.getAttribute('data-mask');
      var f = { tel: M.fmtTelefone, doc: M.fmtDocumento, cep: M.fmtCEP, uf: function (v) { return String(v).replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase(); } }[tipo];
      if (!f) return;
      el.addEventListener('input', function () { el.value = f(el.value); });
    });
  };

  /* ---------- WhatsApp ---------- */
  M.whatsapp = function (telefone, texto) {
    var d = digitos(telefone);
    if (d && d.length <= 11) d = '55' + d;
    var url = 'https://wa.me/' + (d || '') + '?text=' + encodeURIComponent(texto || '');
    window.open(url, '_blank', 'noopener');
  };

  /* ---------- Avisos ---------- */
  M.toast = function (texto, tipo) {
    var box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
    t.textContent = texto;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, tipo === 'erro' ? 6000 : 3000);
  };
  M.falha = function (acao) {
    return function (err) { console.error(err); M.toast('Não foi possível ' + acao + ': ' + ((err && (err.code || err.message)) || 'erro'), 'erro'); return null; };
  };

  // Janela de confirmação. Devolve Promise<boolean>.
  M.confirmar = function (o) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = '<div class="dialog" role="dialog"><h3>' + M.esc(o.titulo) + '</h3>' +
        (o.texto ? '<p>' + M.esc(o.texto) + '</p>' : '') +
        '<div class="dialog-actions"><button class="btn ghost" data-r="0">Cancelar</button>' +
        '<button class="btn' + (o.perigo ? ' danger' : '') + '" data-r="1">' + M.esc(o.ok || 'Confirmar') + '</button></div></div>';
      var fechado = false;
      function fim(v) { if (fechado) return; fechado = true; document.removeEventListener('keydown', tecla, true); ov.remove(); resolve(v); }
      function tecla(e) { if (e.key === 'Escape') { e.stopPropagation(); fim(false); } }
      ov.addEventListener('click', function (e) {
        if (e.target === ov) return fim(false);
        var b = e.target.closest('[data-r]');
        if (b) fim(b.getAttribute('data-r') === '1');
      });
      document.addEventListener('keydown', tecla, true);
      document.body.appendChild(ov);
      ov.querySelector('[data-r="1"]').focus();
    });
  };

  // Janela com conteúdo livre. Devolve { el, fechar }.
  M.janela = function (o) {
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="dialog janela" style="width:' + (o.largura || 520) + 'px">' +
      '<div class="janela-head"><h3>' + M.esc(o.titulo) + '</h3><button class="icon-btn" data-fechar title="Fechar">' + M.icone('x') + '</button></div>' +
      '<div class="janela-corpo">' + o.corpo + '</div></div>';
    var fechado = false;
    function fechar() { if (fechado) return; fechado = true; document.removeEventListener('keydown', tecla); ov.remove(); if (o.aoFechar) o.aoFechar(); }
    function tecla(e) { if (e.key === 'Escape' && !document.querySelectorAll('.overlay')[1]) fechar(); }
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) fechar(); });
    ov.querySelector('[data-fechar]').onclick = fechar;
    document.addEventListener('keydown', tecla);
    document.body.appendChild(ov);
    M.aplicarMascaras(ov);
    return { el: ov, fechar: fechar };
  };

  /* ---------- Documento para PDF (orçamento e recibo) ----------
     "Baixar PDF" abre a janela de impressão do navegador: escolha "Salvar como PDF". */
  M.imprimir = function (html, nomeArquivo) {
    var area = document.getElementById('printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
    area.innerHTML = html;
    var tituloAntes = document.title;
    if (nomeArquivo) document.title = nomeArquivo;
    var imgs = area.querySelectorAll('img');
    var pend = Array.prototype.filter.call(imgs, function (i) { return !i.complete; });
    function ir() {
      window.print();
      setTimeout(function () { document.title = tituloAntes; }, 500);
    }
    if (!pend.length) return ir();
    var n = pend.length;
    pend.forEach(function (i) { i.onload = i.onerror = function () { if (--n === 0) ir(); }; });
  };

  M.rodapeEmpresa = function () {
    var e = M.config.empresa;
    var end = [e.endereco, e.complemento, e.bairro].filter(Boolean).join(', ');
    var cid = [e.cidade, e.uf].filter(Boolean).join('/');
    return [e.email, e.telefone, [end, cid].filter(Boolean).join(' — ')].filter(Boolean).join(' · ');
  };

  // o: { titulo, numero, data, cliente:{nome, documento, responsavel, telefone, email}, rotuloCliente,
  //      itens:[{descricao, qtd, unitCentavos}], descontoCentavos, totalCentavos, forma, obs, extra (html), assinatura }
  M.documentoHTML = function (o) {
    var e = M.config.empresa;
    var c = o.cliente || {};
    var itens = (o.itens || []).filter(function (i) { return i.descricao || i.unitCentavos; });
    var subtotal = itens.reduce(function (a, i) { return a + Math.round((+i.qtd || 1) * (i.unitCentavos || 0)); }, 0);
    var linhas = itens.map(function (i) {
      var tot = Math.round((+i.qtd || 1) * (i.unitCentavos || 0));
      return '<tr><td>' + M.esc(i.descricao) + '</td><td class="n">' + M.esc(String(i.qtd || 1).replace('.', ',')) + '</td>' +
        '<td class="n">' + M.brl(i.unitCentavos) + '</td><td class="n">' + M.brl(tot) + '</td></tr>';
    }).join('');
    var clienteInfo = [c.documento ? 'CPF/CNPJ ' + c.documento : '', c.responsavel, c.telefone, c.email].filter(Boolean).map(M.esc).join(' · ');
    var empresaInfo = [e.cnpj ? 'CNPJ ' + e.cnpj : '', e.telefone].filter(Boolean).map(M.esc).join(' · ');
    return '<div class="pdoc">' +
      '<div class="pdoc-top"><div class="pdoc-emp">' + M.logoHTML('pdoc-logo') +
      '<div><div class="pdoc-emp-nome">' + M.esc(e.fantasia || e.nome) + '</div><div class="pdoc-emp-info">' + empresaInfo + '</div></div></div>' +
      '<div class="pdoc-num"><div class="pdoc-tit">' + M.esc(o.titulo) + '</div><div class="pdoc-n">' + M.esc(o.numero || '') + '</div>' +
      '<div class="pdoc-d">Data: ' + M.esc(M.dataBR(o.data)) + '</div>' + (o.validade ? '<div class="pdoc-d">Válido até: ' + M.esc(M.dataBR(o.validade)) + '</div>' : '') + '</div></div>' +
      (o.intro ? '<p class="pdoc-intro">' + M.esc(o.intro) + '</p>' : '') +
      '<div class="pdoc-sec"><div class="pdoc-lab">' + M.esc(o.rotuloCliente || 'Cliente') + '</div><div class="pdoc-cli">' + M.esc(c.nome || '—') + '</div>' +
      (clienteInfo ? '<div class="pdoc-sub">' + clienteInfo + '</div>' : '') + '</div>' +
      (o.destaque || '') +
      '<div class="pdoc-sec"><div class="pdoc-lab">' + M.esc(o.rotuloItens || 'Itens / serviços') + '</div>' +
      '<table class="pdoc-tab"><thead><tr><th>Descrição</th><th class="n">Qtd.</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead><tbody>' +
      (linhas || '<tr><td colspan="4">—</td></tr>') + '</tbody></table>' +
      '<div class="pdoc-tot">' +
      (o.descontoCentavos ? '<div><span>Subtotal</span><span>' + M.brl(subtotal) + '</span></div><div><span>Desconto</span><span>- ' + M.brl(o.descontoCentavos) + '</span></div>' : '') +
      '<div class="pdoc-total"><span>Total</span><span>' + M.brl(o.totalCentavos != null ? o.totalCentavos : subtotal) + '</span></div></div></div>' +
      (o.forma ? '<div class="pdoc-sec"><div class="pdoc-lab">Forma de pagamento</div><div>' + M.esc(o.forma) + '</div></div>' : '') +
      (o.extra || '') +
      (o.obs ? '<div class="pdoc-sec"><div class="pdoc-lab">Observações</div><div class="pdoc-obs">' + M.esc(o.obs) + '</div></div>' : '') +
      (o.assinatura ? '<div class="pdoc-ass"><div class="pdoc-linha"></div><div>' + M.esc(e.responsavel || e.nome) + '</div><div class="pdoc-sub">' + M.esc(e.fantasia || e.nome) + '</div></div>' : '') +
      '<div class="pdoc-rod">' + M.esc(M.rodapeEmpresa()) + '</div></div>';
  };

  // Dados bancários para mostrar no documento.
  M.dadosBancariosHTML = function () {
    var p = M.config.pagamentos;
    var partes = [];
    if (p.chavePix) partes.push('<strong>PIX:</strong> ' + M.esc(p.chavePix));
    if (p.banco) partes.push('<strong>Banco:</strong> ' + M.esc(p.banco) + (p.agencia ? ' · Ag. ' + M.esc(p.agencia) : '') + (p.conta ? ' · ' + M.esc(p.tipoConta || 'Conta') + ' ' + M.esc(p.conta) : ''));
    if (p.favorecido) partes.push('<strong>Favorecido:</strong> ' + M.esc(p.favorecido));
    if (!partes.length) return '';
    return '<div class="pdoc-sec"><div class="pdoc-lab">Dados para pagamento</div><div>' + partes.join('<br>') + '</div></div>';
  };

  // Formas de pagamento ativas nas configurações.
  M.formasPagamento = function (extra) {
    var p = M.config.pagamentos, l = [];
    if (p.pix) l.push('PIX');
    if (p.dinheiro) l.push('Dinheiro');
    if (p.cartao) l.push('Cartão');
    if (p.boleto) l.push('Boleto');
    if (p.transferencia) l.push('Transferência');
    if (!l.length) l = ['PIX', 'Dinheiro', 'Cartão'];
    (extra || []).forEach(function (x) { if (x && l.indexOf(x) < 0) l.push(x); });
    return l;
  };

  /* ---------- Caixa: lançamento automático a partir de um recibo pago ---------- */
  M.lancarRecibo = function (rec) {
    var dados = {
      tipo: 'entrada', descricao: 'Recibo ' + rec.numero + ' — ' + (rec.clienteNome || ''),
      valorCentavos: rec.totalCentavos, data: rec.dataPagamento || rec.data || M.hoje(),
      categoria: rec.categoria || M.config.caixa.catEntrada[0] || 'Outras entradas', forma: rec.forma || 'PIX',
      obs: 'Lançado automaticamente pelo recibo ' + rec.numero + '.', reciboId: rec.id,
      criadoEm: Date.now(), atualizadoEm: Date.now()
    };
    var col = M.colecao('lancamentos');
    if (rec.lancamentoId) return col.definir(rec.lancamentoId, dados).then(function () { return rec.lancamentoId; });
    return col.adicionar(dados).then(function (l) { return l.id; });
  };
})();
