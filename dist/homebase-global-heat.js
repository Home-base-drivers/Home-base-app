(function(root){
 'use strict';
 function create({load,center,zoom,nearHome,render,status,schedule=setTimeout,cancel=clearTimeout}){
  let timer=null,revision=0,cache=new Map(),active=null;
  async function refresh(){
   const request=++revision,point=center();
   if(nearHome(point)){active=null;status('');render();return}
   if(zoom()<9){active=[];status('Zoom in to a city to explore local heat');render();return}
   const key=point.map(n=>n.toFixed(1)).join(',');
   const cached=cache.get(key);
   active=[];status('Loading public places in this area…');render();
   try{
    const sources=cached&&Date.now()-cached.time<300000?cached.sources:await load(...point);
    if(request!==revision)return;
    active=sources;cache.set(key,{sources,time:Date.now()});
    if(cache.size>12)cache.delete(cache.keys().next().value);
    status(sources.length?'Area activity estimate · public places, not live ride requests':'No public data available for this area');
   }catch{if(request!==revision)return;active=[];status('Area data unavailable · move the map to retry')}
   render();
  }
  return {getSources:()=>active,changed(){++revision;cancel(timer);timer=schedule(refresh,900)},refresh};
 }
 const api={create};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeBaseGlobalHeat=api;
})(typeof globalThis!=='undefined'?globalThis:this);
