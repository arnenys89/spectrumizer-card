/* Spectrumizer: live FFT line spectrum and waterfall history. */
class SpectrumizerCard extends HTMLElement {
  constructor() {
    super();
    this._zoom = 1;
    this._pan = 0;
    this._drag = null;
  }
  setConfig(config) {
    if (!config || !config.entity) throw new Error("Geef een Spectrumizer-sensor op via 'entity'.");
    this.config = {name:"Live spectrum", max_frequency:null, history_frames:80, ...config};
    if (!this.shadowRoot) this.attachShadow({mode:"open"});
    this._render();
  }
  set hass(hass) { this._hass=hass; this._render(); }
  getCardSize() { return 8; }

  _render() {
    if (!this.shadowRoot || !this._hass || !this.config) return;
    const state=this._hass.states[this.config.entity], a=state?.attributes||{};
    const fs=a.frequencies||[], ms=a.magnitudes||[], hist=a.history||[];
    const ready=a.ready===true && fs.length===ms.length && fs.length>1;
    const peak=state&&!["unknown","unavailable"].includes(state.state)?Number(state.state):null;
    const baseMaxF=Number(this.config.max_frequency)>0?Number(this.config.max_frequency):(Number(a.sampling_rate_hz)/2||1);
    const span=baseMaxF/this._zoom;
    const center=baseMaxF/2+this._pan*baseMaxF;
    const minF=Math.max(0,Math.min(baseMaxF-span,center-span/2));
    const maxF=Math.min(baseMaxF,minF+span);
    this.shadowRoot.innerHTML=`
      <ha-card header="${this._esc(this.config.name)}"><div class="content">
        <div class="summary">
          <div><small>Dominante frequentie</small><strong>${Number.isFinite(peak)?peak.toFixed(3)+" Hz":"—"}</strong></div>
          <div><small>Samples</small><strong>${a.samples_collected??0} / ${a.window_size??"—"}</strong></div>
          <div><small>Resolutie</small><strong>${a.frequency_resolution_hz??"—"} Hz</strong></div>
        </div>
        <details class="settings"><summary>Instellingen</summary>
          <div class="settings-grid">
            <label>Minimum frequentie (Hz)<input id="min-frequency" type="number" min="0.0001" step="any" value="${this.config.min_frequency??0.01}"></label>
            <label>Maximum frequentie (Hz)<input id="max-frequency" type="number" min="0.001" step="any" value="${this.config.max_frequency??baseMaxF}"></label>
            <label>Geschiedenisframes<input id="history-frames" type="number" min="1" max="20" value="${this.config.history_frames??20}"></label>
            <label>Contrast spectrogram<input id="contrast" type="range" min="10" max="100" step="5" value="${this.config.contrast??40}"><small id="contrast-value">${this.config.contrast??40}%</small></label>
            <label>Hoogte spectrogram (px)<input id="waterfall-height" type="number" min="120" max="700" step="20" value="${this.config.waterfall_height??300}"></label>
            <label>Frequentiepunten geschiedenis<input id="history-bins" type="number" min="16" max="513" step="1" value="${a.history_frequency_bins??129}"></label>
            <label>Samplefrequentie (Hz)<input id="sampling-rate" type="number" min="0.1" max="100" step="0.1" value="${a.sampling_rate_hz??10}"></label>
            <label>FFT-venstergrootte<select id="window-size">${[32,64,128,256,512,1024].map(n=>`<option value="${n}" ${Number(a.window_size??256)===n?'selected':''}>${n}</option>`).join("")}</select></label>
          </div>
          <div class="settings-actions"><button id="apply-display" type="button">Weergave toepassen</button><button id="apply-fft" type="button">FFT-instellingen opslaan</button><small id="settings-status" role="status"></small></div>
        </details>
        <div class="zoom-controls" aria-label="Frequentiezoom">
          <span>Frequentiezoom</span>
          <button id="zoom-out" type="button" title="Uitzoomen" aria-label="Uitzoomen">−</button>
          <button id="zoom-in" type="button" title="Inzoomen" aria-label="Inzoomen">+</button>
          <button id="zoom-reset" type="button" title="Zoom herstellen">Reset</button>
          <small>${this._zoom.toFixed(1)}×</small>
        </div>
        ${ready?this._spectrum(fs,ms,minF,maxF):'<div class="empty">Samples verzamelen… Het spectrum verschijnt zodra het venster gevuld is.</div>'}
        <div class="section-title">Geschiedenis · spectrogram</div>
        ${hist.length?'<canvas id="waterfall" width="720" height="300"></canvas><div class="timeaxis"><span>Ouder</span><span>Tijd →</span><span>Nu</span></div>':'<div class="empty short">De geschiedenis wordt opgebouwd na de eerste FFT-berekening.</div>'}
        <div class="footer">${this._esc(a.source_entity||"")} · ${a.sampling_rate_hz??"—"} samples/s · ${hist.length} geschiedenisframes</div>
      </div></ha-card>
      <style>
        :host{display:block}.content{padding:12px 14px 14px}.summary{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:12px}
        .summary>div{display:flex;flex-direction:column;gap:4px;min-width:90px}.zoom-controls{display:flex;align-items:center;gap:8px;margin:4px 0 8px}.zoom-controls span{font-size:12px;color:var(--secondary-text-color);margin-right:auto}.zoom-controls button{min-width:32px;height:30px;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:18px;cursor:pointer}.zoom-controls button:last-of-type{font-size:12px;padding:0 10px}.zoom-controls button:disabled{opacity:.35;cursor:default}.zoom-controls small,.footer,.timeaxis{color:var(--secondary-text-color);font-size:12px}
        strong{font-size:17px;font-weight:500}.section-title{font-size:14px;font-weight:500;margin:14px 0 6px}
        svg{display:block;width:100%;height:auto}canvas{display:block;width:100%;height:${Math.max(120,Math.min(700,Number(this.config.waterfall_height)||300))}px;background:#080b0b}
        .settings{margin:10px 0;padding:8px;border:1px solid var(--divider-color);border-radius:8px}.settings summary{cursor:pointer;font-size:13px;font-weight:500}.settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:12px 0}.settings-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color)}.settings-grid input,.settings-grid select{box-sizing:border-box;width:100%;min-width:0;padding:7px;border:1px solid var(--divider-color);border-radius:5px;background:var(--card-background-color);color:var(--primary-text-color)}.settings-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.settings-actions button{padding:7px 10px;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer}.settings-actions small{font-size:12px;color:var(--secondary-text-color)}\n        .timeaxis{display:flex;justify-content:space-between;padding:4px 0}.empty{min-height:180px;display:grid;place-items:center;text-align:center;color:var(--secondary-text-color)}
        .short{min-height:70px}.footer{margin-top:10px;overflow-wrap:anywhere}
      </style>`;
    const zoomIn=this.shadowRoot.getElementById("zoom-in");
    const zoomOut=this.shadowRoot.getElementById("zoom-out");
    const zoomReset=this.shadowRoot.getElementById("zoom-reset");
    if(zoomIn)zoomIn.addEventListener("click",()=>{this._zoom=Math.min(32,Math.round(this._zoom*1.5*100)/100);this._render();});
    if(zoomOut)zoomOut.addEventListener("click",()=>{this._zoom=Math.max(1,Math.round(this._zoom/1.5*100)/100);this._render();});
    if(zoomReset)zoomReset.addEventListener("click",()=>{this._zoom=1;this._pan=0;this._render();});
    const contrast=this.shadowRoot.getElementById("contrast");
    if(contrast)contrast.addEventListener("input",()=>{this.shadowRoot.getElementById("contrast-value").textContent=contrast.value+"%";});
    const display=this.shadowRoot.getElementById("apply-display");
    if(display)display.addEventListener("click",()=>{
      const v=id=>Number(this.shadowRoot.getElementById(id).value);
      this.config={...this.config,min_frequency:Math.max(0.0001,v("min-frequency")),max_frequency:Math.max(0.001,v("max-frequency")),history_frames:Math.max(1,Math.min(20,v("history-frames"))),contrast:v("contrast"),waterfall_height:Math.max(120,Math.min(700,v("waterfall-height")))};
      this._render();
    });
    const fft=this.shadowRoot.getElementById("apply-fft");
    if(fft)fft.addEventListener("click",async()=>{
      const status=this.shadowRoot.getElementById("settings-status");
      const number=id=>Number(this.shadowRoot.getElementById(id).value);
      try{
        await this._hass.callService("spectrumizer","set_options",{
          source_entity:a.source_entity,
          sampling_rate:number("sampling-rate"),
          window_size:number("window-size"),
          history_bins:number("history-bins")
        });
        status.textContent="FFT-instellingen opgeslagen. De integratie wordt opnieuw geladen.";
      }catch(err){status.textContent="Opslaan mislukt: "+(err.message||String(err));}
    });
    if(hist.length)this._drawWaterfall(fs,hist,minF,maxF);
    this._bindPanZoom();
  }

  _spectrum(fs,ms,minF,maxF) {
    const W=720,H=240,L=48,R=12,T=12,B=32,pw=W-L-R,ph=H-T-B;
    const pts=fs.map((f,i)=>({f:Number(f),m:Number(ms[i])})).filter(p=>Number.isFinite(p.f)&&Number.isFinite(p.m)&&p.f>=minF&&p.f<=maxF);
    if(!pts.length)return '<div class="empty">Geen spectrumdata beschikbaar.</div>';
    const db=m=>20*Math.log10(Math.max(m,1e-7));
    const vals=pts.map(p=>db(p.m)), hi=Math.max(-20,Math.ceil(Math.max(...vals)/10)*10), lo=Math.min(-120,Math.floor(Math.min(...vals)/10)*10);
    const y=v=>T+(hi-v)/(hi-lo)*ph;
    const path=pts.map((p,i)=>(i?"L":"M")+(L+(p.f-minF)/(maxF-minF||1)*pw).toFixed(2)+","+y(db(p.m)).toFixed(2)).join(" ");
    const grid=Array.from({length:6},(_,i)=>{const v=hi-(hi-lo)*i/5,yy=y(v);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#555"/><text x="${L-7}" y="${yy+4}" text-anchor="end" fill="var(--secondary-text-color)" font-size="11">${Math.round(v)}</text>`;}).join("");
    const ticks=[0,.25,.5,.75,1].map(t=>`<text x="${L+pw*t}" y="${H-10}" text-anchor="middle" fill="var(--secondary-text-color)" font-size="11">${(minF+(maxF-minF)*t).toPrecision(3)}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="FFT-spectrum in decibel">${grid}
      <path d="${path}" fill="none" stroke="#f5d442" stroke-width="1.5"/>${ticks}
      <text x="13" y="${T+ph/2}" transform="rotate(-90 13 ${T+ph/2})" text-anchor="middle" fill="var(--secondary-text-color)" font-size="11">dB</text>
      <text x="${L+pw/2}" y="${H-1}" text-anchor="middle" fill="var(--secondary-text-color)" font-size="11">Frequentie (Hz)</text></svg>`;
  }

  _drawWaterfall(fs,hist,minF,maxF) {
    const canvas=this.shadowRoot.getElementById("waterfall");if(!canvas)return;
    const ctx=canvas.getContext("2d"),W=canvas.width,H=canvas.height;
    const frames=hist.slice(-Math.max(1,Math.min(80,Number(this.config.history_frames)||80)));
    const L=48,R=10,T=4,B=4,pw=W-L-R,ph=H-T-B;
    ctx.fillStyle="#080b0b";ctx.fillRect(0,0,W,H);
    if(!frames.length||!frames.some(f=>Array.isArray(f.magnitudes)&&f.magnitudes.length>1))return;
    const floorF=Math.max(0.0001,Number(this.config.min_frequency)>0?Number(this.config.min_frequency):Math.min(0.01,maxF/1000),minF||0.0001);
    const topF=Math.max(floorF*1.001,Math.min(maxF,Number(this.config.max_frequency)>0?Number(this.config.max_frequency):maxF));
    const stops=[[0,5,18,24],[.2,12,66,75],[.42,40,130,132],[.62,92,67,160],[.78,202,93,167],[.9,255,155,102],[1,255,239,150]];
    const palette=new Uint8ClampedArray(256*4);
    for(let k=0;k<256;k++){
      const t=k/255;let lo=stops[0],hi=stops[stops.length-1];
      for(let s=1;s<stops.length;s++){if(t<=stops[s][0]){lo=stops[s-1];hi=stops[s];break;}}
      const q=(t-lo[0])/(hi[0]-lo[0]||1);
      for(let ch=0;ch<3;ch++)palette[k*4+ch]=Math.round(lo[ch+1]+(hi[ch+1]-lo[ch+1])*q);
      palette[k*4+3]=255;
    }
    const range=Number(this.config.contrast)||40;
    const image=ctx.createImageData(pw,ph);
    frames.forEach((frame,x)=>{
      const mags=frame.magnitudes||[];
      if(mags.length<2)return;
      const frameMax=Number(frame.max_frequency_hz)||Number(fs[fs.length-1])||topF;
      for(let py=0;py<ph;py++){
        // Logarithmic frequency axis; interpolate between FFT bins for a continuous spectrogram.
        const ratio=py/Math.max(1,ph-1);
        const freq=topF*Math.pow(floorF/topF,ratio);
        const bin=Math.max(0,Math.min(mags.length-1,freq/frameMax*(mags.length-1)));
        const i0=Math.floor(bin),i1=Math.min(mags.length-1,i0+1),mix=bin-i0;
        const m0=Math.max(0,Number(mags[i0])||0),m1=Math.max(0,Number(mags[i1])||0);
        const mag=m0+(m1-m0)*mix;
        const db=20*Math.log10(Math.max(mag,1e-7));
        const t=Math.max(0,Math.min(1,(db+140)/range));
        const pi=Math.round(t*255)*4,offset=(py*pw+x)*4;
        image.data[offset]=palette[pi];image.data[offset+1]=palette[pi+1];image.data[offset+2]=palette[pi+2];image.data[offset+3]=255;
      }
    });
    // Stretch each time frame across its full column width: no horizontal gaps.
    const temp=document.createElement("canvas");temp.width=frames.length;temp.height=ph;
    temp.getContext("2d").putImageData(image,0,0);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.drawImage(temp,L,T,pw,ph);
    ctx.strokeStyle="#424848";ctx.lineWidth=1;ctx.strokeRect(L,T,pw,ph);
    ctx.fillStyle="#aab0b4";ctx.font="11px sans-serif";ctx.textAlign="right";
    [floorF,10,100,1000].filter((v,i,ar)=>v>=floorF&&v<=topF&&ar.indexOf(v)===i).forEach(v=>{
      const y=T+Math.log(topF/v)/Math.log(topF/floorF)*ph;
      ctx.fillText(v>=1000?(v/1000)+"k":String(v),L-7,y+4);
    });
  }
  _bindPanZoom() {
    const targets=[this.shadowRoot.querySelector('svg'),this.shadowRoot.getElementById('waterfall')].filter(Boolean);
    const zoomAt=factor=>{const old=this._zoom;this._zoom=Math.max(1,Math.min(32,this._zoom*factor));if(this._zoom!==old)this._render();};
    targets.forEach(el=>{
      el.addEventListener('wheel',ev=>{ev.preventDefault();zoomAt(ev.deltaY<0?1.2:1/1.2);},{passive:false});
      el.addEventListener('pointerdown',ev=>{this._drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,pan:this._pan};el.setPointerCapture(ev.pointerId);});
      el.addEventListener('pointermove',ev=>{if(!this._drag||this._drag.id!==ev.pointerId)return;const r=el.getBoundingClientRect();const d=el===this.shadowRoot.getElementById('waterfall')?(ev.clientY-this._drag.y)/Math.max(1,r.height):(this._drag.x-ev.clientX)/Math.max(1,r.width);this._pan=Math.max(-.48,Math.min(.48,this._drag.pan+d/this._zoom));});
      el.addEventListener('pointerup',ev=>{if(this._drag&&this._drag.id===ev.pointerId){this._drag=null;this._render();}});
      el.addEventListener('pointercancel',()=>{this._drag=null;});
    });
  }
  _esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  static getConfigElement(){return document.createElement("spectrumizer-card-editor");}
  static getStubConfig(){return {entity:"sensor.spectrum"};}
}
customElements.define("spectrumizer-card",SpectrumizerCard);
class SpectrumizerCardEditor extends HTMLElement {
  setConfig(config){this._config={...config};if(!this.shadowRoot)this.attachShadow({mode:"open"});this._render();}
  set hass(hass){this._hass=hass;this._render();}
  _render(){if(!this.shadowRoot||!this._hass)return;const entities=Object.keys(this._hass.states).filter(id=>id.startsWith("sensor."));
    this.shadowRoot.innerHTML=`<div class="field"><label>FFT-sensor</label><select id="entity">${entities.map(e=>`<option value="${e}" ${e===this._config.entity?'selected':''}>${e}</option>`).join("")}</select></div>
    <div class="field"><label>Kaarttitel</label><input id="name" value="${String(this._config.name||"Live spectrum").replace(/&/g,"&amp;").replace(/"/g,"&quot;")}"></div>
    <div class="field"><label>Maximale frequentie (Hz, optioneel)</label><input id="max_frequency" type="number" min="0" step="any" value="${this._config.max_frequency||""}"></div>
    <div class="field"><label>Aantal geschiedenisframes (max. 80)</label><input id="history_frames" type="number" min="1" max="80" value="${this._config.history_frames||80}"></div>
    <style>.field{display:flex;flex-direction:column;gap:6px;margin:12px 0}label{font-size:13px;color:var(--secondary-text-color)}input,select{padding:8px;background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:4px}</style>`;
    this.shadowRoot.querySelectorAll("input,select").forEach(el=>el.addEventListener("change",()=>{const v={...this._config,entity:this.shadowRoot.getElementById("entity").value,name:this.shadowRoot.getElementById("name").value};const m=Number(this.shadowRoot.getElementById("max_frequency").value);if(m>0)v.max_frequency=m;else delete v.max_frequency;v.history_frames=Math.max(1,Math.min(80,Number(this.shadowRoot.getElementById("history_frames").value)||80));this._config=v;this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:v},bubbles:true,composed:true}));}));
  }
}
customElements.define("spectrumizer-card-editor",SpectrumizerCardEditor);
window.customCards=window.customCards||[];
window.customCards.push({type:"spectrumizer-card",name:"Spectrumizer Live Spectrum",description:"Live FFT spectrum and waterfall spectrogram history."});
