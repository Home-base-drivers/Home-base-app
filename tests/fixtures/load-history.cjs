// Loads every stored demand-history record exactly as the app seeds them.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
module.exports=function loadHistory(){
  const src=fs.readFileSync(path.join(__dirname,'../../dist/homebase-demand-history.js'),'utf8').replace('const screenshotBenchmarks=seedScreenshotBenchmarks();','const screenshotBenchmarks=seedScreenshotBenchmarks();globalThis.__ROWS=screenshotBenchmarks;');
  const ctx={localStorage:{getItem:()=>null,setItem:()=>{}},Intl,Date,Math,JSON,console,globalThis:{}};ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(src,ctx);return ctx.globalThis.__ROWS||ctx.__ROWS;
};
