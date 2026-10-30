/* Spectrumizer: live FFT line spectrum and waterfall history. */
class SpectrumizerCard extends HTMLElement {
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
    const maxF=Number(this.config.max_frequency)>0?Number(this.config.max_frequency):(Number(a.sampling_rate_hz)/2||1);
    this.shadowRoot.innerHTML=`
      <ha-card header="${this._esc(this.config.name)}"><div class="content">
        <div class="summary">
          <div><small>Dominante frequentie</small><strong>${Number.isFinite(peak)?peak.toFixed(3)+" Hz":"—"}</strong></div>
          <div><small>Samples</small><strong>${a.samples_collected??0} / ${a.window_size??"—"}</strong></div>
          <div><small>Resolutie</small><strong>${a.frequency_resolution_hz??"—"} Hz</strong></div>
        </div>
        ${ready?this._spectrum(fs,ms,maxF):'<div class="empty">Samples verzamelen… Het spectrum verschijnt zodra het venster gevuld is.</div>'}
        <div class="section-title">Geschiedenis · spectrogram</div>
        ${hist.length?'<canvas id="waterfall" width="720" height="300"></canvas><div class="timeaxis"><span>Ouder</span><span>Tijd →</span><span>Nu</span></div>':'<div class="empty short">De geschiedenis wordt opgebouwd na de eerste FFT-berekening.</div>'}
        <div class="footer">${this._esc(a.source_entity||"")} · ${a.sampling_rate_hz??"—"} samples/s · ${hist.length} geschiedenisframes</div>
      </div></ha-card>
      <style>
        :host{display:block}.content{padding:12px 14px 14px}.summary{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:12px}
        .summary>div{display:flex;flex-direction:column;gap:4px;min-width:90px}small,.footer,.timeaxis{color:var(--secondary-text-color);font-size:12px}
        strong{font-size:17px;font-weight:500}.section-title{font-size:14px;font-weight:500;margin:14px 0 6px}
        svg{display:block;width:100%;height:auto}canvas{display:block;width:100%;height:300px;background:#080b0b}
        .timeaxis{display:flex;justify-content:space-between;padding:4px 0}.empty{min-height:180px;display:grid;place-items:center;text-align:center;color:var(--secondary-text-color)}
        .short{min-height:70px}.footer{margin-top:10px;overflow-wrap:anywhere}
      </style>`;
    if(ready)this._drawWaterfall(fs,hist,maxF);
  }

  _spectrum(fs,ms,maxF) {
    const W=720,H=240,L=48,R=12,T=12,B=32,pw=W-L-R,ph=H-T-B;
    const pts=fs.map((f,i)=>({f:Number(f),m:Number(ms[i])})).filter(p=>Number.isFinite(p.f)&&Number.isFinite(p.m)&&p.f>=0&&p.f<=maxF);
    if(!pts.length)return '<div class="empty">Geen spectrumdata beschikbaar.</div>';
    const db=m=>20*Math.log10(Math.max(m,1e-7));
    const vals=pts.map(p=>db(p.m)), hi=Math.max(-20,Math.ceil(Math.max(...vals)/10)*10), lo=Math.min(-120,Math.floor(Math.min(...vals)/10)*10);
    const y=v=>T+(hi-v)/(hi-lo)*ph;
    const path=pts.map((p,i)=>(i?"L":"M")+(L+p.f/maxF*pw).toFixed(2)+","+y(db(p.m)).toFixed(2)).join(" ");
    const grid=Array.from({length:6},(_,i)=>{const v=hi-(hi-lo)*i/5,yy=y(v);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#555"/><text x="${L-7}" y="${yy+4}" text-anchor="end" fill="var(--secondary-text-color)" font-size="11">${Math.round(v)}</text>`;}).join("");
    const ticks=[0,.25,.5,.75,1].map(t=>`<text x="${L+pw*t}" y="${H-10}" text-anchor="middle" fill="var(--secondary-text-color)" font-size="11">${(maxF*t).toPrecision(3)}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="FFT-spectrum in decibel">${grid}
      <path d="${path}" fill="none" stroke="#f5d442" stroke-width="1.5"/>${ticks}
      <text x="13" y="${T+ph/2}" transform="rotate(-90 13 ${T+ph/2})" text-anchor="middle" fill="var(--secondary-text-color)" font-size="11">dB</text>
      <text x="${L+pw/2}" y="${H-1}" text-anchor="middle" fill="var(--secondary-text-color)" font-size="11">Frequentie (Hz)</text></svg>`;
  }

  _drawWaterfall(fs,hist,maxF) {
    const c=this.shadowRoot.getElementById("waterfall");if(!c)return;
    const ctx=c.getContext("2d"),W=c.width,H=c.height,frames=hist.slice(-Math.max(1,Math.min(80,Number(this.config.history_frames)||80)));
    const L=48,R=10,T=4,B=4,pw=W-L-R,ph=H-T-B,first=frames[0]?.magnitudes||[];
    ctx.fillStyle="#080b0b";ctx.fillRect(0,0,W,H);if(!first.length)return;
    const minF=Math.max(.5,Number(this.config.min_frequency)||1);
    const yFor=f=>T+(Math.log(maxF/Math.max(minF,f))/Math.log(maxF/minF))*ph;
    const stops=[[0,5,18,24],[.25,12,66,75],[.5,92,67,132],[.72,202,93,167],[.88,255,155,102],[1,255,229,122]];
    const colour=db=>{const t=Math.max(0,Math.min(1,(db+90)/70));let l=stops[0],h=stops[stops.length-1];for(let i=1;i<stops.length;i++){if(t<=stops[i][0]){l=stops[i-1];h=stops[i];break;}}const q=(t-l[0])/(h[0]-l[0]||1);return `rgb(${Math.round(l[1]+(h[1]-l[1])*q)},${Math.round(l[2]+(h[2]-l[2])*q)},${Math.round(l[3]+(h[3]-l[3])*q)})`;};
    const cw=pw/frames.length;
    frames.forEach((frame,i)=>{const arr=frame.magnitudes||[];for(let j=1;j<Math.min(arr.length,fs.length);j++){const f=Number(fs[j]);if(!Number.isFinite(f)||f<minF||f>maxF)continue;const next=j+1<arr.length?Number(fs[j+1]):f;const y1=yFor(f),y2=yFor(Math.min(maxF,Math.max(f,next)));const db=20*Math.log10(Math.max(Number(arr[j])||0,1e-7));ctx.fillStyle=colour(db);ctx.fillRect(L+i*cw,y1,Math.ceil(cw),Math.max(1,y2-y1+1));}});
    ctx.strokeStyle="#303838";ctx.lineWidth=1;[minF,10,100,1000].filter(f=>f>minF&&f<maxF).forEach(f=>{const y=yFor(f);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(W-R,y);ctx.stroke();});
    ctx.fillStyle="#aab0b4";ctx.font="11px sans-serif";ctx.textAlign="right";
    [minF,10,100,1000].filter((f,i,ar)=>f>=minF&&f<=maxF&&ar.indexOf(f)===i).forEach(f=>ctx.fillText(f>=1000?(f/1000)+"k":String(f),L-7,yFor(f)+4));
    ctx.strokeStyle="#424848";ctx.strokeRect(L,T,pw,ph);
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
