const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'dist');
const output=path.join(__dirname,'_pruefung');fs.mkdirSync(output,{recursive:true});
global.window=global;
global.PDFLib=require(path.join(root,'vendor/pdf-lib.min.js'));
global.fontkit=require(path.join(root,'vendor/fontkit.umd.js'));
const app=JSON.parse(fs.readFileSync(path.join(root,'data/app.json')));
global.fetch=async url=>{
  const file=path.join(root,url.replace(/^\//,''));
  if(!fs.existsSync(file))return {ok:false};
  const bytes=fs.readFileSync(file);
  return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
};
const local=new Map();global.localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)};
global.document={getElementById:()=>null};
require(path.join(root,'pdf-browser.js'));
require(path.join(root,'browser-backend.js'));

(async()=>{
  assert.equal(app.figures.length,621);
  assert.deepEqual(app.figures.map(r=>r.number),Array.from({length:621},(_,i)=>i+1));
  for(const row of app.figures)for(const file of [row.image.path,row.thumbnail])assert(fs.existsSync(path.join(root,file)),file);
  const ids=[app.figures[620].id,app.figures[0].id];
  const baseline={selected:ids,notes:{[ids[1]]:{text:'Prüfhinweis Füße parallel. 丹田',checked:[],phases:{l:'shaoyang'}}},title:'',layout:'below',mode:'custom'};
  for(const [mode,layout] of [['custom','below'],['annotated','spacious'],['plain','side']]) {
    const result=await HLAPdf.create(app,{...baseline,mode,layout},app.catalog,()=>{});
    assert.equal(result.figures,2);assert.equal(result.pages,1);
    assert.deepEqual(result.audit.map(r=>r.number),[1,621]);
    fs.writeFileSync(path.join(output,mode+'.pdf'),result.bytes);
    console.log('PDF '+mode+'/'+layout+' erstellt: '+result.bytes.length+' Bytes');
  }
  await assert.rejects(()=>HLAOnline.request('/api/export',{selected:[]}),/mindestens eine/);
  await HLAOnline.request('/api/state',baseline);
  let data=await HLAOnline.request('/api/data');assert.deepEqual(data.state.selected,ids);
  assert.equal(data.state.notes[ids[1]].text,baseline.notes[ids[1]].text);
  const collection=await HLAOnline.request('/api/collections',{name:'Testsammlung',state:baseline});
  const loaded=await HLAOnline.request('/api/collections/'+collection.id);
  assert.equal(loaded.name,'Testsammlung');assert.deepEqual(loaded.state.selected,ids);
  await assert.rejects(()=>HLAOnline.request('/api/catalog',[{id:'a',category:'Stand',text:'A'},{id:'a',category:'Stand',text:'B'}]),/doppelte/);
  await assert.rejects(()=>HLAPdf.create(app,{...baseline,notes:{[ids[1]]:{text:'Langer Hinweis '.repeat(1000)}},layout:'below'},app.catalog),/Zu viel Anmerkungstext/);
  const longest=[...app.figures].sort((a,b)=>(b.en.length+b.de.length)-(a.en.length+a.de.length)).slice(0,6);
  const compact=await HLAPdf.create(app,{selected:longest.map(r=>r.id),notes:{},layout:'side',mode:'plain',title:''},app.catalog);
  assert.equal(compact.pages,1);assert.equal(compact.figures,6);
  fs.writeFileSync(path.join(output,'Sechs-lange-Namen.pdf'),compact.bytes);
  if(process.argv.includes('--samples')){console.log('Stichproben nach Schrift- und Layoutkorrektur bestanden.');return;}
  const full=await HLAPdf.create(app,{selected:app.figures.map(r=>r.id),notes:{},layout:'below',mode:'plain',title:''},app.catalog,(message)=>{
    if(/Position (100|200|300|400|500|600) von/.test(message))console.log(message);
  });
  assert.equal(full.figures,621);assert.equal(full.pages,156);
  assert.deepEqual(full.audit.map(r=>r.number),Array.from({length:621},(_,i)=>i+1));
  assert(full.audit.every((r,i)=>Math.abs(r.scale*app.figures[i].image.u-35.8174762130198)<1e-8));
  fs.writeFileSync(path.join(output,'Alle-621-schlicht.pdf'),full.bytes);
  fs.writeFileSync(path.join(output,'Online-Pruefung.json'),JSON.stringify({figures:621,pages:156,allAssetsPresent:true,modes:['custom','annotated','plain'],layouts:['below','spacious','side'],sourceOrder:true,bodyScale:true,emptySelection:true,collections:true,notes:true,overflowError:true,pdfBytes:full.bytes.length,audit:full.audit},null,2));
  console.log('Online-Prüfungen bestanden.');
})().catch(error=>{console.error(error);process.exitCode=1;});
