'use strict';
window.HLAPdf = (() => {
  const MM=72/25.4, PPU=35.8174762130198, PW=210*MM, PH=297*MM;
  const DEFAULT='Chen Stil Tàijíquán · Chénshì Tàijíquán 陈氏太极拳 · Xīnjià Yīlù 新架一路';
  const buffers = new Map();
  async function binary(path) {
    if (!buffers.has(path)) buffers.set(path,fetch(path).then(async r=>{
      if(!r.ok)throw Error('Eine benötigte Datei konnte nicht geladen werden: '+path);
      return new Uint8Array(await r.arrayBuffer());
    }).catch(e=>{buffers.delete(path);throw e;}));
    return buffers.get(path);
  }
  function notes(row,user,preset,catalog,phases) {
    const lines=[], checked=new Set(user.checked || []);
    const ownBamen=catalog.some(e=>checked.has(e.id)&&e.category==='Bā Mén');
    if(preset&&!ownBamen) {
      lines.push('Bā Mén: '+row.bamen.label);
      if(row.bamen.methods?.length&&row.bamen.reason)lines.push(row.bamen.reason);
    }
    for(const [side,label] of [['l','Linker Arm'],['r','Rechter Arm']]) {
      if(preset||user.phases?.[side]) {
        const phase=user.phases?.[side] || row.phases[side].phase;
        const tentative=row.phases[side].tentative&&!user.phases?.[side]&&!['unknown','transition','rest'].includes(phase);
        lines.push(label+': '+(phases[phase] || 'nicht eindeutig')+(tentative?' (möglich)':''));
      }
    }
    for(const e of catalog)if(checked.has(e.id))lines.push(e.category+': '+e.text);
    if(user.text?.trim())lines.push(user.text.trim());
    return lines.join('\n');
  }
  async function create(data,state,catalog,progress=()=>{}) {
    if(!window.PDFLib || !window.fontkit)throw Error('Die PDF-Funktion wurde noch nicht geladen. Bitte kurz warten oder die Seite neu öffnen.');
    const wanted=new Set(state.selected), rows=data.figures.filter(r=>wanted.has(r.id));
    if(!rows.length)throw Error('Bitte mindestens eine Position auswählen.');
    const per=state.layout==='side'?6:state.layout==='spacious'?2:4;
    const total=Math.ceil(rows.length/per), M=12*MM, top=PH-16*MM, footer=25*MM, gap=4*MM;
    const {PDFDocument,rgb}=PDFLib, doc=await PDFDocument.create();doc.registerFontkit(fontkit);
    progress('PDF-Schriften werden geladen …');
    const fontBytes=await Promise.all(['Lato-Regular.ttf','Lato-Bold.ttf','HLAKai-Formgenerator.ttf'].map(n=>binary('/assets/fonts/'+n)));
    const [regular,bold]=await Promise.all(fontBytes.slice(0,2).map(b=>doc.embedFont(b,{subset:true})));
    let kai=await doc.embedFont(fontBytes[2],{subset:false});
    const latinSet=new Set(regular.getCharacterSet());let kaiSet=new Set(kai.getCharacterSet());
    const corpus=[state.title||DEFAULT,...data.categories,...rows.flatMap(row=>[row.de,row.en,row.pinyin,row.hanzi||'',notes(row,state.notes[row.id]||{},state.mode==='annotated',catalog,data.phases)])].join('');
    if([...corpus].some(c=>!['\n','\r'].includes(c)&&!latinSet.has(c.codePointAt(0))&&!kaiSet.has(c.codePointAt(0)))) {
      progress('Zusätzliche chinesische Schriftzeichen werden geladen …');
      kai=await doc.embedFont(await binary('/assets/fonts/LXGWWenKai-Regular.ttf'),{subset:false});kaiSet=new Set(kai.getCharacterSet());
    }
    const ink=rgb(31/255,29/255,27/255), grey=rgb(115/255,108/255,99/255), line=rgb(220/255,213/255,201/255);
    const [logo]=await doc.embedPdf(await binary('/assets/logo.pdf'));
    const choose=(text,heavy=false)=>{
      const symbols=[...text].filter(c=>c!=='\n'&&c!=='\r').map(c=>c.codePointAt(0));
      if(symbols.every(c=>latinSet.has(c)))return heavy?bold:regular;
      if(symbols.every(c=>kaiSet.has(c)))return kai;
      throw Error('Ein Zeichen in deinem Text kann nicht dargestellt werden. Bitte Sonderzeichen oder Emojis entfernen.');
    };
    function wrap(text,width,size,font) {
      const lines=[];
      for(const paragraph of text.replace(/\r/g,'').split('\n')) {
        if(!paragraph){lines.push('');continue;}
        let lineText='';
        for(const word of paragraph.split(/\s+/)) {
          const trial=lineText?lineText+' '+word:word;
          if(font.widthOfTextAtSize(trial,size)<=width){lineText=trial;continue;}
          if(lineText){lines.push(lineText);lineText='';}
          if(font.widthOfTextAtSize(word,size)<=width){lineText=word;continue;}
          for(const letter of word) {
            if(lineText&&font.widthOfTextAtSize(lineText+letter,size)>width){lines.push(lineText);lineText='';}
            lineText+=letter;
          }
        }
        lines.push(lineText);
      }
      return lines;
    }
    function text(page,value,x,y,size=8,font=regular,color=ink) {if(value)page.drawText(value,{x,y,size,font,color});}
    function paragraph(page,value,x,topY,width,height,size=7.8,leading=9.8) {
      const font=choose(value), lines=wrap(value,width,size,font), used=lines.length*leading;
      if(used>height+.05)throw Error('Zu viel Anmerkungstext für diesen Bildplatz. Bitte kürzen oder „2 Figuren · viel Schreibraum“ wählen.');
      lines.forEach((value,i)=>text(page,value,x,topY-size-i*leading,size,font));return used;
    }
    function caption(page,row,x,topY,width,scale=1) {
      let y=topY;
      for(const [key,heavy,baseSize] of [['de',true,6],['en',false,5.5],['pinyin',false,6],['hanzi',false,6]]) {
        if(!row[key])continue;
        const size=baseSize*scale;
        const font=choose(row[key],heavy),lines=wrap(row[key],width,size,font);
        for(const value of lines){text(page,value,x+(width-font.widthOfTextAtSize(value,size))/2,y,size,font,key==='en'?grey:ink);y-=7.2*scale;}
      }
    }
    function heading(page) {
      if(state.title?.trim()) {
        const value=state.title.trim(),font=choose(value,true);
        if(font.widthOfTextAtSize(value,13)<=PW-2*M)text(page,value,M,PH-10*MM,13,font);
        else paragraph(page,value,M,PH-4.5*MM,PW-2*M,8.5*MM,10,11);
      } else {
        const parts=[['Chen Stil Tàijíquán · Chénshì Tàijíquán ',bold,13],['陈氏太极拳',kai,18],[' · Xīnjià Yīlù ',bold,13],['新架一路',kai,18]];
        const width=parts.reduce((sum,[s,f,z])=>sum+f.widthOfTextAtSize(s,z),0),scale=Math.min(1,(PW-2*M)/width);
        let x=M;for(const [value,font,size] of parts){text(page,value,x,PH-10*MM,size*scale,font);x+=font.widthOfTextAtSize(value,size*scale);}
      }
      page.drawLine({start:{x:M,y:PH-13*MM},end:{x:PW-M,y:PH-13*MM},color:line,thickness:.55});
    }
    doc.setTitle(state.title || DEFAULT);doc.setCreator('Healthlane Academy Formgenerator');
    const audit=[];
    for(let pi=0;pi<total;pi++) {
      const page=doc.addPage([PW,PH]);heading(page);
      const content=rows.slice(pi*per,(pi+1)*per);
      for(let slot=0;slot<content.length;slot++) {
        const row=content[slot],col=slot%2,lineIndex=Math.floor(slot/2),user=state.notes[row.id] || {};
        progress(`PDF wird erstellt: Position ${pi*per+slot+1} von ${rows.length} …`);
        let x,y,bottom,center,box,rh;
        if(state.layout==='side') {
          rh=(top-footer-2*gap)/3;const bw=52*MM,aw=35*MM;
          x=M+col*(bw+aw+2*gap);y=top-(lineIndex+1)*rh-lineIndex*gap;bottom=y+44;center=x+bw/2;
          caption(page,row,x,y+30,bw,.8);text(page,String(row.number),x,y+2,10,bold);
          box=[x+bw+gap,y,aw,rh];
        } else {
          rh=(top-footer-gap)/(per===4?2:1);const cell=(PW-2*M-gap)/2;
          x=M+col*(cell+gap);y=top-(lineIndex+1)*rh-lineIndex*gap;
          const bh=(per===4?38:146)*MM,capTop=y+bh+12*MM;
          box=[x,y,cell,bh];caption(page,row,x,capTop,cell);text(page,String(row.number),x,capTop+MM,10,bold);
          bottom=capTop+5*MM;center=x+cell/2;
        }
        const f=PPU/row.image.u,w=row.image.w*f,h=row.image.h*f,ix=center-w/2;
        if(bottom+h>y+rh-MM+.05)throw Error('Position '+row.number+' ist für dieses Raster zu hoch. Bitte vier Positionen pro Seite wählen.');
        if(state.layout==='side'&&(ix<x-(gap-MM)||ix+w>x+52*MM+gap-MM))throw Error('Position '+row.number+' ist für sechs Positionen zu breit. Bitte vier Positionen wählen.');
        const response=await fetch('/'+row.image.path);
        if(!response.ok)throw Error('Bild '+row.number+' konnte nicht geladen werden. Bitte erneut versuchen.');
        const image=await doc.embedJpg(await response.arrayBuffer());page.drawImage(image,{x:ix,y:bottom,width:w,height:h});
        const anchor=row.dantian,cx=ix+anchor.x*w,cy=bottom+h-anchor.y*h,r=anchor.radius_pt;
        for(const [xs,ys] of [[r,r*.35],[r*.36,r*.88]])page.drawEllipse({x:cx,y:cy,xScale:xs,yScale:ys,borderColor:rgb(.83,.15,.15),borderWidth:.85*1.15});
        const [bx,by,bw,bh]=box;
        page.drawRectangle({x:bx,y:by,width:bw,height:bh,borderColor:grey,borderWidth:.7});
        const value=state.mode==='plain'?'':notes(row,user,state.mode==='annotated',catalog,data.phases);
        let used=0;
        try {if(value)used=paragraph(page,value,bx+6,by+bh-8,bw-12,bh-16);}
        catch(error){throw Error('Position '+row.number+': '+error.message);}
        let ly=by+bh-8-8*MM;while(ly>by+bh-8-used-10)ly-=8*MM;
        while(ly>by+4){page.drawLine({start:{x:bx+6,y:ly},end:{x:bx+bw-6,y:ly},color:line,thickness:.4});ly-=8*MM;}
        audit.push({id:row.id,number:row.number,page:pi+1,bounds:[ix,bottom,ix+w,bottom+h],box,scale:f,dantian:{center:[cx,cy],radius:r,arrows:false}});
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      page.drawLine({start:{x:M,y:footer-MM},end:{x:PW-M,y:footer-MM},color:line,thickness:.4});
      paragraph(page,'Anmerkungskategorien: '+data.categories.join(' · '),M,footer-3*MM,PW-2*M,14*MM,6.1,7.4);
      const logoScale=7*MM/logo.height;page.drawPage(logo,{x:M,y:3.5*MM,width:logo.width*logoScale,height:7*MM});
      const footerText=`Seite ${pi+1} von ${total}`;text(page,footerText,PW-M-regular.widthOfTextAtSize(footerText,8),5.5*MM,8,regular,grey);
    }
    progress('PDF-Datei wird fertiggestellt …');
    return {bytes:await doc.save(),pages:total,figures:rows.length,audit};
  }
  return {create};
})();
