"""Lokaler Form-Generator. Keine externen Dienste, ausschließlich Loopback."""
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlparse,unquote,quote,parse_qs
import json,mimetypes,re,threading,uuid,argparse,webbrowser,unicodedata
from datetime import datetime
from tableau_pdf import ROOT,export_pdf,CATEGORIES,PHASES

LOCK=threading.Lock()
PDF_LOCK=threading.Lock()
USER=ROOT/'nutzer';USER.mkdir(exist_ok=True)
COLLECTIONS=USER/'sammlungen';COLLECTIONS.mkdir(exist_ok=True)
EXPORTS=ROOT/'exports';EXPORTS.mkdir(exist_ok=True)
ROWS=json.loads((ROOT/'data/figures.json').read_text())
IDS={r['id'] for r in ROWS}

def read(path,default):return json.loads(path.read_text()) if path.exists() else default
def write(path,value):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2));temp.replace(path)

def clean_state(state):
    if not isinstance(state,dict):raise ValueError('Ungültige Sammlung.')
    selected=state.get('selected',[])
    if not isinstance(selected,list) or len(selected)>len(IDS):raise ValueError('Ungültige Bildauswahl.')
    selected=list(dict.fromkeys(str(x) for x in selected))
    if set(selected)-IDS:raise ValueError('Die Sammlung enthält unbekannte Bildnummern.')
    notes=state.get('notes',{})
    if not isinstance(notes,dict):raise ValueError('Ungültige Anmerkungen.')
    cleaned={}
    for ident,note in notes.items():
        if ident not in IDS:continue
        if not isinstance(note,dict):raise ValueError('Ungültige Anmerkung.')
        checked=note.get('checked',[]);phases=note.get('phases',{})
        if not isinstance(checked,list) or not isinstance(phases,dict):raise ValueError('Ungültige Anmerkungsauswahl.')
        text=str(note.get('text',''))
        if len(text)>12000:raise ValueError('Eine Anmerkung ist länger als 12.000 Zeichen. Bitte kürzen oder auf mehrere Positionen verteilen.')
        cleaned[ident]={'text':text,'checked':[str(x)[:100] for x in checked[:1000]],'phases':{k:v for k,v in phases.items() if k in ['l','r'] and v in PHASES}}
    return {'version':1,'selected':selected,'notes':cleaned,'layout':state.get('layout','below'),'mode':state.get('mode','annotated'),'title':str(state.get('title',''))[:160]}

class Handler(BaseHTTPRequestHandler):
    def valid_host(self):return self.headers.get('Host') in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}']
    def response(self,data,status=200,kind='application/json; charset=utf-8',extra_headers=None):
        if not isinstance(data,bytes):data=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(data)))
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('Cache-Control','no-store')
        for key,value in (extra_headers or {}).items():self.send_header(key,value)
        self.end_headers();self.wfile.write(data)
    def catalog(self):return read(USER/'katalog.json',read(ROOT/'data/catalog.json',[]))
    def do_GET(self):
        if not self.valid_host():return self.response({'error':'Unzulässiger Host.'},403)
        route=unquote(urlparse(self.path).path)
        if route=='/api/health':return self.response({'app':'hla-form-generator','version':1,'root':str(ROOT),'figures':len(ROWS)})
        if route=='/api/data':
            rows=read(ROOT/'data/figures.json',ROWS)
            return self.response({'figures':rows,'catalog':self.catalog(),'categories':CATEGORIES,'phases':PHASES,'state':read(USER/'aktuell.json',{}),'count':len(rows)})
        if route=='/api/collections':
            return self.response([{'id':p.stem,'name':read(p,{}).get('name',p.stem)} for p in sorted(COLLECTIONS.glob('*.json'))])
        if re.fullmatch('/api/collections/[a-f0-9]{32}',route):
            path=COLLECTIONS/(route.rsplit('/',1)[1]+'.json')
            return self.response(read(path,{}),200 if path.exists() else 404)
        if route in ['/','/index.html']:path=ROOT/'web/index.html';base=ROOT/'web'
        elif route.startswith('/assets/'):base=ROOT/'assets';path=ROOT/route.lstrip('/')
        elif route.startswith('/exports/'):base=EXPORTS;path=ROOT/route.lstrip('/')
        elif route in ['/app.js','/style.css']:base=ROOT/'web';path=base/route.lstrip('/')
        else:return self.response({'error':'Datei nicht gefunden.'},404)
        try:path=path.resolve();path.relative_to(base.resolve())
        except ValueError:return self.response({'error':'Unzulässiger Pfad.'},403)
        if not path.is_file():return self.response({'error':'Datei nicht gefunden.'},404)
        headers={}
        if route.startswith('/exports/') and parse_qs(urlparse(self.path).query).get('download')==['1']:
            headers['Content-Disposition']='attachment; filename="Taiji-Auswahl.pdf"; filename*=UTF-8\'\''+quote(path.name,safe='')
        return self.response(path.read_bytes(),kind=(mimetypes.guess_type(path.name)[0] or 'application/octet-stream')+('; charset=utf-8' if path.suffix in ['.html','.js','.css'] else ''),extra_headers=headers)
    def do_POST(self):
        if not self.valid_host():return self.response({'error':'Unzulässiger Host.'},403)
        origin=self.headers.get('Origin')
        allowed=[f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}']
        if origin and origin not in allowed:return self.response({'error':'Nur lokale Anfragen erlaubt.'},403)
        if self.headers.get_content_type()!='application/json':return self.response({'error':'JSON erwartet.'},415)
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=4_000_000:raise ValueError('Datei zu groß oder leer.')
            payload=json.loads(self.rfile.read(length));route=urlparse(self.path).path
            if route=='/api/state':
                state=clean_state(payload)
                with LOCK:write(USER/'aktuell.json',state)
                return self.response({'saved':True})
            if route=='/api/catalog':
                if not isinstance(payload,list) or len(payload)>3000:raise ValueError('Ungültiger Anmerkungskatalog.')
                entries=[];seen=set()
                for e in payload:
                    ident=str(e['id'])[:100];category=str(e['category']).strip();text=str(e['text']).strip()
                    if len(category)>180 or len(text)>2000:raise ValueError('Kategorie oder Katalogtext zu lang; bitte kürzen.')
                    if ident in seen or not category or not text:raise ValueError('Leere oder doppelte Katalogeinträge.')
                    seen.add(ident);entries.append({'id':ident,'category':category,'text':text})
                with LOCK:write(USER/'katalog.json',entries)
                return self.response({'saved':True})
            if route=='/api/collections':
                name=str(payload.get('name','')).strip()[:160]
                if not name:raise ValueError('Bitte einen Namen für die Sammlung eingeben.')
                state=clean_state(payload['state']);ident=uuid.uuid4().hex
                with LOCK:write(COLLECTIONS/(ident+'.json'),{'name':name,'state':state,'catalog':self.catalog()})
                return self.response({'id':ident,'name':name})
            if route=='/api/export':
                state=clean_state(payload);mode=state['mode']
                if mode not in ['annotated','custom','plain']:raise ValueError('Unbekannte Ausgabeart.')
                with PDF_LOCK:data,audit=export_pdf(read(ROOT/'data/figures.json',ROWS),{'ids':state['selected'],'notes':state['notes'],'catalog':self.catalog(),'layout':state['layout'],'mode':mode,'preset':mode=='annotated','title':state['title']})
                stem=re.sub(r'[^\w-]+','-',unicodedata.normalize('NFC',state['title'] or 'Xinjia-Yilu-Auswahl')).strip('-')[:70] or 'Xinjia-Yilu-Auswahl'
                filename=stem+'-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:4]+'.pdf'
                (EXPORTS/filename).write_bytes(data)
                return self.response({'url':'/exports/'+filename,'download_url':'/exports/'+filename+'?download=1','filename':filename,'saved_path':str(EXPORTS/filename),'pages':audit['pages'],'figures':audit['figures']})
            return self.response({'error':'Unbekannte Funktion.'},404)
        except (ValueError,TypeError,KeyError,json.JSONDecodeError) as error:return self.response({'error':str(error)},400)
        except Exception as error:
            print(type(error).__name__,str(error),flush=True)
            return self.response({'error':'Die Verarbeitung ist fehlgeschlagen. Die bisherigen Eingaben bleiben gespeichert.'},500)
    def log_message(self,fmt,*args):
        if len(args)>1 and str(args[1]).startswith(('4','5')):super().log_message(fmt,*args)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--open',action='store_true');args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);print(f'Form-Generator: http://127.0.0.1:{args.port}',flush=True)
    if args.open:threading.Timer(.4,lambda:webbrowser.open(f'http://127.0.0.1:{args.port}')).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
