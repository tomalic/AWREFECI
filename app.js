/* Mobile finder v4: new UI, centered; search by EAN last4 or 5-digit Barra */
const LS_KEY = "ean_lookup_products_v1";
let products = [];
let colMap = {};

const synonyms = {
  ean: ['ean','ean13','código ean','codigo ean','barcode','codi ean','codi de barres','código de barras','codigo de barras'],
  rapid: ['id','id rapida','id rápida','identificacion rapida','identificación rápida','id_rapida','id_rápida','quick id','num id','num identificacion rapida','número identificacion rapida'],
  ref11: ['ref11','ref 11','referencia 11','nuestra referencia','referencia','referencia interna','ref','ref.'],
  dept: ['departamento','dept','depto','departament'],
  fam: ['familia','family'],
  barra: ['barra','barra5','codigo5','código5','bar'],
  nombre: ['nombre','producto','titulo','título','name','product name','nom','article','artículo','descripción corta','descripcion corta'],
  descripcion: ['descripcion','descripción','description','descripcio'],
  foto: ['foto','imagen','image','photo','picture','url imagen','url imagen producto','img','image url','foto url','imagen url']
};

function normalize(s){return (s||'').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function findColumn(headerRow, keys){
  const hdrs = headerRow.map(h => normalize(h));
  for (const key of keys){const idx = hdrs.indexOf(normalize(key)); if (idx !== -1) return headerRow[idx];}
  for (let i=0;i<hdrs.length;i++){const h=hdrs[i]; for (const key of keys){if (h.includes(normalize(key))) return headerRow[i];}}
  return null;
}
function buildColumnMap(headers){
  return {
    ean: findColumn(headers, synonyms.ean),
    rapid: findColumn(headers, synonyms.rapid),
    ref11: findColumn(headers, synonyms.ref11),
    dept: findColumn(headers, synonyms.dept),
    fam: findColumn(headers, synonyms.fam),
    barra: findColumn(headers, synonyms.barra),
    nombre: findColumn(headers, synonyms.nombre),
    descripcion: findColumn(headers, synonyms.descripcion),
    foto: findColumn(headers, synonyms.foto)
  };
}
function computeRef11(row){
  const d = ((colMap.dept && row[colMap.dept]) || '').toString().padStart(3,'0').slice(-3);
  const f = ((colMap.fam  && row[colMap.fam ]) || '').toString().padStart(3,'0').slice(-3);
  const b = ((colMap.barra&& row[colMap.barra])|| '').toString().padStart(5,'0').slice(-5);
  const composed = d && f && b ? `${d}${f}${b}` : '';
  return composed.length===11 ? composed : '';
}
function loadFromLocalStorage(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    products = parsed.rows || [];
    colMap = parsed.colMap || {};
  }catch(e){console.error(e);}
}
function saveToLocalStorage(){try{localStorage.setItem(LS_KEY, JSON.stringify({rows:products,colMap}));}catch(e){console.error(e);}}
function clearData(){
  products=[]; colMap={};
  localStorage.removeItem(LS_KEY);
  document.getElementById('results').innerHTML='';
  toast('Datos borrados de este navegador.','warning');
}
function parseWorkbookToRows(workbook){
  const sheetName=workbook.SheetNames[0];
  const sheet=workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet,{defval:''});
}
function handleFile(file){
  const name=file.name.toLowerCase();
  const reader=new FileReader();
  reader.onload=(e)=>{
    try{
      if (name.endsWith('.xlsx')){
        const data=new Uint8Array(e.target.result);
        const wb=XLSX.read(data,{type:'array'});
        products=parseWorkbookToRows(wb);
      }else if (name.endsWith('.csv')){
        const text=new TextDecoder().decode(e.target.result);
        const wb=XLSX.read(text,{type:'string'});
        products=parseWorkbookToRows(wb);
      }else{throw new Error('Formato no soportado.');}
      if (!products.length) throw new Error('El archivo no contiene filas.');
      const headers=Object.keys(products[0]);
      colMap=buildColumnMap(headers);
      products=products.map(row=>{
        const out={...row};
        if ((!colMap.ref11 || !out[colMap.ref11]) && colMap.dept && colMap.fam && colMap.barra){
          const ref=computeRef11(row);
          if (ref){ if (!colMap.ref11) colMap.ref11='Ref11'; out[colMap.ref11]=ref; }
        }
        return out;
      });
      saveToLocalStorage();
      toast(`Cargadas ${products.length} filas.`,'success');
      const v=document.getElementById('ean').value.trim();
      if (v.length>=4) doSearch(v);
    }catch(err){console.error(err); toast(`Error al procesar el archivo: ${err.message}`,'danger');}
  };
  reader.readAsArrayBuffer(file);
}
function sanitizeDigits(s){return (s||'').toString().replace(/\D/g,'');}
function doSearch(input){
  const resultsEl=document.getElementById('results');
  resultsEl.innerHTML='';
  if (!products.length){resultsEl.innerHTML='<div class="alert alert-warning text-center mx-auto" style="max-width:520px">Primero carga datos (Excel o CSV).</div>'; return;}
  const raw=sanitizeDigits(input);
  if (raw.length<4){resultsEl.innerHTML='<div class="alert alert-secondary text-center mx-auto" style="max-width:520px">Introduce 4 (EAN) o 5 (Barra) dígitos.</div>'; return;}

  const eanCol=colMap.ean;
  const barraCol=colMap.barra;
  let matches=[];

  if (raw.length===4 && eanCol){
    matches=products.filter(r=>{
      const ean=(r[eanCol]??'').toString().replace(/\D/g,'');
      return ean.slice(-4)===raw;
    });
  } else if (raw.length===5 && barraCol){
    matches=products.filter(r=>{
      const b=(r[barraCol]??'').toString().replace(/\D/g,'').padStart(5,'0').slice(-5);
      return b===raw;
    });
  } else if (eanCol){
    // fallback: try EAN contains
    matches=products.filter(r=>((r[eanCol]??'')+'').includes(raw));
  }

  if (!matches.length){
    resultsEl.innerHTML=`<div class="alert alert-warning text-center mx-auto" style="max-width:520px">Sin coincidencias para “${raw}”.</div>`;
    return;
  }

  // Sort by ID rápida then nombre
  const rapidCol=colMap.rapid;
  const nombreCol=colMap.nombre;
  const eanC=eanCol;
  matches.sort((a,b)=>{
    const ra=(rapidCol?(a[rapidCol]??'').toString():'').padStart(10,'0');
    const rb=(rapidCol?(b[rapidCol]??'').toString():'').padStart(10,'0');
    if (ra!==rb) return ra.localeCompare(rb);
    const na=(nombreCol?(a[nombreCol]??'').toString():'');
    const nb=(nombreCol?(b[nombreCol]??'').toString():'');
    return na.localeCompare(nb,'es');
  });

  for (const row of matches){
    const ean=row[eanC]??'';
    const rapid=rapidCol?(row[rapidCol]??''):'';
    const ref11=colMap.ref11?(row[colMap.ref11]??''):computeRef11(row);
    const nombre=nombreCol?(row[nombreCol]??''):'';
    const desc=colMap.descripcion?(row[colMap.descripcion]??''):'';
    const fotoUrl=colMap.foto?(row[colMap.foto]??''):'';
    const imgHtml = isValidImageUrl(fotoUrl) ? `<img class="product-img" src="${fotoUrl}" alt="Foto">` : '';

    const card=document.createElement('div'); card.className='card mx-auto'; card.style.maxWidth='680px';
    card.innerHTML=`
      <div class="card-body">
        <div class="text-center mb-2">
          <div class="big-id">${rapid || '—'}</div>
          <div class="small text-muted">ID rápida</div>
        </div>
        <div class="header-wrap mb-2">
          ${imgHtml}
          <div class="text-center">
            <h5 class="card-title mb-1">${nombre || 'Producto'}</h5>
            ${desc ? `<div class="small text-muted">${desc}</div>` : ''}
          </div>
        </div>
        <div class="text-center mt-2">
          <div class="text-muted small">Ref. (11 dígitos)</div>
          <div class="fw-bold ref-badge">${ref11 || '—'}</div>
        </div>
        <div class="text-center mt-2">
          <span class="badge text-bg-light">${ean}</span>
        </div>
      </div>`;
    resultsEl.appendChild(card);
  }
}

function isValidImageUrl(u){
  if (!u) return false;
  try{ const url = new URL(u, window.location.href); return ['http:','https:','data:','blob:'].includes(url.protocol); }
  catch{ return false; }
}
function toast(msg, type='info'){
  const el=document.createElement('div');
  el.className=`alert alert-${type}`;
  el.style.position='fixed'; el.style.left='50%'; el.style.transform='translateX(-50%)';
  el.style.bottom='16px'; el.style.zIndex='9999'; el.style.maxWidth='90%';
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2500);
}

// PWA & events
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault(); deferredPrompt=e; const btn=document.getElementById('btnInstall'); btn.classList.remove('d-none'); btn.addEventListener('click', async ()=>{btn.classList.add('d-none'); if (deferredPrompt){deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null;}});});
if ('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('service-worker.js').catch(console.error);});}
document.addEventListener('DOMContentLoaded',()=>{
  loadFromLocalStorage();
  document.getElementById('fileInput').addEventListener('change',(e)=>{const file=e.target.files[0]; if (file) handleFile(file);});
  const eanInput=document.getElementById('ean');
  eanInput.addEventListener('input',()=>{
    const v=eanInput.value.replace(/\D/g,'');
    eanInput.value=v.slice(0,5);
    if (eanInput.value.length>=4) doSearch(eanInput.value);
    else document.getElementById('results').innerHTML='';
  });
  document.getElementById('btnBorrar').addEventListener('click',clearData);
});
