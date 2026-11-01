"""Doppelklick-Starter: vorhandene Instanz verwenden oder lokal starten."""
from pathlib import Path
import sys,subprocess,urllib.request,json,time,webbrowser
ROOT=Path(__file__).resolve().parent
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def health(port):
    try:
        with OPENER.open(f'http://127.0.0.1:{port}/api/health',timeout=.3) as r:return json.load(r)
    except Exception:return None
def main():
    for port in range(8765,8786):
        h=health(port)
        if h and h.get('app')=='hla-form-generator' and h.get('root')==str(ROOT):
            webbrowser.open(f'http://127.0.0.1:{port}');return
    log=ROOT/'nutzer/server.log';log.parent.mkdir(exist_ok=True)
    for port in range(8765,8786):
        if health(port):continue
        with log.open('ab') as output:
            process=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--port',str(port)],cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
        for _ in range(30):
            if process.poll() is not None:break
            h=health(port)
            if h and h.get('root')==str(ROOT):webbrowser.open(f'http://127.0.0.1:{port}');return
            time.sleep(.2)
    raise RuntimeError('Der lokale Generator konnte nicht starten. Einzelheiten stehen in nutzer/server.log.')
if __name__=='__main__':main()
