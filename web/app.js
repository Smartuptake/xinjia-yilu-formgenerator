'use strict';
const $=id=>document.getElementById(id);
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const fold=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let data,figures,catalog,state,selected,active=null,cards=new Map(),saveTimer,toastTimer,saveChain=Promise.resolve(),revision=0,savedRevision=0,busy=false;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
async function api(url,body){const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let result;try{result=await response.json();}catch{throw Error('Der lokale Generator antwortet nicht. Bitte den Starter erneut öffnen.');}if(!response.ok)throw Error(result.error||'Die Verarbeitung ist fehlgeschlagen.');return result;}
function snapshot(){return {...state,selected:[...selected],notes:structuredClone(state.notes)};}
function changed(){if(!busy)exportStatus();revision++;$('saveStatus').textContent='Wird gespeichert …';clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,550);updateCounts();if(active)updateCard(active.id);}
async function saveNow(){clearTimeout(saveTimer);const value=snapshot(),version=revision;saveChain=saveChain.catch(()=>{}).then(()=>api('/api/state',value));try{await saveChain;savedRevision=Math.max(savedRevision,version);if(savedRevision===revision)$('saveStatus').textContent='Auf diesem Mac gespeichert';}catch(error){$('saveStatus').textContent='Speichern fehlgeschlagen';toast(error.message);}}
function note(id){return state.notes[id]||(state.notes[id]={checked:[],text:'',phases:{}});}
function noteCount(id){const n=state.notes[id];return n?(n.checked?.length||0)+(n.text?.trim()?1:0)+Object.keys(n.phases||{}).length:0;}
function updateCard(id){const c=cards.get(id);if(!c)return;c.root.classList.toggle('selected',selected.has(id));c.check.checked=selected.has(id);const count=noteCount(id);c.edit.textContent=count?`${count} eigene Hinweise · bearbeiten`:'Anmerkungen bearbeiten';}
function updateCounts(){$('selectionCount').textContent=`${selected.size} von ${figures.length} ausgewählt`;$('exportPdf').disabled=busy;$('selectionHelp').hidden=selected.size>0;}
function setSelected(id,value){if(value)selected.add(id);else selected.delete(id);changed();updateCard(id);if($('onlySelected').checked)filter();}
function matching(row){
  if($('onlySelected').checked&&!selected.has(row.id))return false;
  if($('sequence').value&&String(row.sequence)!==$ ('sequence').value)return false;
  const query=$('search').value.trim().replace(/[–—]/g,'-');if(!query)return true;
  if(/^[\d\s,;-]+$/.test(query))return query.split(/[,;]+/).some(part=>{const s=part.trim();const range=s.match(/^(\d+)\s*-\s*(\d+)$/);return range?row.number>=Number(range[1])&&row.number<=Number(range[2]):row.number===Number(s);});
  const haystack=fold([row.number,row.de,row.en,row.pinyin,row.bamen.label].join(' ')),needle=fold(query);
  return haystack.includes(needle)||haystack.replace(/\s/g,'').includes(needle.replace(/\s/g,''));
}
function filter(){let count=0;for(const row of figures){const show=matching(row);cards.get(row.id).root.hidden=!show;if(show)count++;updateCard(row.id);}$('visibleCount').textContent=`${count} Positionen angezeigt`;$('empty').hidden=count!==0;updateCounts();}
function buildGallery(){const fragment=document.createDocumentFragment();for(const row of figures){
  const root=make('article','card');root.dataset.id=row.id;const top=make('div','cardTop'),label=make('label','check'),check=make('input');check.type='checkbox';check.setAttribute('aria-label','Position '+row.number+' auswählen');check.addEventListener('change',()=>setSelected(row.id,check.checked));label.append(check,document.createTextNode(String(row.number)));top.append(label);
  const imageButton=make('button','figureButton');imageButton.setAttribute('aria-label','Position '+row.number+' ansehen und bearbeiten');const img=make('img');img.src='/'+(row.thumbnail||row.image.path);img.alt='Comicposition '+row.number;img.loading='lazy';img.decoding='async';imageButton.append(img);imageButton.addEventListener('click',()=>openEditor(row.id));
  const caption=make('div','cardCaption');caption.append(make('b','',row.de),make('span','',row.en),make('span','',row.pinyin));const edit=make('button','cardBottom','Anmerkungen bearbeiten');edit.addEventListener('click',()=>openEditor(row.id));root.append(top,imageButton,caption,edit);fragment.append(root);cards.set(row.id,{root,check,edit});
}$('gallery').replaceChildren(fragment);}
function fillCategorySelects(){const cats=[...new Set([...data.categories,...catalog.map(e=>e.category)])];for(const id of ['quickCategory','bulkCategory']){const old=$(id).value;$(id).replaceChildren(...cats.map(c=>{const o=make('option','',c);o.value=c;return o;}));if(cats.includes(old))$(id).value=old;}}
function renderChoices(){const n=note(active.id),checked=new Set(n.checked);const frag=document.createDocumentFragment();const groups=new Map();for(const entry of catalog){if(!groups.has(entry.category))groups.set(entry.category,[]);groups.get(entry.category).push(entry);}for(const [category,entries] of groups){const group=make('details','noteGroup');group.open=['Stand','Blickrichtung'].includes(category)||entries.some(e=>checked.has(e.id));group.append(make('summary','',category));for(const entry of entries){const label=make('label'),input=make('input');input.type='checkbox';input.checked=checked.has(entry.id);input.addEventListener('change',()=>{const current=note(active.id),chosen=new Set(current.checked);if(input.checked)chosen.add(entry.id);else chosen.delete(entry.id);current.checked=[...chosen];changed();});label.append(input,make('span','',entry.text));group.append(label);}frag.append(group);}$('noteChoices').replaceChildren(frag);}
function openEditor(id){active=figures.find(row=>row.id===id);const n=note(id);$('editNumber').textContent='POSITION '+active.number;$('editName').textContent=active.de;$('editTranslations').textContent=active.en+' · '+active.pinyin;$('editImage').src='/'+active.image.path;$('editImage').alt='Comicfigur '+active.number;$('editSelected').checked=selected.has(id);$('freeText').value=n.text||'';$('bamenLabel').textContent='Bā Mén: '+active.bamen.label;
  for(const [side,control] of [['l','phaseL'],['r','phaseR']]){const proposed=active.phases[side],first=make('option','','Vorschlag beibehalten: '+data.phases[proposed.phase]+(proposed.tentative&&!['rest','unknown','transition'].includes(proposed.phase)?' (möglich)':''));first.value='';const options=Object.entries(data.phases).map(([value,label])=>{const o=make('option','',label);o.value=value;return o;});$(control).replaceChildren(first,...options);$(control).value=n.phases?.[side]||'';}
  $('phaseReasons').textContent='Links: '+active.phases.l.reason+' Rechts: '+active.phases.r.reason;renderChoices();const i=figures.indexOf(active);$('previous').disabled=i===0;$('next').disabled=i===figures.length-1;if(!$('editor').open)$('editor').showModal();
}
async function saveCatalog(next){await api('/api/catalog',next);catalog=next;fillCategorySelects();renderCatalogEditor();if(active&&$('editor').open)renderChoices();}
function renderCatalogEditor(){const old=$('catalogEntry').value;$('catalogEntry').replaceChildren(...catalog.map(e=>{const o=make('option','',e.category+' · '+e.text);o.value=e.id;return o;}));if(catalog.some(e=>e.id===old))$('catalogEntry').value=old;showCatalogEntry();}
function showCatalogEntry(){const e=catalog.find(e=>e.id===$('catalogEntry').value);$('entryCategory').value=e?.category||'';$('entryText').value=e?.text||'';}
async function collections(){const rows=await api('/api/collections');$('collections').replaceChildren(make('option','','Bitte wählen …'),...rows.map(r=>{const o=make('option','',r.name);o.value=r.id;return o;}));$('collections').firstElementChild.value='';}
function setState(value){state={version:1,notes:{},layout:'below',mode:'annotated',title:'',...value};if(!state.notes||typeof state.notes!=='object')throw Error('Ungültige Anmerkungen.');selected=new Set((state.selected||[]).map(String).filter(id=>figures.some(r=>r.id===id)));$('title').value=state.title;$('mode').value=state.mode;$('layout').value=state.layout;}
async function adopt(value,entries){
  const next=structuredClone(value),merged=structuredClone(catalog),remap=new Map();if(Array.isArray(entries))for(const entry of entries){if(!entry.id||!entry.category||!entry.text)continue;const current=merged.find(e=>e.id===entry.id);if(!current)merged.push(entry);else if(current.category!==entry.category||current.text!==entry.text){const replacement={...entry,id:'import-'+crypto.randomUUID()};merged.push(replacement);remap.set(entry.id,replacement.id);}}
  for(const n of Object.values(next.notes||{})){n.checked=(n.checked||[]).map(id=>remap.get(id)||id);n.phases=n.phases||{};}
  await api('/api/state',next);await saveCatalog(merged);setState(next);changed();filter();toast('Sammlung geladen. Vorhandene Katalogeinträge bleiben erhalten.');
}
function exportStatus(message='',error=false){const el=$('exportStatus');el.textContent=message;el.hidden=!message;el.classList.toggle('error',error);}
async function exportPdf(){
  if(busy)return;
  if(selected.size===0){const message='Bitte wähle zuerst mindestens eine Position aus: Klicke auf das Kästchen neben der Bildnummer.';exportStatus(message,true);toast(message);return;}
  busy=true;updateCounts();$('exportPdf').textContent='PDF wird erstellt …';exportStatus('Dein PDF wird erstellt. Bei vielen Positionen kann das etwas dauern.');
  try{
    await saveNow();const result=await api('/api/export',snapshot()),download=result.download_url||result.url+'?download=1';
    $('pdfSummary').textContent=`${result.figures} Positionen · ${result.pages} Seiten`;
    $('downloadPdf').href=download;$('downloadPdf').download=result.filename;$('openPdf').href=result.url;$('pdfFrame').src=result.url;
    $('pdfPath').textContent=result.saved_path||'';$('pdfLocation').hidden=!result.saved_path;
    $('pdfResult').replaceChildren(make('span','',`${result.figures} Positionen, ${result.pages} Seiten. `));
    const save=make('a','','PDF herunterladen');save.href=download;save.download=result.filename;
    const open=make('a','','PDF öffnen');open.href=result.url;open.target='_blank';open.rel='noopener';
    $('pdfResult').append(save,document.createTextNode(' · '),open);$('pdfResult').hidden=false;
    exportStatus('Dein PDF ist auf diesem Mac gespeichert und steht zum Herunterladen bereit.');$('preview').showModal();
  }catch(error){exportStatus(error.message,true);toast(error.message);}
  finally{busy=false;$('exportPdf').textContent='PDF erstellen';updateCounts();}
}
async function init(){try{
  data=await api('/api/data');figures=data.figures;catalog=data.catalog;setState(data.state);buildGallery();const seqs=new Map();for(const r of figures)if(!seqs.has(r.sequence))seqs.set(r.sequence,r.de);for(const [value,name] of seqs){const option=make('option','',String(value).padStart(2,'0')+' · '+name);option.value=value;$('sequence').append(option);}fillCategorySelects();renderCatalogEditor();await collections();filter();$('saveStatus').textContent='Auf diesem Mac gespeichert';
  $('search').addEventListener('input',filter);$('sequence').addEventListener('change',filter);$('onlySelected').addEventListener('change',filter);
  $('selectFiltered').onclick=()=>{for(const row of figures)if(matching(row))selected.add(row.id);changed();filter();};$('clearSelection').onclick=()=>{selected.clear();changed();filter();};
  for(const id of ['title','mode','layout'])$(id).addEventListener(id==='title'?'input':'change',()=>{state[id]=$(id).value;changed();});$('exportPdf').onclick=exportPdf;
  $('editSelected').onchange=()=>setSelected(active.id,$('editSelected').checked);$('freeText').oninput=()=>{note(active.id).text=$('freeText').value;changed();};for(const [side,id] of [['l','phaseL'],['r','phaseR']])$(id).onchange=()=>{const n=note(active.id);if($(id).value)n.phases[side]=$(id).value;else delete n.phases[side];changed();};
  for(const id of ['closeEditor','doneEditor'])$(id).onclick=()=>{$('editor').close();saveNow();};$('previous').onclick=()=>openEditor(figures[figures.indexOf(active)-1].id);$('next').onclick=()=>openEditor(figures[figures.indexOf(active)+1].id);
  $('catalogOpen').onclick=()=>{$('catalogDialog').showModal();};$('closeCatalog').onclick=()=>$('catalogDialog').close();$('catalogEntry').onchange=showCatalogEntry;
  $('bulkAdd').onclick=async()=>{const texts=$('bulkText').value.split(/\r?\n/).map(s=>s.trim().replace(/^[-*•]\s+/,'' )).filter(Boolean);if(!texts.length)return toast('Bitte mindestens eine Anmerkung eintragen.');try{await saveCatalog([...catalog,...texts.map(text=>({id:'e-'+crypto.randomUUID(),category:$('bulkCategory').value,text}))]);$('bulkText').value='';toast(`${texts.length} Einträge hinzugefügt.`);}catch(e){toast(e.message);}};
  $('updateEntry').onclick=async()=>{const id=$('catalogEntry').value;try{await saveCatalog(catalog.map(e=>e.id===id?{...e,category:$('entryCategory').value.trim(),text:$('entryText').value.trim()}:e));toast('Eintrag aktualisiert.');}catch(e){toast(e.message);}};
  $('quickAdd').onclick=async()=>{const text=$('quickText').value.trim();if(!text)return toast('Bitte einen Anmerkungstext eingeben.');const entry={id:'e-'+crypto.randomUUID(),category:$('quickCategory').value,text};try{await saveCatalog([...catalog,entry]);note(active.id).checked.push(entry.id);$('quickText').value='';changed();renderChoices();toast('Anmerkung hinzugefügt und ausgewählt.');}catch(e){toast(e.message);}};
  $('saveCollection').onclick=async()=>{try{await saveNow();const result=await api('/api/collections',{name:$('collectionName').value,state:snapshot()});await collections();$('collections').value=result.id;toast('Sammlung gespeichert.');}catch(e){toast(e.message);}};
  $('loadCollection').onclick=async()=>{if(!$('collections').value)return toast('Bitte eine gespeicherte Sammlung wählen.');try{await saveNow();const value=await api('/api/collections/'+$('collections').value);await adopt(value.state,value.catalog);}catch(e){toast(e.message);}};
  $('downloadState').onclick=()=>{const blob=new Blob([JSON.stringify({format:'hla-form-generator',version:1,state:snapshot(),catalog},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download='Taiji-Sammlung-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  $('uploadState').onclick=()=>$('importFile').click();$('importFile').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>4_000_000)throw Error('Die Sicherungsdatei ist zu groß.');const value=JSON.parse(await file.text());if(value.format!=='hla-form-generator'||!value.state)throw Error('Bitte eine Sicherung des Form-Generators auswählen.');await saveNow();await adopt(value.state,value.catalog);}catch(e){toast(e.message);}finally{event.target.value='';}};
  $('closePreview').onclick=()=>$('preview').close();window.addEventListener('beforeunload',event=>{if(savedRevision<revision){event.preventDefault();event.returnValue='';}});
}catch(error){$('saveStatus').textContent='Nicht geladen';toast(error.message);}}
init();
