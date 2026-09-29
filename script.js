/* =========================================================
   NotaKilat Pro - OFFLINE EDITION
   Local-only database. No Google Sheets / API required.
========================================================= */

const CACHE_KEY = "notakilat_offline_db_v6";
const STORE_PIN = "bismill4h";

function togglePinVisibility(){
  const input = document.getElementById("pinInput");
  const button = document.getElementById("togglePin");
  if(!input || !button) return;
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  button.textContent = visible ? "👁️" : "🙈";
  button.setAttribute("aria-label", visible ? "Tampilkan PIN" : "Sembunyikan PIN");
}

const defaultDB = {
  profile: {
    name: "Toko Saya", phone: "", address: "", footer: "Terima kasih sudah berbelanja.",
    bankName: "", bankAccount: "", bankHolder: "", logo: "", theme: "modern", invoiceStyle: "modern", pinEnabled: true
  },
  products: [], customers: [], suppliers: [], invoices: [], purchases: []
};

let db = loadCache();
let currentEditingInvoice = null;
let currentPreviewInvoice = null;
let currentInvoiceStyle = localStorage.getItem("notakilat_invoice_style") || "modern";
let salesChart = null;

// FREE EDITION: hanya Nota + Profil yang terbuka. Semua fitur lain tetap ada di source dan dapat dibuka lewat NotaKilat Pro.
const FREE_PAGES = new Set(["nota", "profil", "database"]);

document.addEventListener("DOMContentLoaded", async () => {
  bindGlobalEvents();
  applyTheme(db.profile.theme || "modern");
  loadProfileForm();
  refreshAll();
  resetInvoiceForm();
  showPage("nota");
  initPinGate();
  await registerServiceWorker();
  updateStorageStatus();
  window.addEventListener("storage", () => { db = loadCache(); refreshAll(); });
});

function loadCache() {
  try {
    let raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem("notakilat_offline_db_v5");
      if (legacy) {
        raw = legacy;
        localStorage.setItem(CACHE_KEY, legacy);
      }
    }
    if (!raw) return structuredClone(defaultDB);
    const p = JSON.parse(raw);
    return {
      ...structuredClone(defaultDB), ...p,
      profile: {...defaultDB.profile, ...(p.profile || {})},
      products: Array.isArray(p.products) ? p.products : [],
      customers: Array.isArray(p.customers) ? p.customers : [],
      invoices: Array.isArray(p.invoices) ? p.invoices : [],
      purchases: Array.isArray(p.purchases) ? p.purchases : [],
      suppliers: Array.isArray(p.suppliers) ? p.suppliers : []
    };
  } catch(e) {
    return structuredClone(defaultDB);
  }
}

function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(db));
}

function updateStorageStatus() {
  const badge = document.querySelector(".storage-badge");
  if (badge) {
    badge.textContent = "💾 Offline — data tersimpan di perangkat";
    badge.style.color = "#666";
  }
  const title=document.getElementById("databaseStatusTitle");
  const desc=document.getElementById("databaseStatusText");
  const count=document.getElementById("databasePending");
  if(title) title.textContent = "🟢 Database lokal aktif";
  if(desc) desc.textContent = "Data NotaKilat tersimpan di perangkat ini. Tidak dikirim ke Google Sheets/server.";
  if(count) count.textContent = "Offline-first";
}

function applyLocalSaveCustomer(data) {
  const idx = db.customers.findIndex(x => x.id === data.id);
  if (idx >= 0) db.customers[idx] = {...db.customers[idx], ...data, updatedAt:new Date().toISOString()};
  else db.customers.push({...data, updatedAt:new Date().toISOString()});
  saveCache(); refreshAll();
}

function applyLocalDeleteCustomer(id) {
  db.customers = db.customers.filter(x => x.id !== id);
  saveCache(); refreshAll();
}

function applyLocalSaveProduct(data) {
  const idx = db.products.findIndex(x => x.id === data.id);
  if (idx >= 0) db.products[idx] = {...db.products[idx], ...data, updatedAt:new Date().toISOString()};
  else db.products.push({...data, updatedAt:new Date().toISOString()});
  saveCache(); refreshAll();
}

function applyLocalDeleteProduct(id) {
  db.products = db.products.filter(x => x.id !== id);
  saveCache(); refreshAll();
}

function applyLocalSaveProfile(data) {
  db.profile = {...defaultDB.profile, ...data};
  saveCache(); refreshAll();
}

function applyLocalDeleteInvoice(id) {
  const inv = db.invoices.find(x => x.id === id);
  if (inv) inv.items.forEach(item => {
    const p = db.products.find(x => x.id === item.productId);
    if (p) p.stock = Number(p.stock || 0) + Number(item.qty || 0);
  });
  db.invoices = db.invoices.filter(x => x.id !== id);
  saveCache(); refreshAll();
}

function applyLocalSaveInvoice(inv) {
  const old = db.invoices.find(x => x.id === inv.id);
  if (old) old.items.forEach(item => {
    const p = db.products.find(x => x.id === item.productId);
    if (p) p.stock = Number(p.stock || 0) + Number(item.qty || 0);
  });
  inv.items.forEach(item => {
    const p = db.products.find(x => x.id === item.productId);
    if (p) p.stock = Math.max(0, Number(p.stock || 0) - Number(item.qty || 0));
  });
  const idx = db.invoices.findIndex(x => x.id === inv.id);
  if (idx >= 0) db.invoices[idx] = inv; else db.invoices.push(inv);
  if (inv.customerName && inv.customerName !== "Umum") {
    const c = {id: uid("cus"), name: inv.customerName, phone: inv.customerPhone || "", address: inv.customerAddress || "", createdAt: new Date().toISOString()};
    const existing = db.customers.find(x => x.name.toLowerCase() === c.name.toLowerCase());
    if (existing) Object.assign(existing, {phone:c.phone,address:c.address}); else db.customers.push(c);
  }
  saveCache(); refreshAll();
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    try { await navigator.serviceWorker.register("./sw.js"); } catch(e) { console.warn("Service worker tidak aktif", e); }
  }
}

function applyTheme(theme){
  const t=theme==="dotmatrix"?"dotmatrix":"modern";
  document.body.classList.toggle("theme-dotmatrix", t==="dotmatrix");
  const select=document.getElementById("storeTheme");
  if(select) select.value=t;
}

function uid(prefix="id") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function money(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function today() {
  return new Date().toISOString().slice(0,10);
}

function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"});
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function toast(msg) {
  const el=document.getElementById("toast");
  el.textContent=msg;
  el.classList.add("toast-show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>el.classList.remove("toast-show"),2200);
}

function saveLocalAndToast(localApply, message) {
  localApply();
  toast(message || "Data tersimpan di perangkat.");
}

function toggleSidebar() {

  document.getElementById("sidebar").classList.toggle("open");
}

function initPinGate(){
  const gate=document.getElementById("pinGate");
  if(!gate || !db.profile.pinEnabled || sessionStorage.getItem("notakilat_unlocked")==="1") return;
  gate.hidden=false; setTimeout(()=>document.getElementById("pinInput")?.focus(),50);
  document.getElementById("pinInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")unlockApp()});
}
function unlockApp(){
  const val=document.getElementById("pinInput")?.value||"";
  if(val===STORE_PIN){sessionStorage.setItem("notakilat_unlocked","1");document.getElementById("pinGate").hidden=true;toast("NotaKilat terbuka.");}
  else {const e=document.getElementById("pinError");if(e)e.textContent="PIN salah. Coba lagi.";}
}
function lockApp(){sessionStorage.removeItem("notakilat_unlocked");location.reload();}

function openUpgradeModal(){
  const m=document.getElementById("upgradeModal");
  if(m) m.classList.add("show");
}
function closeUpgradeModal(){
  const m=document.getElementById("upgradeModal");
  if(m) m.classList.remove("show");
}

function showPage(page) {
  if(!FREE_PAGES.has(page)){
    openUpgradeModal();
    return;
  }
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  document.getElementById("page-"+page)?.classList.add("active");
  document.querySelectorAll(".nav-item[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  document.getElementById("sidebar").classList.remove("open");
  if(page==="dashboard") renderDashboard();
  if(page==="produk") renderProducts();
  if(page==="kulakan") { renderPurchases(); populatePurchaseProducts(); }
  if(page==="pelanggan") renderCustomers();
  if(page==="supplier") renderSuppliers();
  if(page==="nota") renderInvoiceList();
  if(page==="profil") loadProfileForm();
  if(page==="database") updateStorageStatus();
  if(page==="laporan") renderReports();
}

function bindGlobalEvents() {
  document.getElementById("customerName").addEventListener("change",autofillCustomer);
  document.getElementById("invoiceStatus").addEventListener("change",()=>{
    if(document.getElementById("invoiceStatus").value==="LUNAS")
      document.getElementById("dueDate").value="";
  });
  document.getElementById("storeLogo").addEventListener("change",handleLogoUpload);
  
}

/* ================= DASHBOARD ================= */

function renderDashboard() {
  const filter=document.getElementById("dashboardFilter")?.value||"all";
  let invoices=db.invoices;
  if(filter==="today") invoices=invoices.filter(i=>i.date===today());
  if(filter==="month") invoices=invoices.filter(i=>i.date?.startsWith(today().slice(0,7)));

  const paid=db.invoices.filter(i=>i.status==="LUNAS");
  const unpaid=db.invoices.filter(i=>i.status!=="LUNAS");
  const due=unpaid.filter(i=>i.dueDate&&i.dueDate<today());

  document.getElementById("statRevenue").textContent=money(paid.reduce((s,i)=>s+Number(i.total||0),0));
  document.getElementById("statInvoices").textContent=db.invoices.length;
  document.getElementById("statReceivable").textContent=money(unpaid.reduce((s,i)=>s+Number(i.total||0),0));
  document.getElementById("statDue").textContent=due.length;

  const recent=[...db.invoices].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,10);
  document.getElementById("recentInvoices").innerHTML=recent.length
    ? recent.map(invoiceRow).join("")
    : `<tr><td colspan="6" class="empty">Belum ada transaksi.</td></tr>`;

  renderTopProducts();
  renderChart(invoices);
}

function renderTopProducts() {
  const totals={};
  db.invoices.forEach(inv=>inv.items.forEach(item=>{
    totals[item.name]=(totals[item.name]||0)+Number(item.qty||0);
  }));
  const list=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById("topProducts").innerHTML=list.length
    ? list.map(([name,qty],i)=>`<div class="mini-row"><span>${i+1}. ${escapeHtml(name)}</span><small>${qty} terjual</small></div>`).join("")
    : `<div class="empty">Belum ada penjualan.</div>`;
}

function renderChart(invoices) {
  const canvas=document.getElementById("salesChart");
  if(!canvas) return;
  const ctx=canvas.getContext("2d");
  const rect=canvas.getBoundingClientRect();
  const dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(300,Math.round(rect.width*dpr));
  canvas.height=Math.max(220,Math.round(rect.height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=rect.width||600,H=rect.height||270;
  ctx.clearRect(0,0,W,H);
  const grouped={};
  invoices.forEach(i=>grouped[i.date]=(grouped[i.date]||0)+(i.status==="LUNAS"?Number(i.total||0):0));
  let labels=Object.keys(grouped).sort().slice(-12);
  if(!labels.length){ labels=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10);}); }
  const values=labels.map(x=>grouped[x]||0), max=Math.max(1,...values);
  const pad={l:50,r:15,t:15,b:42}, cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;
  ctx.strokeStyle="#e7e8ec";ctx.lineWidth=1;ctx.font="10px Arial";ctx.fillStyle="#777";
  for(let i=0;i<4;i++){const y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();ctx.fillText(money(max*(1-i/3)).replace("Rp ",""),4,y+3);}
  const pts=values.map((v,i)=>[pad.l+(cw*(labels.length===1?0.5:i/(labels.length-1))),pad.t+ch-(v/max)*ch]);
  ctx.strokeStyle="#ff7a00";ctx.lineWidth=2.5;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();
  ctx.fillStyle="#ff7a00";pts.forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],4,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle="#777";ctx.font="10px Arial";labels.forEach((l,i)=>{const x=pts[i][0];ctx.save();ctx.translate(x,H-8);ctx.rotate(-.35);ctx.fillText(formatDate(l),-18,0);ctx.restore();});
}

function invoiceRow(inv) {
  const overdue=inv.status!=="LUNAS"&&inv.dueDate&&inv.dueDate<today();
  const badge=inv.status==="LUNAS"
    ? `<span class="badge paid">LUNAS</span>`
    : overdue?`<span class="badge due">JATUH TEMPO</span>`:`<span class="badge unpaid">BELUM LUNAS</span>`;
  return `<tr>
    <td><strong>${escapeHtml(inv.number)}</strong></td>
    <td>${formatDate(inv.date)}</td>
    <td>${escapeHtml(inv.customerName||"Umum")}</td>
    <td><strong>${money(inv.total)}</strong></td>
    <td>${badge}</td>
    <td><div class="actions">
      <button class="action-btn" onclick="editInvoice('${inv.id}')">Edit</button>
      <button class="action-btn" onclick="previewSavedInvoice('${inv.id}')">Lihat</button>
      ${inv.status!=="LUNAS"?`<button class="action-btn" onclick="markPaid('${inv.id}')">Lunas</button>`:""}
      <button class="action-btn" onclick="shareInvoiceWhatsApp('${inv.id}')">WA</button>
      <button class="action-btn" onclick="duplicateInvoice('${inv.id}')">Duplikat</button>
      <button class="action-btn delete" onclick="deleteInvoice('${inv.id}')">Hapus</button>
    </div></td>
  </tr>`;
}

/* ================= INVOICE ================= */

function newInvoice(){showPage("nota");resetInvoiceForm();}

function nextInvoiceNumber(){
  const d=new Date();
  const prefix=`NK-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}-`;
  const count=db.invoices.filter(i=>i.number?.startsWith(prefix)).length+1;
  return prefix+String(count).padStart(4,"0");
}

function resetInvoiceForm(){
  currentEditingInvoice=null;
  document.getElementById("invoicePageTitle").textContent="Buat Nota";
  document.getElementById("invoiceNumber").value=nextInvoiceNumber();
  document.getElementById("invoiceDate").value=today();
  document.getElementById("invoiceStatus").value="LUNAS";
  document.getElementById("paymentMethod").value="Tunai";
  document.getElementById("dueDate").value="";
  document.getElementById("customerName").value="";
  document.getElementById("customerPhone").value="";
  document.getElementById("customerAddress").value="";
  document.getElementById("invoiceNote").value="";
  document.getElementById("invoiceItems").innerHTML="";
  addInvoiceItem();
  updateInvoiceTotals();
  renderCustomerOptions();
}

function addInvoiceItem(item={}){
  const tbody=document.getElementById("invoiceItems");
  const tr=document.createElement("tr");
  const options=db.products.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${money(p.price)} | stok ${p.stock}</option>`).join("");
  tr.innerHTML=`<td><select class="item-product" onchange="productChanged(this)"><option value="">Input manual</option>${options}</select></td>
  <td><input class="item-desc" placeholder="Deskripsi" value="${escapeHtml(item.description||"")}"></td>
  <td><input class="item-qty qty-input" type="number" min="1" value="${Number(item.qty||1)}" oninput="updateInvoiceTotals()"></td>
  <td><input class="item-price money-input" type="number" min="0" value="${Number(item.price||0)}" oninput="updateInvoiceTotals()"></td>
  <td><input class="item-discount money-input" type="number" min="0" value="${Number(item.discount||0)}" oninput="updateInvoiceTotals()"></td>
  <td class="item-total">${money((Number(item.qty)||1)*Number(item.price||0)-Number(item.discount||0))}</td>
  <td><button class="action-btn delete" onclick="this.closest('tr').remove();ensureInvoiceRow();updateInvoiceTotals()">×</button></td>`;
  tbody.appendChild(tr);
  if(item.productId)tr.querySelector(".item-product").value=item.productId;
}

function ensureInvoiceRow(){if(!document.querySelector("#invoiceItems tr"))addInvoiceItem();}

/* ================= VOICE KASIR V8 ================= */
function getSpeechRecognition(){ return window.SpeechRecognition || window.webkitSpeechRecognition; }
function startSpeechCapture({buttonId,statusId,placeholder,process}){
  const SpeechRecognition=getSpeechRecognition();
  const status=document.getElementById(statusId); const btn=document.getElementById(buttonId);
  if(!SpeechRecognition){ alert("Input suara belum didukung browser ini. Coba Chrome/Edge terbaru atau Safari iPhone dengan izin mikrofon/Siri aktif."); return; }
  const rec=new SpeechRecognition(); rec.lang="id-ID"; rec.continuous=false; rec.interimResults=false; rec.maxAlternatives=3;
  if(status){status.hidden=false;status.classList.add("listening");status.textContent="🎙️ "+placeholder;}
  if(btn){btn.dataset.old=btn.textContent;btn.textContent="⏹️ Mendengar…";btn.disabled=true;}
  rec.onresult=(event)=>{
    const text=Array.from(event.results).map(r=>r[0]?.transcript||"").join(" ").trim();
    const result=process(text)||{};
    if(status){status.classList.remove("listening");status.textContent=result.message||`✅ Terbaca: “${text}”`;}
  };
  rec.onerror=(event)=>{ if(status){status.classList.remove("listening");status.textContent=event.error==="not-allowed"?"⚠️ Izin mikrofon ditolak.":`⚠️ Input suara gagal: ${event.error||"unknown"}.`;}};
  rec.onend=()=>{if(btn){btn.disabled=false;btn.textContent=btn.dataset.old||"🎙️";}};
  try{rec.start();}catch(e){if(btn){btn.disabled=false;btn.textContent=btn.dataset.old||"🎙️";} if(status){status.classList.remove("listening");status.textContent="⚠️ Mikrofon tidak bisa dimulai. Coba lagi.";}}
}

function parseIndonesianNumber(raw){
  const t=String(raw||"").toLowerCase().trim(); if(!t)return 0;
  const digit=t.replace(/[^0-9]/g,""); if(digit && !/[a-z]/.test(t)) return Number(digit);
  const units={nol:0,satu:1,sebuah:1,dua:2,tiga:3,empat:4,lima:5,enam:6,tujuh:7,delapan:8,sembilan:9,sepuluh:10,sebelas:11};
  const toks=t.replace(/-/g," ").split(/\s+/).filter(Boolean); let total=0,current=0;
  for(const w of toks){ if(units[w]!=null){current+=units[w];continue;} if(w==="belas"){current=Math.max(1,current)*10+current;continue;} if(w==="puluh"){current=Math.max(1,current)*10;continue;} if(w==="ratus"){current=Math.max(1,current)*100;continue;} if(w==="ribu"){total+=Math.max(1,current)*1000;current=0;continue;} if(w==="juta"){total+=Math.max(1,current)*1000000;current=0;continue;} }
  return total+current;
}
function extractLabeledNumber(text,labelRegex){
  const m=String(text||"").match(new RegExp(labelRegex+"\\s*(?:rp|rupiah)?\\s*([0-9][0-9.,]*|[a-z -]+?)(?=\\s+(?:hpp|modal|harga|jual|stok|nama|nomor|no|alamat|produk)\\b|$)","i"));
  if(!m)return 0; return parseIndonesianNumber(m[1].trim());
}
function startVoiceInvoiceInput(){
  startSpeechCapture({buttonId:"voiceInvoiceBtn",statusId:"voiceProductStatus",placeholder:"Sebutkan pelanggan dan barang. Contoh: “Agus, kopi 2, gula 2, beras 5, tunai”",process:(text)=>{
    const original=text; const low=normalizeVoiceText(text);
    // Customer by known name, or phrase after "pelanggan"
    let customerFound=null;
    [...db.customers].sort((a,b)=>String(b.name).length-String(a.name).length).some(c=>{
      const n=String(c.name||"").toLowerCase().trim(); if(n && low.includes(n)){customerFound=c;return true;} return false;
    });
    const cm=low.match(/(?:pelanggan|untuk|atas nama)\s+([a-z0-9 .'-]+?)(?=\s+(?:kopi|gula|beras|tunai|qris|transfer|belum|lunas)\b|$)/i);
    if(!customerFound && cm) customerFound=db.customers.find(c=>c.name.toLowerCase()===cm[1].trim().toLowerCase());
    if(customerFound){document.getElementById("customerName").value=customerFound.name;autofillCustomer();}
    // Payment method
    if(/\b(qris|qr is)\b/i.test(low)) document.getElementById("paymentMethod").value="QRIS";
    else if(/\b(transfer|bank|rekening)\b/i.test(low)) document.getElementById("paymentMethod").value="Transfer Bank";
    else if(/\b(e[- ]?wallet|gopay|ovo|dana|shopeepay)\b/i.test(low)) document.getElementById("paymentMethod").value="E-Wallet";
    else if(/\b(tunai|cash)\b/i.test(low)) document.getElementById("paymentMethod").value="Tunai";
    if(/\b(belum lunas|hutang|utang|tempo)\b/i.test(low)) document.getElementById("invoiceStatus").value="BELUM LUNAS";
    else if(/\blunas\b/i.test(low)) document.getElementById("invoiceStatus").value="LUNAS";
    const result=addProductsFromVoice(original);
    if(result.added.length) updateInvoiceTotals();
    return {message:(customerFound?`👤 ${customerFound.name} · `:"")+result.message};
  }});
}
function startVoiceCustomerInInvoice(){
  startSpeechCapture({buttonId:"voiceCustomerInInvoiceBtn",statusId:"voiceProductStatus",placeholder:"Sebutkan nama pelanggan, misalnya: “Agus”",process:(text)=>{
    const low=normalizeVoiceText(text); const c=[...db.customers].sort((a,b)=>b.name.length-a.name.length).find(c=>low.includes(c.name.toLowerCase()));
    if(!c)return {message:`⚠️ Pelanggan “${text}” belum ditemukan. Tambahkan dulu di menu Pelanggan.`};
    document.getElementById("customerName").value=c.name;autofillCustomer(); return {message:`✅ Pelanggan ${c.name} dimasukkan ke nota.`};
  }});
}
function startVoiceProductForm(){
  startSpeechCapture({buttonId:null,statusId:"productVoiceStatus",placeholder:"Sebutkan nama, HPP, harga jual, dan stok. Contoh: “Kopi Susu, HPP 7000, harga jual 12000, stok 20”",process:(text)=>{
    const t=String(text||"").trim(); let name="";
    const nm=t.match(/(?:nama\s+produk\s+|produk\s+)?(.+?)(?=\s+(?:hpp|modal|harga(?:\s+jual)?|jual|stok)\b|,|$)/i); if(nm)name=nm[1].trim();
    if(!name){name=t.split(",")[0].trim();}
    const hpp=extractLabeledNumber(t,"(?:hpp|modal)"); const price=extractLabeledNumber(t,"(?:harga(?:\\s+jual)?|jual)"); const stock=extractLabeledNumber(t,"stok");
    if(name)document.getElementById("productName").value=name;
    if(hpp)document.getElementById("productHpp").value=hpp;
    if(price)document.getElementById("productPrice").value=price;
    if(stock)document.getElementById("productStock").value=stock;
    if(supplier)document.getElementById("productSupplier").value=supplier;
    return {message:`✅ Terbaca: ${name||"nama belum jelas"}${price?` · jual ${money(price)}`:""}${stock?` · stok ${stock}`:""}${supplier?` · kulak ${supplier}`:""}. Silakan cek lalu Simpan.`};
  }});
}
function startVoiceCustomerForm(){
  startSpeechCapture({buttonId:null,statusId:"customerVoiceStatus",placeholder:"Sebutkan nama, nomor WhatsApp, dan alamat. Contoh: “Agus, 08123456789, Sidoarjo”",process:(text)=>{
    const t=String(text||"").trim(); const phone=(t.match(/(?:08|62)[0-9\s-]{7,}/)||[])[0]?.replace(/\s|-/g,"")||"";
    let name="",address="";
    const nm=t.match(/(?:nama\s+)?(.+?)(?=\s+(?:nomor|no|wa|whatsapp|alamat)\b|,|$)/i); if(nm)name=nm[1].trim();
    if(!name)name=t.split(",")[0].trim();
    const am=t.match(/(?:alamat)\s+(.+)$/i); if(am)address=am[1].trim();
    else {const parts=t.split(",").map(x=>x.trim()).filter(Boolean); if(parts.length>=3)address=parts.slice(2).join(", ");}
    if(name)document.getElementById("customerFormName").value=name;
    if(phone)document.getElementById("customerFormPhone").value=phone;
    if(address)document.getElementById("customerFormAddress").value=address;
    return {message:`✅ Terbaca: ${name||"nama belum jelas"}${phone?` · ${phone}`:""}${address?` · ${address}`:""}. Silakan cek lalu Simpan.`};
  }});
}

/* ================= VOICE PRODUCT INPUT ================= */
let voiceRecognition = null;
let voiceListening = false;

function startVoiceProductInput(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const statusEl = document.getElementById("voiceProductStatus");
  const btn = document.getElementById("voiceProductBtn");
  if(!SpeechRecognition){
    alert("Input suara belum didukung browser ini. Coba Google Chrome/Edge versi terbaru.");
    return;
  }
  if(voiceListening){
    try{ voiceRecognition?.stop(); }catch(e){}
    return;
  }
  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "id-ID";
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = false;
  voiceRecognition.maxAlternatives = 3;
  voiceListening = true;
  if(statusEl){
    statusEl.hidden=false;
    statusEl.classList.add("listening");
    statusEl.textContent="🎙️ Mendengarkan… sebutkan produk dan jumlah, misalnya: kopi 2, gula 2, beras 2";
  }
  if(btn){ btn.textContent="⏹️ Berhenti"; }
  voiceRecognition.onresult = (event)=>{
    const text = Array.from(event.results).map(r=>r[0]?.transcript||"").join(" ").trim();
    const result = addProductsFromVoice(text);
    if(statusEl){
      statusEl.classList.remove("listening");
      statusEl.textContent = result.message;
    }
    if(result.added.length) updateInvoiceTotals();
  };
  voiceRecognition.onerror = (event)=>{
    const msg = event.error === "not-allowed" ? "Izin mikrofon ditolak." : `Input suara gagal: ${event.error||"unknown"}.`;
    if(statusEl){ statusEl.hidden=false; statusEl.classList.remove("listening"); statusEl.textContent="⚠️ "+msg; }
  };
  voiceRecognition.onend = ()=>{
    voiceListening=false;
    if(btn) btn.textContent="🎙️ Input Suara";
  };
  try{ voiceRecognition.start(); }catch(err){
    voiceListening=false;
    if(btn) btn.textContent="🎙️ Input Suara";
    if(statusEl){ statusEl.hidden=false; statusEl.classList.remove("listening"); statusEl.textContent="⚠️ Mikrofon tidak bisa dimulai. Coba lagi."; }
  }
}

function normalizeVoiceText(text){
  return String(text||"").toLowerCase()
    .replace(/[.,;:!?]/g," ")
    .replace(/\b(tambah|masukkan|belikan|beli|pesan|pesankan|tolong|saya mau|aku mau|minta|ambilkan)\b/g," ")
    .replace(/\s+/g," ").trim();
}

function qtyFromVoice(value){
  const n=Number(value);
  if(Number.isFinite(n) && n>0) return Math.floor(n);
  const words={
    satu:1,dua:2,tiga:3,empat:4,lima:5,enam:6,tujuh:7,delapan:8,sembilan:9,
    sepuluh:10,sebelas:11,duabelas:12,"dua belas":12,tigabelas:13,"tiga belas":13,
    empatbelas:14,"empat belas":14,limabelas:15,"lima belas":15,duapuluh:20,"dua puluh":20
  };
  return words[String(value||"").trim()]||1;
}

function addProductsFromVoice(transcript){
  const original=String(transcript||"").trim();
  const text=normalizeVoiceText(original);
  if(!text) return {added:[],message:"⚠️ Tidak ada ucapan yang terbaca."};
  if(!db.products.length) return {added:[],message:"⚠️ Belum ada produk. Tambahkan produk terlebih dahulu."};

  // Match known product names directly, prioritizing longer names.
  const products=[...db.products].sort((a,b)=>String(b.name).length-String(a.name).length);
  const found=[];
  let remaining=text;
  for(const p of products){
    const name=String(p.name||"").trim().toLowerCase();
    if(!name) continue;
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re=new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`);
    if(!re.test(remaining)) continue;
    const match=re.exec(remaining);
    const after=remaining.slice(match.index+match[0].length).trim();
    const qtyMatch=after.match(/^(\d+|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|duabelas|dua belas|tigabelas|tiga belas|empatbelas|empat belas|limabelas|lima belas|duapuluh|dua puluh)(?:\s|$)/);
    const qty=qtyMatch?qtyFromVoice(qtyMatch[1]):1;
    found.push({product:p,qty});
    remaining=remaining.replace(match[0]," ");
    if(qtyMatch) remaining=remaining.replace(qtyMatch[0]," ");
  }

  if(!found.length){
    return {added:[],message:`⚠️ Produk tidak ditemukan dari ucapan: “${original}”. Pastikan nama produk sudah ada di menu Produk.`};
  }

  const rows=[...document.querySelectorAll("#invoiceItems tr")];
  const added=[];
  for(const hit of found){
    let row=rows.find(tr=>tr.querySelector(".item-product")?.value===hit.product.id);
    if(!row){
      addInvoiceItem({productId:hit.product.id,qty:hit.qty,price:hit.product.price});
      row=document.querySelector("#invoiceItems tr:last-child");
    }else{
      const q=row.querySelector(".item-qty");
      q.value=Math.max(1,Number(q.value||0)+hit.qty);
    }
    added.push(`${hit.product.name} × ${hit.qty}`);
  }
  updateInvoiceTotals();
  return {added,message:`✅ Berhasil: ${added.join(", ")}`};
}

function productChanged(select){
  const tr=select.closest("tr");
  const p=db.products.find(x=>x.id===select.value);
  if(!p)return;
  tr.querySelector(".item-price").value=p.price;
  tr.querySelector(".item-qty").max=p.stock;
  updateInvoiceTotals();
}

function collectInvoiceItems(){
  return [...document.querySelectorAll("#invoiceItems tr")].map(tr=>{
    const productId=tr.querySelector(".item-product").value;
    const p=db.products.find(x=>x.id===productId);
    const qty=Math.max(1,Number(tr.querySelector(".item-qty").value||1));
    const price=Math.max(0,Number(tr.querySelector(".item-price").value||0));
    const discount=Math.max(0,Number(tr.querySelector(".item-discount").value||0));
    return {productId,name:p?.name||tr.querySelector(".item-desc").value.trim()||"Produk",description:tr.querySelector(".item-desc").value.trim(),qty,price,discount,hpp:Number(p?.hpp||0),total:Math.max(0,qty*price-discount)};
  }).filter(x=>x.productId||x.price>0);
}

function updateInvoiceTotals(){
  let subtotal=0,discount=0;
  document.querySelectorAll("#invoiceItems tr").forEach(tr=>{
    const qty=Number(tr.querySelector(".item-qty")?.value||0);
    const price=Number(tr.querySelector(".item-price")?.value||0);
    const disc=Number(tr.querySelector(".item-discount")?.value||0);
    subtotal+=qty*price;discount+=disc;
    const cell=tr.querySelector(".item-total");if(cell)cell.textContent=money(Math.max(0,qty*price-disc));
  });
  document.getElementById("invoiceSubtotal").textContent=money(subtotal);
  document.getElementById("invoiceDiscount").textContent=money(discount);
  document.getElementById("invoiceTotal").textContent=money(Math.max(0,subtotal-discount));
}

function autofillCustomer(){
  const name=document.getElementById("customerName").value.trim().toLowerCase();
  const c=db.customers.find(x=>x.name.toLowerCase()===name);
  if(c){
    document.getElementById("customerPhone").value=c.phone||"";
    document.getElementById("customerAddress").value=c.address||"";
  }
}

function renderCustomerOptions(){
  document.getElementById("customerOptions").innerHTML=db.customers.map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.phone||"")}</option>`).join("");
}

async function saveInvoice(){
  const items=collectInvoiceItems();
  if(!items.length){alert("Tambahkan minimal 1 produk.");return;}
  const status=document.getElementById("invoiceStatus").value;
  const dueDate=document.getElementById("dueDate").value;
  if(status!=="LUNAS"&&!dueDate){alert("Isi tanggal jatuh tempo untuk nota BELUM LUNAS.");return;}
  const old=currentEditingInvoice?db.invoices.find(i=>i.id===currentEditingInvoice):null;
  // Validasi stok lokal terlebih dahulu. Saat edit, stok nota lama dikembalikan sementara.
  const available={};
  db.products.forEach(p=>available[p.id]=Number(p.stock||0));
  if(old) old.items.forEach(i=>available[i.productId]=(available[i.productId]||0)+Number(i.qty||0));
  for(const item of items){
    if(!item.productId) continue;
    if(!available[item.productId] || available[item.productId] < Number(item.qty||0)){
      const p=db.products.find(x=>x.id===item.productId);
      alert(`Stok ${p?.name||item.name} tidak cukup. Tersedia ${available[item.productId]||0}, butuh ${item.qty}.`);
      return;
    }
    available[item.productId]-=Number(item.qty||0);
  }
  const subtotal=items.reduce((s,i)=>s+i.qty*i.price,0);
  const discount=items.reduce((s,i)=>s+i.discount,0);
  const inv={
    id:old?.id||uid("inv"), number:document.getElementById("invoiceNumber").value,
    date:document.getElementById("invoiceDate").value||today(), dueDate:status==="LUNAS"?"":dueDate, status,
    paymentMethod:document.getElementById("paymentMethod").value||"Tunai",
    customerName:document.getElementById("customerName").value.trim()||"Umum",
    customerPhone:document.getElementById("customerPhone").value.trim(), customerAddress:document.getElementById("customerAddress").value.trim(),
    note:document.getElementById("invoiceNote").value.trim(), items, subtotal, discount, total:Math.max(0,subtotal-discount),
    createdAt:old?.createdAt||new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  applyLocalSaveInvoice(inv);
  resetInvoiceForm();
  toast(old ? "Nota diperbarui di perangkat." : "Nota tersimpan di perangkat.");
}

function renderInvoiceList(){
  const q=(document.getElementById("invoiceSearch")?.value||"").toLowerCase();
  const arr=[...db.invoices].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).filter(i=>`${i.number} ${i.customerName}`.toLowerCase().includes(q));
  document.getElementById("invoiceList").innerHTML=arr.length?arr.map(invoiceRow).join(""):`<tr><td colspan="6" class="empty">Belum ada nota.</td></tr>`;
}

async function markPaid(id){
  const inv=db.invoices.find(x=>x.id===id);if(!inv)return;
  inv.status="LUNAS"; inv.dueDate=""; inv.updatedAt=new Date().toISOString();
  saveCache(); refreshAll();
  toast("Status nota diperbarui di perangkat.");
}

function duplicateInvoice(id){
  const inv=db.invoices.find(i=>i.id===id); if(!inv) return;
  currentEditingInvoice=null;
  showPage("nota");
  document.getElementById("invoicePageTitle").textContent="Duplikat Nota";
  document.getElementById("invoiceNumber").value=nextInvoiceNumber();
  document.getElementById("invoiceDate").value=today();
  document.getElementById("invoiceStatus").value="LUNAS";
  document.getElementById("paymentMethod").value=inv.paymentMethod||"Tunai";
  document.getElementById("dueDate").value="";
  document.getElementById("customerName").value=inv.customerName||"";
  document.getElementById("customerPhone").value=inv.customerPhone||"";
  document.getElementById("customerAddress").value=inv.customerAddress||"";
  document.getElementById("invoiceNote").value=inv.note||"";
  document.getElementById("invoiceItems").innerHTML="";
  inv.items.forEach(addInvoiceItem);
  updateInvoiceTotals();
  toast("Nota diduplikasi. Tinggal cek lalu simpan.");
}

async function deleteInvoice(id){
  const inv=db.invoices.find(i=>i.id===id);if(!inv)return;
  if(!confirm(`Hapus nota ${inv.number}? Stok akan dikembalikan.`))return;
  applyLocalDeleteInvoice(id);
  toast("Nota dihapus dan stok dikembalikan.");
}

function editInvoice(id){
  const inv=db.invoices.find(i=>i.id===id);if(!inv)return;
  currentEditingInvoice=id;showPage("nota");
  document.getElementById("invoicePageTitle").textContent="Edit Nota";
  document.getElementById("invoiceNumber").value=inv.number;
  document.getElementById("invoiceDate").value=inv.date;
  document.getElementById("invoiceStatus").value=inv.status;
  document.getElementById("paymentMethod").value=inv.paymentMethod||"Tunai";
  document.getElementById("dueDate").value=inv.dueDate||"";
  document.getElementById("customerName").value=inv.customerName||"";
  document.getElementById("customerPhone").value=inv.customerPhone||"";
  document.getElementById("customerAddress").value=inv.customerAddress||"";
  document.getElementById("invoiceNote").value=inv.note||"";
  document.getElementById("invoiceItems").innerHTML="";
  inv.items.forEach(addInvoiceItem);
  updateInvoiceTotals();
}

/* ================= PREVIEW ================= */

function buildInvoiceHtml(inv, style=currentInvoiceStyle){
  const p=db.profile;
  const mode=style==="thermal"?"thermal":"modern";
  const logo=p.logo?`<img src="${p.logo}" alt="Logo">`:"";
  if(mode==="thermal"){
    const items=inv.items.map(i=>`
      <tr><td colspan="2"><strong>${escapeHtml(i.name)}</strong>${i.description?`<small>${escapeHtml(i.description)}</small>`:""}</td></tr>
      <tr class="thermal-detail"><td>${i.qty} x ${money(i.price)}${i.discount?` • Disc ${money(i.discount)}`:""}</td><td class="thermal-right">${money(i.total)}</td></tr>`).join("");
    return `<div class="invoice-paper invoice-thermal">
      <div class="thermal-brand">${logo}<h2>${escapeHtml(p.name||"Toko Saya")}</h2>${p.address?`<p>${escapeHtml(p.address)}</p>`:""}${p.phone?`<p>${escapeHtml(p.phone)}</p>`:""}</div>
      <div class="thermal-title">NOTA PENJUALAN</div>
      <div class="thermal-meta"><span>${escapeHtml(inv.number)}</span><span>${formatDate(inv.date)}</span><span>${escapeHtml(inv.status)}</span><span>${escapeHtml(inv.paymentMethod||"Tunai")}</span></div>
      <div class="thermal-rule"></div>
      <div class="thermal-customer"><strong>Kepada</strong><br>${escapeHtml(inv.customerName||"Umum")}${inv.customerPhone?`<br>${escapeHtml(inv.customerPhone)}`:""}${inv.customerAddress?`<br>${escapeHtml(inv.customerAddress)}`:""}</div>
      <div class="thermal-rule"></div>
      <table><tbody>${items}</tbody></table>
      <div class="thermal-rule"></div>
      <div class="thermal-totals"><div><span>Subtotal</span><strong>${money(inv.subtotal)}</strong></div><div><span>Diskon</span><strong>${money(inv.discount)}</strong></div><div class="thermal-grand"><span>TOTAL</span><strong>${money(inv.total)}</strong></div></div>
      ${p.bankName||p.bankAccount?`<div class="thermal-extra"><strong>Pembayaran</strong><br>${escapeHtml(p.bankName||"")} ${escapeHtml(p.bankAccount||"")}<br>a.n. ${escapeHtml(p.bankHolder||"")}</div>`:""}
      ${inv.note?`<div class="thermal-extra"><strong>Catatan</strong><br>${escapeHtml(inv.note)}</div>`:""}
      <div class="thermal-rule"></div><div class="thermal-footer">${escapeHtml(p.footer||"Terima kasih sudah berbelanja.")}</div>
      <div class="thermal-dots">• • • • • • • • • • • • • • •</div>
    </div>`;
  }
  const items=inv.items.map(i=>`<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.description||"-")}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.discount)}</td><td>${money(i.total)}</td></tr>`).join("");
  return `<div class="invoice-paper invoice-modern">
    <div class="invoice-head"><div class="invoice-brand">${logo}<h2>${escapeHtml(p.name||"Toko Saya")}</h2><p>${escapeHtml(p.address||"")}${p.phone?"\n"+escapeHtml(p.phone):""}</p></div>
    <div class="invoice-meta"><strong>NOTA PENJUALAN</strong><div>${escapeHtml(inv.number)}</div><div>${formatDate(inv.date)}</div><div>${escapeHtml(inv.status)}</div><div>${escapeHtml(inv.paymentMethod||"Tunai")}</div></div></div>
    <div class="invoice-customer"><strong>Kepada:</strong> ${escapeHtml(inv.customerName||"Umum")} ${inv.customerPhone?" · "+escapeHtml(inv.customerPhone):""}<br>${escapeHtml(inv.customerAddress||"")}</div>
    <table><thead><tr><th>Produk</th><th>Deskripsi</th><th>Qty</th><th>Harga</th><th>Diskon</th><th>Total</th></tr></thead><tbody>${items}</tbody></table>
    <div class="invoice-summary"><div><span>Subtotal</span><strong>${money(inv.subtotal)}</strong></div><div><span>Diskon</span><strong>${money(inv.discount)}</strong></div><div class="total"><span>Total</span><strong>${money(inv.total)}</strong></div></div>
    ${p.bankName||p.bankAccount?`<div class="invoice-bank"><strong>Pembayaran:</strong><br>${escapeHtml(p.bankName)} ${escapeHtml(p.bankAccount)} a.n. ${escapeHtml(p.bankHolder)}</div>`:""}
    ${inv.note?`<div class="invoice-bank"><strong>Catatan:</strong><br>${escapeHtml(inv.note)}</div>`:""}
    <div class="invoice-footer">${escapeHtml(p.footer||"")}</div></div>`;
}
function setInvoiceStyle(style){
  currentInvoiceStyle = style==="thermal" ? "thermal" : "modern";
  localStorage.setItem("notakilat_invoice_style", currentInvoiceStyle);
  const modernBtn=document.getElementById("previewModernBtn");
  const thermalBtn=document.getElementById("previewThermalBtn");
  if(modernBtn) modernBtn.classList.toggle("active", currentInvoiceStyle==="modern");
  if(thermalBtn) thermalBtn.classList.toggle("active", currentInvoiceStyle==="thermal");
  const profileStyle=document.getElementById("invoiceStyleDefault");
  if(profileStyle) profileStyle.value=currentInvoiceStyle;
  if(currentPreviewInvoice) document.getElementById("invoicePreview").innerHTML=buildInvoiceHtml(currentPreviewInvoice,currentInvoiceStyle);
}

function getFormInvoice(){
  const items=collectInvoiceItems();
  if(!items.length) return null;
  const subtotal=items.reduce((s,i)=>s+i.qty*i.price,0);
  const discount=items.reduce((s,i)=>s+i.discount,0);
  return {number:document.getElementById("invoiceNumber").value,date:document.getElementById("invoiceDate").value,status:document.getElementById("invoiceStatus").value,paymentMethod:document.getElementById("paymentMethod").value||"Tunai",customerName:document.getElementById("customerName").value,customerPhone:document.getElementById("customerPhone").value,customerAddress:document.getElementById("customerAddress").value,note:document.getElementById("invoiceNote").value,items,subtotal,discount,total:Math.max(0,subtotal-discount)};
}

function previewInvoice(){
  const inv=getFormInvoice();
  if(!inv){alert("Tambahkan item produk terlebih dahulu.");return;}
  currentPreviewInvoice=inv;
  setInvoiceStyle(currentInvoiceStyle);
  document.getElementById("invoicePreview").innerHTML=buildInvoiceHtml(inv,currentInvoiceStyle);
  openModal("previewModal");
}

function previewSavedInvoice(id){
  const inv=db.invoices.find(i=>i.id===id);if(!inv)return;
  currentPreviewInvoice=inv;
  setInvoiceStyle(currentInvoiceStyle);
  document.getElementById("invoicePreview").innerHTML=buildInvoiceHtml(inv,currentInvoiceStyle);
  openModal("previewModal");
}

function invoiceShareText(inv){
  const p=db.profile;
  const lines=[
    `Halo ${inv.customerName || "Kak"},`,
    `Berikut nota dari *${p.name || "Toko Saya"}*`,
    `No. Nota: ${inv.number}`,
    `Tanggal: ${formatDate(inv.date)}`,
    `Total: *${money(inv.total)}*`,
    `Status: ${inv.status}`
  ];
  if(inv.note) lines.push(`Catatan: ${inv.note}`);
  lines.push("Terima kasih sudah berbelanja 🙏");
  return lines.join("\n");
}

function normalizeWaNumber(phone){
  let n=String(phone||"").replace(/\D/g,"");
  if(n.startsWith("0")) n="62"+n.slice(1);
  if(n.startsWith("8")) n="62"+n;
  return n;
}

function getInvoiceForSharing(){
  return currentPreviewInvoice || getFormInvoice();
}

function invoiceToSvg(inv, style=currentInvoiceStyle){
  const p=db.profile;
  const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const text=(x,yy,t,size=24,weight=400,anchor="start",family="Arial")=>`<text x="${x}" y="${yy}" font-family="${family},sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="#202124">${esc(t)}</text>`;
  if(style==="thermal"){
    const W=384,pad=24;let y=28;const lines=[`<rect width="100%" height="100%" fill="#fff"/>`];
    if(p.logo){lines.push(`<image href="${p.logo}" x="${W/2-42}" y="${y}" width="84" height="60" preserveAspectRatio="xMidYMid meet"/>`);y+=76;}
    lines.push(text(W/2,y,p.name||"Toko Saya",24,700,"middle","Courier New"));y+=24;
    if(p.address){lines.push(text(W/2,y,p.address.slice(0,48),13,400,"middle","Courier New"));y+=18;}
    if(p.phone){lines.push(text(W/2,y,p.phone,13,400,"middle","Courier New"));y+=18;}
    y+=8;lines.push(text(W/2,y,"NOTA PENJUALAN",18,700,"middle","Courier New"));y+=23;
    lines.push(text(W/2,y,inv.number,13,400,"middle","Courier New"));y+=18;
    lines.push(text(W/2,y,`${formatDate(inv.date)} • ${inv.status}`,13,400,"middle","Courier New"));y+=20;
    lines.push(`<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#222" stroke-dasharray="5 5"/>`);y+=22;
    lines.push(text(pad,y,`Kepada: ${inv.customerName||"Umum"}`,14,700,"start","Courier New"));y+=18;
    if(inv.customerPhone){lines.push(text(pad,y,inv.customerPhone,12,400,"start","Courier New"));y+=17;}
    y+=8;lines.push(`<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#222" stroke-dasharray="5 5"/>`);y+=22;
    inv.items.forEach(item=>{
      lines.push(text(pad,y,String(item.name).slice(0,32),14,700,"start","Courier New"));y+=18;
      const desc=String(item.description||"").slice(0,30);if(desc){lines.push(text(pad,y,desc,11,400,"start","Courier New"));y+=15;}
      lines.push(text(pad,y,`${item.qty} x ${money(item.price)}`,12,400,"start","Courier New"));lines.push(text(W-pad,y,money(item.total),12,700,"end","Courier New"));y+=19;
      if(item.discount){lines.push(text(pad,y,`diskon ${money(item.discount)}`,11,400,"start","Courier New"));y+=16;}
    });
    y+=4;lines.push(`<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#222" stroke-dasharray="5 5"/>`);y+=22;
    lines.push(text(pad,y,"Subtotal",13,400,"start","Courier New"));lines.push(text(W-pad,y,money(inv.subtotal),13,700,"end","Courier New"));y+=19;
    lines.push(text(pad,y,"Diskon",13,400,"start","Courier New"));lines.push(text(W-pad,y,money(inv.discount),13,700,"end","Courier New"));y+=22;
    lines.push(text(pad,y,"TOTAL",18,700,"start","Courier New"));lines.push(text(W-pad,y,money(inv.total),18,700,"end","Courier New"));y+=25;
    if(p.bankName||p.bankAccount){lines.push(text(pad,y,`Bayar: ${(p.bankName||"")} ${(p.bankAccount||"")}`,11,400,"start","Courier New"));y+=16;lines.push(text(pad,y,`a.n. ${p.bankHolder||""}`,11,400,"start","Courier New"));y+=18;}
    if(inv.note){lines.push(text(pad,y,`Catatan: ${String(inv.note).slice(0,46)}`,11,400,"start","Courier New"));y+=18;}
    y+=4;lines.push(`<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#222" stroke-dasharray="5 5"/>`);y+=20;
    lines.push(text(W/2,y,p.footer||"Terima kasih sudah berbelanja.",11,400,"middle","Courier New"));y+=18;
    lines.push(text(W/2,y,"* * * * * * * * *",12,400,"middle","Courier New"));y+=20;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}">${lines.join("")}</svg>`;
  }
  const W=900,pad=48;let y=55;const lines=[`<rect width="100%" height="100%" fill="#ffffff"/>`];
  if(p.logo)lines.push(`<image href="${p.logo}" x="${pad}" y="${y-25}" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>`);
  const brandX=p.logo?170:pad;lines.push(text(brandX,y,p.name||"Toko Saya",32,700));y+=34;
  if(p.address){lines.push(text(brandX,y,p.address,18));y+=25;}if(p.phone){lines.push(text(brandX,y,p.phone,18));y+=25;}
  lines.push(text(W-pad,55,"NOTA PENJUALAN",24,700,"end"));lines.push(text(W-pad,86,inv.number,20,400,"end"));lines.push(text(W-pad,114,formatDate(inv.date),18,400,"end"));
  y=Math.max(y,150);lines.push(`<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#dddddd"/>`);y+=38;
  lines.push(text(pad,y,`Kepada: ${inv.customerName||"Umum"}`,20,700));y+=28;
  if(inv.customerPhone){lines.push(text(pad,y,inv.customerPhone,18));y+=24;}if(inv.customerAddress){lines.push(text(pad,y,inv.customerAddress,18));y+=28;}
  y+=15;const cols=[pad,360,500,590,690,800];lines.push(`<rect x="${pad}" y="${y-25}" width="${W-pad*2}" height="38" fill="#f3f4f6"/>`);
  ["Produk","Deskripsi","Qty","Harga","Diskon","Total"].forEach((h,i)=>lines.push(text(cols[i],y,h,16,700,i>=2?"end":"start")));y+=32;
  inv.items.forEach(item=>{lines.push(text(cols[0],y,String(item.name).slice(0,30),16));lines.push(text(cols[1],y,String(item.description||"-").slice(0,18),16));lines.push(text(cols[2],y,String(item.qty),16,400,"end"));lines.push(text(cols[3],y,money(item.price),16,400,"end"));lines.push(text(cols[4],y,money(item.discount),16,400,"end"));lines.push(text(cols[5],y,money(item.total),16,700,"end"));y+=30;});
  y+=15;lines.push(`<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#dddddd"/>`);y+=35;
  lines.push(text(W-300,y,"Subtotal",18));lines.push(text(W-pad,y,money(inv.subtotal),18,700,"end"));y+=28;
  lines.push(text(W-300,y,"Diskon",18));lines.push(text(W-pad,y,money(inv.discount),18,700,"end"));y+=34;
  lines.push(text(W-300,y,"TOTAL",24,700));lines.push(text(W-pad,y,money(inv.total),24,700,"end"));y+=42;
  if(p.bankName||p.bankAccount){lines.push(text(pad,y,`Pembayaran: ${p.bankName||""} ${p.bankAccount||""} a.n. ${p.bankHolder||""}`,17));y+=28;}
  if(inv.note){lines.push(text(pad,y,`Catatan: ${String(inv.note).slice(0,80)}`,17));y+=28;}
  lines.push(`<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#eeeeee"/>`);y+=32;lines.push(text(W/2,y,p.footer||"Terima kasih sudah berbelanja.",17,400,"middle"));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y+35}" viewBox="0 0 ${W} ${y+35}">${lines.join("")}</svg>`;
}

async function invoiceToFile(inv){
  const svg=invoiceToSvg(inv,currentInvoiceStyle);
  const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
    const scale=Math.min(2,window.devicePixelRatio||1);
    const canvas=document.createElement("canvas");
    canvas.width=900*scale; canvas.height=img.height*scale;
    const ctx=canvas.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,"image/png",1));
    return new File([png],`Nota-${inv.number||"Nota"}.png`,{type:"image/png"});
  } finally { URL.revokeObjectURL(url); }
}

async function downloadInvoiceImage(inv){
  const file=await invoiceToFile(inv);
  const a=document.createElement("a"); a.href=URL.createObjectURL(file); a.download=file.name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

async function shareInvoiceWhatsApp(id){
  const inv=db.invoices.find(x=>x.id===id); if(!inv)return;
  const phone=normalizeWaNumber(inv.customerPhone);
  if(!phone){alert("Nomor WhatsApp pelanggan belum diisi di nota.");return;}
  try{
    const file=await invoiceToFile(inv);
    const text=invoiceShareText(inv);
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file],text,title:`Nota ${inv.number}`});
      return;
    }
    await downloadInvoiceImage(inv);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,"_blank");
    toast("Gambar nota diunduh + WhatsApp dibuka. Lampirkan gambar nota ke chat.");
  }catch(err){
    const text=invoiceShareText(inv);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,"_blank");
    toast("WhatsApp dibuka dengan teks nota.");
  }
}

async function downloadPreviewImage(){
  const inv=getInvoiceForSharing();
  if(!inv){alert("Tambahkan item terlebih dahulu.");return;}
  try{ await downloadInvoiceImage(inv); toast("Gambar nota berhasil diunduh."); }catch(err){ alert("Gagal membuat gambar nota: "+err.message); }
}

async function sharePreviewWhatsApp(){
  const inv=getInvoiceForSharing();
  if(!inv){alert("Tambahkan item terlebih dahulu.");return;}
  const phone=normalizeWaNumber(inv.customerPhone);
  if(!phone){alert("Nomor WhatsApp pelanggan belum diisi.");return;}
  try{
    const file=await invoiceToFile(inv);
    const text=invoiceShareText(inv);
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})) return navigator.share({files:[file],text,title:`Nota ${inv.number}`});
    await downloadInvoiceImage(inv);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,"_blank");
    toast("Gambar diunduh + WhatsApp dibuka. Tinggal lampirkan gambarnya.");
  }catch(err){ window.open(`https://wa.me/${phone}?text=${encodeURIComponent(invoiceShareText(inv))}`,"_blank"); }
}

function printInvoice(){
  const html=document.getElementById("invoicePreview").innerHTML;
  const w=window.open("","_blank","width=900,height=700");
  w.document.write(`<html><head><title>NotaKilat</title><link rel="stylesheet" href="style.css"></head><body>${html}<script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}


/* ================= BACKUP / EXPORT ================= */

const CSV_COLUMNS=["type","id","name","phone","address","price","stock","supplier","hpp","qty","cost","purchaseDate","purchaseNote","createdAt","updatedAt","number","date","dueDate","status","customerName","customerPhone","customerAddress","note","subtotal","discount","total","invoiceItems","storeName","footer","bankName","bankAccount","bankHolder","logo"];

function csvEscape(v){
  const s=typeof v==="string"?v:String(v??"");
  return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function toCsv(rows){return [CSV_COLUMNS.join(","),...rows.map(r=>CSV_COLUMNS.map(k=>csvEscape(r[k]??"")).join(","))].join("\r\n");}
function downloadBlob(blob,name){const a=document.createElement("a");const u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
function exportCsv(){
  const rows=[];
  db.products.forEach(x=>rows.push({type:"product",...x}));
  (db.purchases||[]).forEach(x=>rows.push({type:"purchase",...x,purchaseDate:x.date,purchaseNote:x.note}));
  db.customers.forEach(x=>rows.push({type:"customer",...x}));
  db.invoices.forEach(x=>rows.push({type:"invoice",...x,invoiceItems:JSON.stringify(x.items||[])}));
  rows.push({type:"profile",storeName:db.profile.name,phone:db.profile.phone,address:db.profile.address,footer:db.profile.footer,bankName:db.profile.bankName,bankAccount:db.profile.bankAccount,bankHolder:db.profile.bankHolder,logo:db.profile.logo});
  downloadBlob(new Blob(["\ufeff"+toCsv(rows)],{type:"text/csv;charset=utf-8"}),`NotaKilat-Export-${today()}.csv`);
  toast("CSV berhasil diunduh.");
}

function parseCsv(text){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){
      if(quoted&&next==='"'){cell+='"';i++;}
      else quoted=!quoted;
    } else if(ch===','&&!quoted){row.push(cell);cell="";}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell="";if(row.some(v=>v!==""))rows.push(row);row=[];}
    else cell+=ch;
  }
  row.push(cell);if(row.some(v=>v!==""))rows.push(row);
  if(!rows.length)return [];
  const headers=rows.shift().map(h=>h.replace(/^\ufeff/,""));
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
}

async function importCsv(file){
  if(!file)return;
  try{
    const rows=parseCsv(await file.text());
    if(!rows.length)throw new Error("CSV kosong.");
    if(!confirm("Import CSV akan mengganti data lokal NotaKilat. Lanjutkan?"))return;
    const next=structuredClone(defaultDB);
    rows.forEach(r=>{
      if(r.type==="product") next.products.push({id:r.id||uid("prd"),name:r.name||"",price:Number(r.price||0),hpp:Number(r.hpp||0),stock:Number(r.stock||0),stockMin:Number(r.stockMin||5),supplierId:r.supplierId||"",supplier:r.supplier||"",createdAt:r.createdAt||new Date().toISOString(),updatedAt:r.updatedAt||new Date().toISOString()});
      else if(r.type==="customer") next.customers.push({id:r.id||uid("cus"),name:r.name||"",phone:r.phone||"",address:r.address||"",createdAt:r.createdAt||new Date().toISOString(),updatedAt:r.updatedAt||new Date().toISOString()});
      else if(r.type==="purchase") next.purchases.push({id:r.id||uid("pur"),productId:r.productId||"",productName:r.productName||"",supplier:r.supplier||"",qty:Number(r.qty||0),cost:Number(r.cost||0),date:r.purchaseDate||r.date||today(),note:r.purchaseNote||r.note||"",total:Number(r.total||0),createdAt:r.createdAt||new Date().toISOString()});
      else if(r.type==="invoice") {let items=[];try{items=JSON.parse(r.invoiceItems||"[]")}catch(e){} next.invoices.push({id:r.id||uid("inv"),number:r.number||"",date:r.date||today(),dueDate:r.dueDate||"",status:r.status||"LUNAS",customerName:r.customerName||"Umum",customerPhone:r.customerPhone||"",customerAddress:r.customerAddress||"",note:r.note||"",subtotal:Number(r.subtotal||0),discount:Number(r.discount||0),total:Number(r.total||0),items,createdAt:r.createdAt||new Date().toISOString(),updatedAt:r.updatedAt||new Date().toISOString()});}
      else if(r.type==="profile") next.profile={name:r.storeName||"Toko Saya",phone:r.phone||"",address:r.address||"",footer:r.footer||"",bankName:r.bankName||"",bankAccount:r.bankAccount||"",bankHolder:r.bankHolder||"",logo:r.logo||"",theme:r.theme||"modern"};
    });
    db=next;saveCache();refreshAll();
    toast("Import CSV berhasil. Data tersimpan di perangkat.");
  }catch(err){alert("Import CSV gagal: "+err.message);}
  const input=document.getElementById("importCsvInput"); if(input) input.value="";
}

function exportBackupJson(){
  downloadBlob(new Blob([JSON.stringify(db,null,2)],{type:"application/json;charset=utf-8"}),`NotaKilat-Backup-${today()}.json`);
  toast("Backup JSON berhasil diunduh.");
}

async function importBackupJson(file){
  if(!file)return;
  try{
    const parsed=JSON.parse(await file.text());
    const next={...structuredClone(defaultDB),...parsed,profile:{...defaultDB.profile,...(parsed.profile||{})},products:Array.isArray(parsed.products)?parsed.products:[],customers:Array.isArray(parsed.customers)?parsed.customers:[],suppliers:Array.isArray(parsed.suppliers)?parsed.suppliers:[],invoices:Array.isArray(parsed.invoices)?parsed.invoices:[]};
    if(!confirm("Restore backup akan mengganti data lokal NotaKilat. Lanjutkan?"))return;
    db=next;saveCache();refreshAll();
    applyTheme(db.profile.theme || "modern");
    toast("Restore berhasil. Data dipulihkan di perangkat.");
    updateStorageStatus();
  }catch(err){alert("Restore gagal: "+err.message);}
  const input=document.getElementById("importJsonInput"); if(input) input.value="";
}

/* ================= PRODUCTS ================= */

function renderProducts(){
  const q=(document.getElementById("productSearch")?.value||"").toLowerCase();
  const arr=db.products.filter(p=>p.name.toLowerCase().includes(q));
  document.getElementById("productCount").textContent=`${db.products.length} produk`;
  document.getElementById("productTable").innerHTML=arr.length?arr.map(p=>{
    const status=p.stock<=0?`<span class="badge due">HABIS</span>`:p.stock<=(Number(p.stockMin||5))?`<span class="badge unpaid">STOK MENIPIS</span>`:`<span class="badge paid">TERSEDIA</span>`;
    return `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${money(p.hpp||0)}</td><td>${money(p.price)}</td><td class="${p.stock<=0?"out-stock":p.stock<=Number(p.stockMin||5)?"low-stock":""}">${p.stock}</td><td>${escapeHtml(p.supplier||"-")}</td><td>${status}</td><td><div class="actions"><button class="action-btn" onclick="editProduct('${p.id}')">Edit</button><button class="action-btn delete" onclick="deleteProduct('${p.id}')">Hapus</button></div></td></tr>`;
  }).join(""):`<tr><td colspan="5" class="empty">Belum ada produk.</td></tr>`;
}

function populateProductSuppliers(selectedId="", legacyName=""){
  const el=document.getElementById("productSupplier"); if(!el)return;
  el.innerHTML='<option value="">Pilih supplier</option>'+(db.suppliers||[]).map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join("");
  if(selectedId && (db.suppliers||[]).some(s=>s.id===selectedId)) el.value=selectedId;
  else if(legacyName){const s=(db.suppliers||[]).find(x=>x.name.toLowerCase()===legacyName.toLowerCase()); if(s)el.value=s.id;}
}

function openProductModal(id=null){
  document.getElementById("productEditId").value=id||"";
  document.getElementById("productModalTitle").textContent=id?"Edit Produk":"Tambah Produk";
  const p=id?db.products.find(x=>x.id===id):null;
  document.getElementById("productName").value=p?.name||"";
  document.getElementById("productHpp").value=p?.hpp||"";
  document.getElementById("productPrice").value=p?.price||"";
  document.getElementById("productStock").value=p?.stock??"";
  document.getElementById("productStockMin").value=p?.stockMin??5;
  populateProductSuppliers(p?.supplierId||"", p?.supplier||"");
  openModal("productModal");
}
function editProduct(id){openProductModal(id)}

async function saveProduct(){
  const id=document.getElementById("productEditId").value;
  const name=document.getElementById("productName").value.trim();
  const hpp=Number(document.getElementById("productHpp").value||0);
  const price=Number(document.getElementById("productPrice").value||0);
  const stock=Number(document.getElementById("productStock").value||0);
  const stockMin=Number(document.getElementById("productStockMin").value||0);
  const supplierId=document.getElementById("productSupplier").value;
  const supplierObj=(db.suppliers||[]).find(x=>x.id===supplierId);
  const supplier=supplierObj?.name||"";
  if(!name){alert("Nama produk wajib diisi.");return;}
  const old=id?db.products.find(x=>x.id===id):null;
  const data={id:id||uid("prd"),name,hpp,price,stock,stockMin,supplierId,supplier,createdAt:old?.createdAt||new Date().toISOString()};
  applyLocalSaveProduct(data);
  closeModal("productModal");
  toast("Produk tersimpan di perangkat.");
}

async function deleteProduct(id){
  const p=db.products.find(x=>x.id===id);if(!p)return;
  if(!confirm(`Hapus produk ${p.name}?`))return;
  if(db.invoices.some(inv=>inv.items.some(x=>x.productId===id))){ alert("Produk sudah dipakai pada nota dan tidak boleh dihapus."); return; }
  applyLocalDeleteProduct(id);
  toast("Produk dihapus dari perangkat.");
}


/* ================= KULAKAN ================= */
function populatePurchaseProducts(){
  const el=document.getElementById("purchaseProduct"); if(!el)return;
  const current=el.value;
  el.innerHTML='<option value="">Pilih produk</option>'+db.products.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — HPP ${money(p.hpp||0)}</option>`).join("");
  if(current && db.products.some(p=>p.id===current)) el.value=current;
  const d=document.getElementById("purchaseDate"); if(d&&!d.value)d.value=today();
}
function syncPurchaseProduct(){
  const id=document.getElementById("purchaseProduct")?.value; const p=db.products.find(x=>x.id===id); if(!p)return;
  document.getElementById("purchaseCost").value=p.hpp||"";
  document.getElementById("purchaseSupplier").value=p.supplier||"";
}
function savePurchase(){
  const productId=document.getElementById("purchaseProduct").value;
  const p=db.products.find(x=>x.id===productId);
  const supplier=document.getElementById("purchaseSupplier").value.trim();
  const qty=Math.floor(Number(document.getElementById("purchaseQty").value||0));
  const cost=Number(document.getElementById("purchaseCost").value||0);
  const date=document.getElementById("purchaseDate").value||today();
  const note=document.getElementById("purchaseNote").value.trim();
  if(!p){alert("Pilih produk terlebih dahulu.");return;}
  if(qty<=0){alert("Jumlah kulakan harus lebih dari 0.");return;}
  if(cost<0){alert("Harga modal tidak valid.");return;}
  const purchase={id:uid("pur"),productId:p.id,productName:p.name,supplier,qty,cost,date,note,total:qty*cost,createdAt:new Date().toISOString()};
  db.purchases.push(purchase);
  const oldStock=Number(p.stock||0);
  const oldHpp=Number(p.hpp||0);
  p.stock=oldStock+qty;
  if(cost>0){ p.hpp = oldStock>0 ? ((oldHpp*oldStock)+(cost*qty))/(oldStock+qty) : cost; }
  if(supplier){p.supplier=supplier; const sup=(db.suppliers||[]).find(x=>x.name.toLowerCase()===supplier.toLowerCase()); if(sup)p.supplierId=sup.id;}
  saveCache();
  document.getElementById("purchaseQty").value="";
  document.getElementById("purchaseNote").value="";
  refreshAll();
  toast(`Kulakan ${p.name} × ${qty} tersimpan. Stok bertambah.`);
}
function renderPurchases(){
  const q=(document.getElementById("purchaseSearch")?.value||"").toLowerCase();
  const arr=(db.purchases||[]).filter(x=>`${x.productName} ${x.supplier} ${x.note}`.toLowerCase().includes(q)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const count=document.getElementById("purchaseCount"); if(count)count.textContent=`${(db.purchases||[]).length} transaksi kulakan`;
  const table=document.getElementById("purchaseTable"); if(!table)return;
  table.innerHTML=arr.length?arr.map(x=>`<tr><td>${formatDate(x.date)}</td><td><strong>${escapeHtml(x.productName||"")}</strong></td><td>${escapeHtml(x.supplier||"-")}</td><td>${x.qty}</td><td>${money(x.cost)}</td><td><strong>${money(x.total)}</strong></td><td>${escapeHtml(x.note||"-")}</td></tr>`).join(""):`<tr><td colspan="7" class="empty">Belum ada riwayat kulakan.</td></tr>`;
}
function startVoicePurchase(){
  startSpeechCapture({buttonId:null,statusId:"purchaseVoiceStatus",placeholder:'Contoh: “Beras 20, harga modal 12000, kulak di Toko Makmur”',process:(text)=>{
    const t=String(text||"").trim(), low=normalizeVoiceText(t);
    const products=[...db.products].sort((a,b)=>String(b.name).length-String(a.name).length);
    const p=products.find(x=>low.includes(String(x.name).toLowerCase()));
    const qtyMatch=low.match(/(?:^|\s)(\d+|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|duabelas|dua belas|tigabelas|tiga belas|duapuluh|dua puluh)(?=\s|$)/i);
    const cost=extractLabeledNumber(t,"(?:harga\\s+modal|hpp|modal)");
    const sm=t.match(/(?:kulak(?:an)?(?:\s+di)?|supplier|pemasok)\s+(.+?)(?=$|[,.])/i);
    if(p)document.getElementById("purchaseProduct").value=p.id;
    if(p)syncPurchaseProduct();
    if(qtyMatch)document.getElementById("purchaseQty").value=qtyFromVoice(qtyMatch[1]);
    if(cost)document.getElementById("purchaseCost").value=cost;
    if(sm)document.getElementById("purchaseSupplier").value=sm[1].trim();
    return {message:`✅ ${p?p.name:"Produk belum ditemukan"}${qtyMatch?` · qty ${qtyFromVoice(qtyMatch[1])}`:""}${cost?` · modal ${money(cost)}`:""}${sm?` · ${sm[1].trim()}`:""}. Cek lalu Simpan Kulakan.`};
  }});
}

/* ================= SUPPLIERS ================= */
function renderSuppliers(){
  const q=(document.getElementById("supplierSearch")?.value||"").toLowerCase();
  const arr=(db.suppliers||[]).filter(s=>`${s.name} ${s.contact} ${s.phone} ${s.address} ${s.note}`.toLowerCase().includes(q));
  const count=document.getElementById("supplierCount"); if(count) count.textContent=`${(db.suppliers||[]).length} supplier`;
  const table=document.getElementById("supplierTable"); if(!table)return;
  table.innerHTML=arr.length?arr.map(s=>{
    const names=db.products.filter(p=>p.supplierId===s.id || p.supplier===s.name).map(p=>p.name).slice(0,4);
    return `<tr><td><strong>${escapeHtml(s.name)}</strong><br><small>${escapeHtml(s.contact||"")}</small></td><td>${escapeHtml(s.contact||"-")}</td><td>${escapeHtml(s.phone||"-")}</td><td>${escapeHtml(s.address||"-")}</td><td class="supplier-products">${names.length?escapeHtml(names.join(", ")):"-"}</td><td><div class="actions"><button class="action-btn" onclick="editSupplier('${s.id}')">Edit</button>${s.phone?`<button class="action-btn whatsapp" onclick="openSupplierWhatsApp('${s.id}')">WA</button>`:""}<button class="action-btn delete" onclick="deleteSupplier('${s.id}')">Hapus</button></div></td></tr>`;
  }).join(""):`<tr><td colspan="6" class="empty">Belum ada supplier.</td></tr>`;
}
function openSupplierModal(id=null){
  document.getElementById("supplierEditId").value=id||"";
  document.getElementById("supplierModalTitle").textContent=id?"Edit Supplier":"Tambah Supplier";
  const s=id?(db.suppliers||[]).find(x=>x.id===id):null;
  document.getElementById("supplierFormName").value=s?.name||"";
  document.getElementById("supplierFormContact").value=s?.contact||"";
  document.getElementById("supplierFormPhone").value=s?.phone||"";
  document.getElementById("supplierFormAddress").value=s?.address||"";
  document.getElementById("supplierFormNote").value=s?.note||"";
  openModal("supplierModal");
}
function editSupplier(id){openSupplierModal(id)}
function saveSupplier(){
  const id=document.getElementById("supplierEditId").value;
  const name=document.getElementById("supplierFormName").value.trim();
  if(!name){alert("Nama supplier wajib diisi.");return;}
  const old=(db.suppliers||[]).find(x=>x.id===id);
  const data={id:id||uid("sup"),name,contact:document.getElementById("supplierFormContact").value.trim(),phone:document.getElementById("supplierFormPhone").value.trim(),address:document.getElementById("supplierFormAddress").value.trim(),note:document.getElementById("supplierFormNote").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(!db.suppliers)db.suppliers=[];
  const idx=db.suppliers.findIndex(x=>x.id===data.id); if(idx>=0)db.suppliers[idx]=data; else db.suppliers.push(data);
  db.products.forEach(p=>{if(p.supplier===data.name && !p.supplierId)p.supplierId=data.id;});
  saveCache(); closeModal("supplierModal"); refreshAll(); toast("Supplier tersimpan di perangkat.");
}
function deleteSupplier(id){
  const s=(db.suppliers||[]).find(x=>x.id===id);if(!s)return;
  if(!confirm(`Hapus supplier ${s.name}?`))return;
  db.suppliers=db.suppliers.filter(x=>x.id!==id); db.products.forEach(p=>{if(p.supplierId===id)p.supplierId="";}); saveCache(); refreshAll(); toast("Supplier dihapus.");
}
function openSupplierWhatsApp(id){
  const s=(db.suppliers||[]).find(x=>x.id===id);if(!s?.phone)return;
  const msg=encodeURIComponent(`Halo ${s.contact||s.name}, saya dari ${db.profile.name||"toko"}.`);
  window.open(`https://wa.me/${String(s.phone).replace(/\D/g,"")}?text=${msg}`,"_blank");
}
function startVoiceSupplierForm(){
  startSpeechCapture({buttonId:null,statusId:"supplierVoiceStatus",process:(text)=>{
    const t=String(text||"").trim(); const m=t.match(/^(.*?)(?:,|\s+kontak\s+|\s+wa\s+|\s+whatsapp\s+)(.*)$/i);
    const phone=(t.match(/(?:08\d{8,13}|\+62\d{8,13})/)||[])[0]||"";
    let name=t.split(/,|kontak|wa|whatsapp/i)[0].trim(); name=name.replace(/^tambah supplier\s*/i,"").trim();
    document.getElementById("supplierFormName").value=name;
    if(phone)document.getElementById("supplierFormPhone").value=phone;
    const cm=t.match(/(?:kontak)\s+([^,\d]+)/i); if(cm)document.getElementById("supplierFormContact").value=cm[1].trim();
    const am=t.match(/(?:alamat)\s+(.+)$/i); if(am)document.getElementById("supplierFormAddress").value=am[1].trim();
    return {message:"Supplier terisi. Cek data lalu klik Simpan."};
  }});
}

/* ================= CUSTOMERS ================= */

function renderCustomers(){
  const q=(document.getElementById("customerSearch")?.value||"").toLowerCase();
  const arr=db.customers.filter(c=>`${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(q));
  document.getElementById("customerCount").textContent=`${db.customers.length} pelanggan`;
  document.getElementById("customerTable").innerHTML=arr.length?arr.map(c=>{
    const total=db.invoices.filter(i=>i.customerName?.toLowerCase()===c.name.toLowerCase()).reduce((s,i)=>s+Number(i.total||0),0);
    return `<tr><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.phone||"-")}</td><td>${escapeHtml(c.address||"-")}</td><td>${money(total)}</td><td><div class="actions"><button class="action-btn" onclick="showCustomerHistory('${c.id}')">Riwayat</button><button class="action-btn" onclick="editCustomer('${c.id}')">Edit</button><button class="action-btn delete" onclick="deleteCustomer('${c.id}')">Hapus</button></div></td></tr>`;
  }).join(""):`<tr><td colspan="5" class="empty">Belum ada pelanggan.</td></tr>`;
}

function openCustomerModal(id=null){
  document.getElementById("customerEditId").value=id||"";
  document.getElementById("customerModalTitle").textContent=id?"Edit Pelanggan":"Tambah Pelanggan";
  const c=id?db.customers.find(x=>x.id===id):null;
  document.getElementById("customerFormName").value=c?.name||"";
  document.getElementById("customerFormPhone").value=c?.phone||"";
  document.getElementById("customerFormAddress").value=c?.address||"";
  openModal("customerModal");
}
function editCustomer(id){openCustomerModal(id)}

async function saveCustomer(){
  const id=document.getElementById("customerEditId").value;
  const name=document.getElementById("customerFormName").value.trim();
  const phone=document.getElementById("customerFormPhone").value.trim();
  const address=document.getElementById("customerFormAddress").value.trim();
  if(!name){alert("Nama pelanggan wajib diisi.");return;}
  const old=id?db.customers.find(x=>x.id===id):null;
  const data={id:id||uid("cus"),name,phone,address,createdAt:old?.createdAt||new Date().toISOString()};
  applyLocalSaveCustomer(data);
  closeModal("customerModal");
  toast("Pelanggan tersimpan di perangkat.");
}
async function deleteCustomer(id){
  const c=db.customers.find(x=>x.id===id);if(!c)return;
  if(!confirm(`Hapus pelanggan ${c.name}?`))return;
  applyLocalDeleteCustomer(id);
  toast("Pelanggan dihapus dari perangkat.");
}


function showCustomerHistory(id){
  const c=db.customers.find(x=>x.id===id); if(!c)return;
  const rows=db.invoices.filter(i=String(i.customerName||"").toLowerCase()===String(c.name||"").toLowerCase()).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const total=rows.reduce((s,i)=>s+Number(i.total||0),0);
  const text=rows.length?rows.slice(0,12).map(i=>`${i.number||"-"} · ${formatDate(i.date)} · ${money(i.total)} · ${i.status}`).join("\n"):"Belum ada transaksi.";
  alert(`${c.name}\n\nTotal transaksi: ${rows.length}\nTotal belanja: ${money(total)}\n\nRiwayat terbaru:\n${text}`);
}

/* ================= LAPORAN ================= */
function getReportInvoices(){
  const from=document.getElementById("reportFrom")?.value||"";
  const to=document.getElementById("reportTo")?.value||"";
  const status=document.getElementById("reportStatus")?.value||"all";
  return db.invoices.filter(i=>{
    if(from && i.date<from) return false;
    if(to && i.date>to) return false;
    if(status!=="all" && i.status!==status) return false;
    return true;
  });
}
function renderReports(){
  const from=document.getElementById("reportFrom"), to=document.getElementById("reportTo");
  if(from && !from.value) from.value=today().slice(0,7)+"-01";
  if(to && !to.value) to.value=today();
  const invoices=getReportInvoices();
  const omzet=invoices.reduce((s,i)=>s+Number(i.total||0),0);
  const profit=invoices.reduce((s,i)=>s+i.items.reduce((z,it)=>z+Math.max(0,(Number(it.price||0)-Number(it.hpp||0))*Number(it.qty||0)-Number(it.discount||0)),0),0);
  document.getElementById("reportRevenue").textContent=money(omzet);
  document.getElementById("reportProfit").textContent=money(profit);
  document.getElementById("reportCount").textContent=invoices.length;
  document.getElementById("reportAverage").textContent=money(invoices.length?omzet/invoices.length:0);
  const pay={};
  invoices.forEach(i=>{const k=i.paymentMethod||"Tunai";pay[k]=(pay[k]||0)+Number(i.total||0);});
  document.getElementById("paymentReport").innerHTML=Object.entries(pay).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="mini-row"><span>${escapeHtml(k)}</span><small>${money(v)}</small></div>`).join("")||`<div class="empty">Belum ada transaksi.</div>`;
  const tops={};
  invoices.forEach(inv=>inv.items.forEach(it=>{tops[it.name]=(tops[it.name]||0)+Number(it.qty||0);}));
  document.getElementById("reportTopProducts").innerHTML=Object.entries(tops).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([n,q],i)=>`<div class="mini-row"><span>${i+1}. ${escapeHtml(n)}</span><small>${q} unit</small></div>`).join("")||`<div class="empty">Belum ada penjualan.</div>`;
  document.getElementById("reportTable").innerHTML=invoices.length?[...invoices].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(inv=>{
    const gp=inv.items.reduce((s,it)=>s+Math.max(0,(Number(it.price||0)-Number(it.hpp||0))*Number(it.qty||0)-Number(it.discount||0)),0);
    return `<tr><td>${escapeHtml(inv.number)}</td><td>${formatDate(inv.date)}</td><td>${escapeHtml(inv.customerName||"Umum")}</td><td>${escapeHtml(inv.paymentMethod||"Tunai")}</td><td>${escapeHtml(inv.status)}</td><td><strong>${money(inv.total)}</strong></td><td>${money(gp)}</td></tr>`;
  }).join(""):`<tr><td colspan="7" class="empty">Tidak ada transaksi sesuai filter.</td></tr>`;
}
function exportReportCsv(){
  const invoices=getReportInvoices();
  const rows=[["No Nota","Tanggal","Pelanggan","Metode","Status","Total","Laba Kotor"]];
  invoices.forEach(inv=>rows.push([inv.number,inv.date,inv.customerName||"Umum",inv.paymentMethod||"Tunai",inv.status,inv.total,inv.items.reduce((s,it)=>s+Math.max(0,(Number(it.price||0)-Number(it.hpp||0))*Number(it.qty||0)-Number(it.discount||0)),0)]));
  downloadBlob("﻿"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"),"NotaKilat-Laporan.csv","text/csv;charset=utf-8");
}
function downloadBlob(content,name,type){
  const blob=new Blob([content],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* ================= PROFILE ================= */

function loadProfileForm(){
  const p=db.profile;
  applyTheme(p.theme || "modern");
  currentInvoiceStyle = p.invoiceStyle || localStorage.getItem("notakilat_invoice_style") || "modern";
  localStorage.setItem("notakilat_invoice_style", currentInvoiceStyle);
  document.getElementById("storeName").value=p.name||"";
  document.getElementById("storePhone").value=p.phone||"";
  document.getElementById("storeAddress").value=p.address||"";
  document.getElementById("storeFooter").value=p.footer||"";
  document.getElementById("bankName").value=p.bankName||"";
  document.getElementById("bankAccount").value=p.bankAccount||"";
  document.getElementById("bankHolder").value=p.bankHolder||"";
  const pin=document.getElementById("pinEnabled"); if(pin) pin.checked=p.pinEnabled!==false;
  const invoiceStyleSelect=document.getElementById("invoiceStyleDefault");
  if(invoiceStyleSelect) invoiceStyleSelect.value=currentInvoiceStyle;
  document.getElementById("storeNameTop").textContent=p.name||"Toko Saya";
  const img=document.getElementById("logoPreview");
  if(p.logo){img.src=p.logo;img.style.display="block"}else{img.removeAttribute("src");img.style.display="none";}
}

async function handleLogoUpload(e){
  const file=e.target.files?.[0];if(!file)return;
  if(!file.type.startsWith("image/")){alert("Pilih file gambar.");e.target.value="";return;}
  try {
    const compressed = await compressLogo(file);
    db.profile.logo=compressed;
    saveCache();
    const img=document.getElementById("logoPreview");
    img.src=compressed; img.style.display="block";
    toast("Logo siap. Ukuran otomatis dioptimalkan untuk penyimpanan offline.");
  } catch(err) {
    alert("Logo gagal diproses: " + err.message);
    e.target.value="";
  }
}

function compressLogo(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("File tidak bisa dibaca."));
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        let maxSide=1400;
        let quality=.88;
        let best="";
        for(let attempt=0;attempt<12;attempt++){
          const scale=Math.min(1,maxSide/Math.max(img.width,img.height));
          const w=Math.max(1,Math.round(img.width*scale));
          const h=Math.max(1,Math.round(img.height*scale));
          const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
          const ctx=canvas.getContext("2d");
          ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,w,h);
          ctx.drawImage(img,0,0,w,h);
          const type="image/webp";
          const out=canvas.toDataURL(type,quality);
          best=out;
          // Keep comfortably below Google Sheets' per-cell text limit.
          if(out.length<=180000) return resolve(out);
          if(quality>.42) quality-=.08; else maxSide=Math.round(maxSide*.82);
        }
        if(best.length<=220000) resolve(best);
        else reject(new Error("Logo terlalu besar untuk penyimpanan browser. Coba gambar yang sedikit lebih kecil."));
      };
      img.onerror=()=>reject(new Error("Format gambar tidak didukung browser."));
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveProfile(){
  const data={
    name:document.getElementById("storeName").value.trim()||"Toko Saya", phone:document.getElementById("storePhone").value.trim(),
    address:document.getElementById("storeAddress").value.trim(), footer:document.getElementById("storeFooter").value.trim(),
    bankName:document.getElementById("bankName").value.trim(), bankAccount:document.getElementById("bankAccount").value.trim(),
    bankHolder:document.getElementById("bankHolder").value.trim(), pinEnabled:!!document.getElementById("pinEnabled")?.checked, logo:db.profile.logo||"", theme:document.getElementById("storeTheme").value||"modern",
    invoiceStyle:document.getElementById("invoiceStyleDefault")?.value || currentInvoiceStyle || "modern"
  };
  applyLocalSaveProfile(data);
  applyTheme(data.theme || "modern");
  loadProfileForm();
  toast("Profil tersimpan di perangkat.");
}

/* ================= MODAL / REFRESH ================= */

function openModal(id){document.getElementById(id).classList.add("show")}
function closeModal(id){document.getElementById(id).classList.remove("show")}
window.addEventListener("click",e=>{if(e.target.classList.contains("modal"))e.target.classList.remove("show");});

function refreshAll(){
  renderDashboard();renderProducts();renderCustomers();renderInvoiceList();renderCustomerOptions();loadProfileForm();renderPurchases();populatePurchaseProducts();
}

function resetAllData(){
  if(!confirm("Yakin ingin menghapus SEMUA produk, pelanggan, nota, dan profil lokal? Tindakan ini tidak bisa dibatalkan tanpa backup.")) return;
  localStorage.removeItem(CACHE_KEY);
  db=structuredClone(defaultDB);
  saveCache();
  applyTheme("modern");
  refreshAll();
  resetInvoiceForm();
  showPage("nota");
  initPinGate();
  toast("Semua data lokal sudah direset.");
}

function syncNow(){
  toast("Mode offline: tidak ada sinkronisasi cloud. Data sudah tersimpan di perangkat.");
  updateStorageStatus();
}
function refreshFromServer(silent=false){
  refreshAll();
  if(!silent) toast("Data lokal diperbarui.");
}

/* Chart bawaan browser: tidak membutuhkan internet. */
