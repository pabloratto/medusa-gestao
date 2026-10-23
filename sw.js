/* Medusa Gestão — service worker mínimo: permite instalar o app no computador.
   Não guarda páginas em cache, então você sempre vê a versão mais nova do site. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('<!doctype html><meta charset="utf-8"><title>Sem conexão</title><body style="background:#111;color:#eee;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Sem conexão com a internet</h2><p>O Medusa Gestão precisa de internet. Verifique a conexão e tente de novo.</p></div>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }));
});
