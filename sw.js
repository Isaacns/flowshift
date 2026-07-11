/* FlowShift by Vizio — service worker resiliente e versionado (padrão INPERSON).
   NÃO editar VER à mão: o build.js injeta mrgxzmhq. */
var VER="mrgxzmhq";
var C="flowshift-"+VER;

self.addEventListener("install", function(e){ self.skipWaiting(); });

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

/* Só gerencia o app shell (mesma origem). Chamadas ao Supabase/CDNs passam direto. */
function netFirst(req){
  return new Promise(function(resolve){
    var done=false;
    var t=setTimeout(function(){
      if(done) return; done=true;
      fallback(req).then(function(c){ resolve(c || fetch(req).catch(function(){ return new Response("",{status:504}); })); });
    }, 4000);
    fetch(req).then(function(r){
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
  e.respondWith(netFirst(e.request));
});
