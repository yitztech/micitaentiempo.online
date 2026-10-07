import { catalog } from "~/lib/catalog.server";
import { siteForRequest } from "~/lib/site.server";
import type { Route } from "./+types/embed-js";

/**
 * Cargador del embed (< 5 KB, sin dependencias). Modos: inline (iframe en su sitio), popup y button
 * (botón que abre el iframe en una capa). Ajusta la altura con postMessage comprobando el origen y
 * reenvía «micita:booking_confirmed» a la página anfitriona.
 */
export function loader({ request }: Route.LoaderArgs) {
  const site = siteForRequest(request);
  const t = catalog(site.lang).booking.embed;
  const js = `(function(){
var ORIGIN=${JSON.stringify(site.siteUrl)};var BOOK=${JSON.stringify(t.book)};var CLOSE=${JSON.stringify(t.close)};
var s=document.currentScript;if(!s)return;var slug=s.getAttribute("data-calendar");if(!slug||!/^[a-z0-9-]{3,70}$/.test(slug))return;
var mode=s.getAttribute("data-mode")||"inline";var label=s.getAttribute("data-label")||BOOK;
function frame(){var f=document.createElement("iframe");f.src=ORIGIN+"/embed/"+slug;f.title=label;f.loading="lazy";
f.style.cssText="width:100%;border:0;min-height:640px;display:block";f.setAttribute("allow","clipboard-write");return f;}
var frames=[];
window.addEventListener("message",function(e){if(e.origin!==ORIGIN||!e.data||e.data.source!=="micita")return;
for(var i=0;i<frames.length;i++){if(frames[i].contentWindow!==e.source)continue;
if(e.data.type==="micita:height"&&typeof e.data.height==="number")frames[i].style.height=Math.max(400,e.data.height)+"px";
if(e.data.type==="micita:booking_confirmed")window.dispatchEvent(new CustomEvent("micita:booking_confirmed",{detail:e.data.booking}));}});
if(mode==="inline"){var f=frame();frames.push(f);s.parentNode.insertBefore(f,s.nextSibling);return;}
var b=document.createElement("button");b.type="button";b.textContent=label;
b.style.cssText="font:600 16px/1 system-ui,sans-serif;padding:14px 22px;border:0;border-radius:10px;background:#1d6f86;color:#fff;cursor:pointer";
if(mode==="popup"){b.style.cssText+=";position:fixed;right:20px;bottom:20px;z-index:2147483000;box-shadow:0 4px 16px rgba(0,0,0,.2)";}
b.addEventListener("click",function(){var o=document.createElement("div");o.setAttribute("role","dialog");o.setAttribute("aria-modal","true");o.setAttribute("aria-label",label);
o.style.cssText="position:fixed;inset:0;z-index:2147483001;background:rgba(15,26,31,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px";
var box=document.createElement("div");box.style.cssText="background:#fff;border-radius:12px;width:100%;max-width:880px;position:relative";
var c=document.createElement("button");c.type="button";c.textContent="\\u00d7";c.setAttribute("aria-label",CLOSE);
c.style.cssText="position:absolute;top:6px;right:8px;font:24px/1 system-ui;border:0;background:none;cursor:pointer;width:44px;height:44px";
var f=frame();frames.push(f);box.appendChild(c);box.appendChild(f);o.appendChild(box);document.body.appendChild(o);
function close(){o.remove();frames=frames.filter(function(x){return x!==f});b.focus();}
c.addEventListener("click",close);o.addEventListener("click",function(e){if(e.target===o)close();});
document.addEventListener("keydown",function k(e){if(e.key==="Escape"){close();document.removeEventListener("keydown",k);}});c.focus();});
s.parentNode.insertBefore(b,s.nextSibling);
})();`;
  return new Response(js, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      // Lo cargan las webs de los negocios (otros orígenes).
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
