// Service worker do Gestor de Comprovantes: deixa o app instalável, abre mais rápido
// e recebe comprovantes compartilhados de outros apps (Android).
const VERSAO = "gc-v1";
const APP = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== "cdn" && k !== "compartilhado").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);

  // Arquivo compartilhado por outro app: guarda e abre o app com o formulário.
  if (req.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/compartilhar")) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const f = fd.get("arquivo");
        if (f && typeof f !== "string") {
          const c = await caches.open("compartilhado");
          await c.put("arquivo-compartilhado", new Response(f, { headers: { "content-type": f.type || "application/octet-stream", "x-nome": encodeURIComponent(f.name || "comprovante") } }));
        }
      } catch (err) {}
      return Response.redirect(new URL("./?compartilhado=1", self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== "GET") return;

  // Páginas do app: rede primeiro (para receber atualizações), cópia salva quando estiver sem internet.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); } return r; })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // Bibliotecas e fontes: usa a cópia salva e atualiza em segundo plano.
  if (CDN.test(req.url)) {
    e.respondWith(caches.open("cdn").then(async c => {
      const salvo = await c.match(req);
      const rede = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => salvo);
      return salvo || rede;
    }));
  }
  // Supabase e API da Anthropic passam direto, sem cache.
});
