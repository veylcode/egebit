'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../pwa.js'),'utf8');

async function setup(dirty={}) {
  const events={}, workerEvents={}, posted=[], notices=[];
  let confirmations=0, reloads=0;
  const elements=new Map();
  const element=(key)=>{ if(!elements.has(key)) elements.set(key,{hidden:false,value:'',textContent:'',addEventListener:(name,fn)=>events[key+':'+name]=fn,showModal(){}}); return elements.get(key); };
  const document={querySelector(selector){
    if(selector==='form[data-dirty="true"]') return dirty.form ? {} : null;
    return element(selector);
  }};
  element('#condition').value=dirty.condition||'';
  element('#study-save-status').textContent=dirty.pending?'Есть несохранённые изменения…':'';
  const worker={postMessage:(message)=>posted.push(message)};
  const context={document,selectedFiles:dirty.file?[{}]:[],toast:(text)=>notices.push(text),confirm:()=>{confirmations++;return dirty.approve!==false;},location:{reload:()=>reloads++},navigator:{onLine:true,serviceWorker:{controller:{},ready:Promise.resolve(),addEventListener:(name,fn)=>workerEvents[name]=fn,register:async()=>({waiting:worker,addEventListener(){}})}},window:{addEventListener:(name,fn)=>events[name]=fn}};
  vm.runInNewContext(code,context);
  await new Promise(setImmediate);
  return {events,workerEvents,posted,notices,get confirmations(){return confirmations;},get reloads(){return reloads;}};
}
for(const [name,dirty] of Object.entries({condition:{condition:'Сохрани условие'},file:{file:true},studyForm:{form:true},pendingSave:{pending:true}})) {
  test('PWA preserves unfinished '+name+' without a native dialog',async()=>{
    const app=await setup(dirty);
    assert.doesNotThrow(()=>app.events['#update-app:click']());
    assert.equal(app.posted.length,0);assert.equal(app.confirmations,0);assert.equal(app.notices.length,1);
    app.workerEvents.controllerchange();assert.equal(app.reloads,0);
  });
}
test('PWA needs explicit approval before activating a ready update',async()=>{
  const declined=await setup({approve:false});declined.events['#update-app:click']();assert.equal(declined.posted.length,0);
  const approved=await setup({approve:true});approved.events['#update-app:click']();assert.equal(approved.posted[0].type,'ACTIVATE_UPDATE');
  approved.workerEvents.controllerchange();assert.equal(approved.reloads,1);
});
test('service worker never intercepts API, authenticated, foreign or export requests',()=>{
  const handlers={};let intercepted=0;
  const fake={URL,self:{location:{href:'https://veylcode.github.io/egebit/sw.js'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{match:async()=>({})},fetch:async()=>({})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),fake);
  const request=(url,options={})=>({url,method:'GET',mode:'cors',headers:{has:()=>false},...options});
  for(const r of [request('https://egebit-5-83-140-108.sslip.io/api/study/overview'),request('https://veylcode.github.io/api/me'),request('https://veylcode.github.io/egebit/export.zip'),request('https://veylcode.github.io/egebit/index.html',{headers:{has:()=>true}}),request('https://veylcode.github.io/egebit/index.html',{method:'POST'}),request('https://veylcode.github.io/other/')]) handlers.fetch({request:r,respondWith:()=>intercepted++});
  assert.equal(intercepted,0);
  handlers.fetch({request:request('https://veylcode.github.io/egebit/icon.svg'),respondWith:()=>intercepted++});assert.equal(intercepted,1);
});
