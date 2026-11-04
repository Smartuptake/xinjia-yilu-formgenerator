'use strict';
// Persönliche Eingaben bleiben im Browser. Dieser Adapter ersetzt die lokale API.
window.HLAOnline = (() => {
  const KEY = 'hla-xinjia-yilu-online-v1';
  let app, saved, previousPdf;
  const clone = value => structuredClone(value);
  async function load() {
    if (!app) {
      const response = await fetch('/data/app.json', {cache:'no-store'});
      if (!response.ok) throw Error('Die Positionen konnten nicht geladen werden. Bitte die Seite erneut öffnen.');
      app = await response.json();
      const raw = localStorage.getItem(KEY);
      try { saved = raw ? JSON.parse(raw) : {state:{}, catalog:app.catalog, collections:{}}; }
      catch { throw Error('Die gespeicherte Sammlung ist beschädigt. Bitte den Browserspeicher zunächst sichern.'); }
      if (!saved || !saved.state || !Array.isArray(saved.catalog) || !saved.collections) throw Error('Unbekanntes Speicherformat. Vorhandene Daten wurden nicht überschrieben.');
    }
    return app;
  }
  function persist(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { throw Error('Der Browser konnte die Eingaben nicht speichern. Bitte erlaube Website-Speicher oder sichere deine Sammlung über „Datei sichern“.'); }
    saved = next;
  }
  function cleanState(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.selected || [])) throw Error('Ungültige Sammlung.');
    const valid = new Set(app.figures.map(r=>r.id)), ids = [...new Set((input.selected || []).map(String))];
    if (ids.some(id=>!valid.has(id))) throw Error('Die Sammlung enthält unbekannte Positionen.');
    const notes = {};
    for (const [id,value] of Object.entries(input.notes || {})) {
      if (!valid.has(id)) continue;
      if (!value || typeof value !== 'object') throw Error('Ungültige Anmerkung.');
      const text = String(value.text || '');
      if (text.length > 12000) throw Error('Eine Anmerkung ist länger als 12.000 Zeichen.');
      notes[id] = {text, checked:Array.isArray(value.checked)?value.checked.slice(0,1000).map(String):[], phases:{}};
      for (const side of ['l','r']) if (Object.hasOwn(app.phases,value.phases?.[side])) notes[id].phases[side]=value.phases[side];
    }
    if (!['below','side','spacious'].includes(input.layout || 'below')) throw Error('Unbekannte Seitenaufteilung.');
    if (!['annotated','custom','plain'].includes(input.mode || 'annotated')) throw Error('Unbekannte Ausgabeart.');
    return {version:1, selected:ids, notes, layout:input.layout || 'below', mode:input.mode || 'annotated', title:String(input.title || '').slice(0,160)};
  }
  function cleanCatalog(entries) {
    if (!Array.isArray(entries) || entries.length>3000) throw Error('Ungültiger Anmerkungskatalog.');
    const seen = new Set();
    return entries.map(entry=>{
      const id=String(entry.id || '').slice(0,100), category=String(entry.category || '').trim(), text=String(entry.text || '').trim();
      if (!id || seen.has(id) || !category || !text || category.length>180 || text.length>2000) throw Error('Leere, doppelte oder zu lange Katalogeinträge.');
      seen.add(id);return {id,category,text};
    });
  }
  async function request(path, body) {
    await load();
    if (path==='/api/data') return {...clone(app), catalog:clone(saved.catalog), state:clone(saved.state)};
    if (path==='/api/state') {const state=cleanState(body);persist({...saved,state});return {saved:true};}
    if (path==='/api/catalog') {const catalog=cleanCatalog(body);persist({...saved,catalog});return {saved:true};}
    if (path==='/api/collections' && body===undefined) return Object.entries(saved.collections).map(([id,row])=>({id,name:row.name}));
    if (path==='/api/collections') {
      const name=String(body.name || '').trim().slice(0,160);
      if (!name) throw Error('Bitte einen Namen für die Sammlung eingeben.');
      const id=crypto.randomUUID().replaceAll('-',''), row={name,state:cleanState(body.state),catalog:clone(saved.catalog)};
      persist({...saved,collections:{...saved.collections,[id]:row}});return {id,name};
    }
    if (path.startsWith('/api/collections/')) {
      const row=saved.collections[path.split('/').pop()];
      if (!row) throw Error('Sammlung nicht gefunden.');return clone(row);
    }
    if (path==='/api/export') {
      const state=cleanState(body);
      if (!state.selected.length) throw Error('Bitte mindestens eine Position auswählen.');
      const result=await HLAPdf.create(app,state,saved.catalog,message=>{
        const status=document.getElementById('exportStatus');if(status)status.textContent=message;
      });
      if (previousPdf) URL.revokeObjectURL(previousPdf);
      previousPdf=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
      const stem=(state.title || 'Xinjia-Yilu-Auswahl').normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,70);
      return {url:previousPdf,download_url:previousPdf,filename:stem+'.pdf',pages:result.pages,figures:result.figures};
    }
    throw Error('Unbekannte Funktion.');
  }
  return {request};
})();
