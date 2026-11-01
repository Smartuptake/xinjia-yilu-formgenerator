"""Gemeinsamer lokaler PDF-Export: vollständige Tableaus und persönliche Auswahlen."""
from pathlib import Path
import io,json,math
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg

ROOT=Path(__file__).resolve().parent
PPU=35.8174762130198
DEFAULT_TITLE='Chen Stil Tàijíquán · Chénshì Tàijíquán 陈氏太极拳 · Xīnjià Yīlù 新架一路'
INK='#1F1D1B';GREY='#736C63';LINE='#DCD5C9'
CATEGORIES=['Aufrichtung','Stand','Gewicht','Fuß und Knie','Sechs Harmonien','Arme und Hände','Dāntián','hinteres Yāo (Hüfte/Taille)','vorderes Yāo (Hüfte/Taille)','Kuà','Leistenbeuge (fùgǔgōu)','Qi-Fluss Arme','Qi-Fluss Beine','Qi-Fluss unterer Rücken - oberer Rücken - Schulter - Ellbogen - Hand','Bā Mén','Tàiyáng','Shàoyáng','Tàiyīn','Shàoyīn','Blickrichtung','Yì','Atmung','Tempo und Fājìn','Anwendung','Häufige Fehler','Übergang']
PHASES={'shaoyang':'Shàoyáng','taiyang':'Tàiyáng / Lǎoyáng','shaoyin':'Shàoyīn','taiyin':'Tàiyīn / Lǎoyīn','transition':'Übergang / Zuordnung offen','unknown':'nicht eindeutig','rest':'äußerlich ruhig; Zuordnung offen'}

def init_fonts():
    if 'Lato' not in pdfmetrics.getRegisteredFontNames():
        for name,file in [('Lato','Lato-Regular.ttf'),('LatoB','Lato-Bold.ttf')]:pdfmetrics.registerFont(TTFont(name,str(ROOT/'assets/fonts'/file)))
    if 'KaiTitle' not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont('KaiTitle',str(ROOT/'assets/fonts/LXGWWenKai-Regular.ttf')))

def dantian_geometry(row,bounds):
    anchor=row['dantian'];x,y,right,top=bounds
    cx=x+anchor['x']*(right-x);cy=top-anchor['y']*(top-y);r=anchor['radius_pt']
    return {'center':[cx,cy],'horizontal':[cx-r,cy-r*.35,cx+r,cy+r*.35],'vertical':[cx-r*.36,cy-r*.88,cx+r*.36,cy+r*.88],'arrows':False}

def draw_dantian(c,row,bounds):
    geometry=dantian_geometry(row,bounds)
    c.saveState();c.setStrokeColorRGB(.83,.15,.15);c.setLineWidth(.85*1.15);c.setDash();c.setLineCap(1);c.setLineJoin(1)
    for key in ['horizontal','vertical']:c.ellipse(*geometry[key],stroke=1,fill=0)
    c.restoreState()

def para(c,text,x,top,width,max_height,size=8,leading=10):
    p=Paragraph(text,ParagraphStyle('body',fontName='Lato',fontSize=size,leading=leading,textColor=INK))
    _,h=p.wrap(width,max_height)
    if h>max_height+.05:raise ValueError('Zu viel Anmerkungstext für diesen Bildplatz. Bitte Text kürzen oder zwei Figuren pro Seite wählen.')
    p.drawOn(c,x,top-h)
    return h

def title_lines(c,row,x,top,width):
    y=top
    for key,font,size in [('de','LatoB',6.0),('en','Lato',5.5),('pinyin','Lato',6.0)]:
        text=row[key]
        if pdfmetrics.stringWidth(text,font,size)>width:
            # Lange Überschriften immer vollständig umbrechen, nie abschneiden.
            words=text.split();lines=[];line=''
            for word in words:
                trial=(line+' '+word).strip()
                if line and pdfmetrics.stringWidth(trial,font,size)>width:lines.append(line);line=word
                else:line=trial
            if line:lines.append(line)
        else:lines=[text]
        c.setFillColor(INK if key!='en' else GREY);c.setFont(font,size)
        for line in lines:c.drawCentredString(x+width/2,y,line);y-=7.2
    return top-y

def draw_figure(c,row,cx,bottom):
    im=row['image'];f=PPU/im['u'];w,h=im['w']*f,im['h']*f
    x=cx-w/2
    path=ROOT/im.get('pdf_path',im['path'])
    if im.get('cropped',False):c.drawImage(str(path),x,bottom,w,h)
    else:
        bb=im['bbox'];iw,ih=im['size']
        c.saveState();clip=c.beginPath();clip.rect(x,bottom,w,h);c.clipPath(clip,stroke=0,fill=0)
        c.drawImage(str(path),x-bb[0]*f,bottom-(ih-bb[3])*f,iw*f,ih*f)
        c.restoreState()
    bounds=[x,bottom,x+w,bottom+h]
    draw_dantian(c,row,bounds)
    return bounds

def note_text(row,user,preset,catalog):
    pieces=[]
    ids=set(user.get('checked',[]))
    own_bamen=any(e['id'] in ids and e['category']=='Bā Mén' for e in catalog)
    if preset and not own_bamen:
        pieces.append('<b>Bā Mén:</b> '+escape(row['bamen']['label']))
        if row['bamen']['methods'] and row['bamen']['reason']:pieces.append(escape(row['bamen']['reason']))
    for side,label in [('l','Linker Arm'),('r','Rechter Arm')]:
        if preset or side in user.get('phases',{}):
            val=user.get('phases',{}).get(side,row['phases'][side]['phase'])
            phase=PHASES.get(val,'nicht eindeutig')
            tentative=row['phases'][side].get('tentative',True) and side not in user.get('phases',{})
            pieces.append('<b>'+label+':</b> '+escape(phase)+(' (möglich)' if tentative and val not in ['unknown','transition','rest'] else ''))
    for entry in catalog:
        if entry['id'] in ids:pieces.append('<b>'+escape(entry['category'])+':</b> '+escape(entry['text']))
    if user.get('text','').strip():pieces.append(escape(user['text'].strip()).replace('\n','<br/>'))
    return '<br/>'.join(pieces)

def export_pdf(rows,options=None):
    init_fonts();options=options or {}
    # Sichtbare Nummern bleiben auch bei einer Teilauswahl die Nummern der Gesamtform.
    # Stabile interne IDs bewahren bereits gespeicherte persönliche Anmerkungen.
    rows=[{**row,'number':row.get('number',index)} for index,row in enumerate(rows,1)]
    ids=options.get('ids')
    if ids is not None:
        wanted=set(map(str,ids));rows=[r for r in rows if r['id'] in wanted]
        missing=wanted-set(r['id'] for r in rows)
        if missing:raise ValueError('Unbekannte Bildnummern: '+', '.join(sorted(missing)))
    if not rows:raise ValueError('Bitte mindestens eine Position auswählen.')
    mode=options.get('mode','annotated');layout=options.get('layout','below')
    if layout not in ['below','side','spacious']:raise ValueError('Unbekanntes Seitenraster.')
    per_page=6 if layout=='side' else (2 if layout=='spacious' else 4)
    buffer=io.BytesIO();c=canvas.Canvas(buffer,pagesize=A4)
    c.setTitle(options.get('title') or DEFAULT_TITLE)
    pw,ph=A4;M=12*mm;top=ph-16*mm;footer=25*mm;gap=4*mm
    pages=math.ceil(len(rows)/per_page)
    users=options.get('notes',{});catalog=options.get('catalog',[])
    logo=svg2rlg(str(ROOT/'assets/logo.svg'))
    audit=[]
    for page_index in range(pages):
        heading=options.get('title')
        c.setFillColor(INK)
        if not heading:
            parts=[('LatoB',13,'Chen Stil Tàijíquán · Chénshì Tàijíquán '),('KaiTitle',18,'陈氏太极拳'),('LatoB',13,' · Xīnjià Yīlù '),('KaiTitle',18,'新架一路')]
            width=sum(pdfmetrics.stringWidth(text,font,size) for font,size,text in parts)
            assert width<=pw-2*M,'Titel ist breiter als die Kopfzeile.'
            hx=M
            for font,size,text in parts:
                c.setFont(font,size);c.drawString(hx,ph-10*mm,text);hx+=pdfmetrics.stringWidth(text,font,size)
        else:
            c.setFont('LatoB',13)
            if pdfmetrics.stringWidth(heading,'LatoB',13)<=pw-2*M:c.drawString(M,ph-10*mm,heading)
            else:para(c,escape(heading),M,ph-4.5*mm,pw-2*M,8.5*mm,size=10,leading=11)
        c.setStrokeColor(LINE);c.setLineWidth(.55);c.line(M,ph-13*mm,pw-M,ph-13*mm)
        content=rows[page_index*per_page:(page_index+1)*per_page]
        for slot,row in enumerate(content):
            col=slot%2;line=slot//2
            user=users.get(row['id'],{})
            if layout=='side':
                rh=(top-footer-2*gap)/3;bw=52*mm;aw=35*mm
                x=M+col*(bw+aw+2*gap);y=top-(line+1)*rh-line*gap
                bottom=y+44
                bounds=draw_figure(c,row,x+bw/2,bottom)
                if bounds[3]>y+rh-1*mm:raise ValueError(f"Figur {row['number']} ist für sechs Positionen pro Seite zu hoch; bitte vier Positionen wählen.")
                if bounds[0]<x-(gap-mm) or bounds[2]>x+bw+gap-mm:raise ValueError(f"Figur {row['number']} ist für diesen Bildplatz zu breit; bitte vier Positionen wählen.")
                title_lines(c,row,x,y+30,bw)
                c.setFillColor(INK);c.setFont('LatoB',10);c.drawString(x,y+2,str(row['number']))
                box=(x+bw+gap,y,aw,rh)
            else:
                rh=(top-footer-gap)/(2 if per_page==4 else 1)
                cell=(pw-2*M-gap)/2;x=M+col*(cell+gap);y=top-(line+1)*rh-line*gap
                box_h=38*mm if per_page==4 else 146*mm
                box=(x,y,cell,box_h)
                cap_top=y+box_h+12*mm
                title_lines(c,row,x,cap_top,cell)
                c.setFillColor(INK);c.setFont('LatoB',10);c.drawString(x,cap_top+1*mm,str(row['number']))
                bottom=cap_top+5*mm
                bounds=draw_figure(c,row,x+cell/2,bottom)
                if bounds[3]>y+rh-1*mm:raise ValueError(f"Figur {row['number']} ist im gewählten Raster zu hoch.")
            bx,by,bw,bh=box
            c.setStrokeColor(GREY);c.setLineWidth(.7);c.roundRect(bx,by,bw,bh,4,stroke=1,fill=0)
            text='' if mode=='plain' else note_text(row,user,options.get('preset',True),catalog)
            used=0
            if text:
                used=para(c,text,bx+6,by+bh-8,bw-12,bh-16,size=7.8,leading=9.8)
            c.setStrokeColor(LINE);c.setLineWidth(.4);ly=by+bh-8-8*mm
            while ly>by+bh-8-used-10:ly-=8*mm
            while ly>by+4:c.line(bx+6,ly,bx+bw-6,ly);ly-=8*mm
            audit.append({'id':row['id'],'number':row['number'],'page':page_index+1,'image_bounds':bounds,'box_bounds':list(box),'scale':PPU/row['image']['u'],'u':row['image']['u'],'dantian':dantian_geometry(row,bounds)})
        # Kategorien, Logo und Seitenzahl in beiden Fassungen identisch.
        c.setStrokeColor(LINE);c.line(M,footer-1*mm,pw-M,footer-1*mm)
        para(c,'<b>Anmerkungskategorien:</b> '+escape(' · '.join(CATEGORIES)),M,footer-3*mm,pw-2*M,14*mm,size=6.1,leading=7.4)
        k=7*mm/logo.height;c.saveState();c.translate(M,3.5*mm);c.scale(k,k);renderPDF.draw(logo,c,0,0);c.restoreState()
        c.setFillColor(GREY);c.setFont('Lato',8);c.drawRightString(pw-M,5.5*mm,f'Seite {page_index+1} von {pages}')
        c.showPage()
    c.save()
    return buffer.getvalue(),{'pages':pages,'figures':len(rows),'layout':layout,'mode':mode,'audit':audit,'caption_sizes':[6,5.5,6],'timestamps':False,'body_unit_pt':PPU,'dantian_ellipses':2*len(rows),'direction_arrows':0,'default_title':DEFAULT_TITLE,'chinese_title_font':'LXGW WenKai (Kai)' }

if __name__=='__main__':
    import argparse
    ap=argparse.ArgumentParser();ap.add_argument('--all',action='store_true');args=ap.parse_args()
    rows=json.loads((ROOT/'data/figures.json').read_text())
    if len(rows)!=621:raise ValueError('Die vollständige Ausgabe benötigt alle 621 Figuren.')
    for name,mode,layout in [('Xinjia Yilu 621 Positionen - Anmerkungen.pdf','annotated','below'),('Xinjia Yilu 621 Positionen - schlicht.pdf','plain','below')]:
        data,report=export_pdf(rows,{'mode':mode,'layout':layout})
        (ROOT/name).write_bytes(data);(ROOT/(name+'.pruefung.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(name,report['pages'],report['figures'])
