/* FlowShift by Vizio — service worker resiliente e versionado (padrão INPERSON).
   NÃO editar VER à mão: o build.js injeta mrt18gg3. */
var VER="mrt18gg3";
var C="flowshift-"+VER;

self.addEventListener("install", function(e){ self.skipWaiting(); });

/* O app pede para a versão nova assumir agora quando o usuário toca em
   "atualizar" — sem isto o SW novo fica em 'waiting' até todas as abas
   fecharem, o que num atalho de tela inicial pode nunca acontecer. */
self.addEventListener("message", function(e){
  if(e.data && e.data.type==="PULAR_ESPERA") self.skipWaiting();
});

self.addEventListener("activate", function(e){
  e.waitUntil((async function(){
    try{
      var keys=await caches.keys();
      await Promise.all(keys.filter(function(k){ return k!==C; }).map(function(k){ return caches.delete(k); }));
    }catch(x){}
    await self.clients.claim();
  })());
});

function fallback(req){
  return caches.match(req).then(function(c){
    if(c) return c;
    if(req.mode==="navigate") return caches.match("index.html",{ignoreSearch:true}).then(function(m){ return m || caches.match(req,{ignoreSearch:true}); });
    return caches.match(req,{ignoreSearch:true});
  });
}

/* `no-cache` obriga revalidar com o servidor (ETag -> 304 barato, ou 200 novo).
   Sem isto o fetch do SW pode vir do CACHE HTTP do navegador e o network-first
   vira cache-first disfarçado: a versão nova existe no servidor e nunca chega. */
function buscar(req){
  try{ return fetch(req,{cache:"no-cache"}); }catch(e){ return fetch(req); }
}

/* Só gerencia o app shell (mesma origem). Chamadas ao Supabase/CDNs passam direto. */
function netFirst(req){
  return new Promise(function(resolve){
    var done=false;
    var t=setTimeout(function(){
      if(done) return; done=true;
      fallback(req).then(function(c){ resolve(c || buscar(req).catch(function(){ return new Response("",{status:504}); })); });
    }, 4000);
    buscar(req).then(function(r){
      if(done) return; done=true; clearTimeout(t);
      try{ var cp=r.clone(); caches.open(C).then(function(c){ c.put(req,cp); }).catch(function(){}); }catch(x){}
      resolve(r);
    }).catch(function(){
      if(done) return; done=true; clearTimeout(t);
      fallback(req).then(function(c){ resolve(c || new Response("offline",{status:503})); });
    });
  });
}

self.addEventListener("fetch", function(e){
  if(e.request.method!=="GET") return;
  var url;
  try{ url=new URL(e.request.url); }catch(x){ return; }
  if(url.origin!==self.location.origin) return; /* deixa Supabase e CDNs passarem */
  /* Checagem de versão não entra no cache: cada uma usa ?_v=<timestamp> único e o
     cache criaria uma entrada nova a cada 10 min, para sempre. */
  if(url.searchParams.has("_v")) return;
  e.respondWith(netFirst(e.request));
});
