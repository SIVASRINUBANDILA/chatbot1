pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
marked.setOptions({ breaks: true, gfm: true });

// ── AUTH GUARD ──
(function authGuard() {
  const token = localStorage.getItem('ragToken');
  if (!token) { window.location.href = 'login.html'; return; }
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp < Date.now() / 1000) {
      localStorage.removeItem('ragToken'); localStorage.removeItem('ragUser');
      window.location.href = 'login.html'; return;
    }
    // Show user info in header
    const user = JSON.parse(localStorage.getItem('ragUser') || '{}');
    const name = user.name || payload.name || 'User';
    document.getElementById('user-name').textContent = name.split(' ')[0];
    document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
  } catch { window.location.href = 'login.html'; }
})();

// ── USER SIGN OUT FUNCTION ──
// Clears authentication data and redirects the user to the login page.
function logout() {
  // 1. Clear session and auth data from localStorage.
  // Each call is wrapped in a try-catch block so that if the user's browser is in 
  // Incognito/Private mode (which restricts localStorage access), it won't crash
  // the script or block the page redirection.
  try { localStorage.removeItem('ragToken'); } catch(e) {}
  try { localStorage.removeItem('ragUser'); } catch(e) {}
  try { localStorage.removeItem('ragSessions'); } catch(e) {}
  try { localStorage.removeItem('ragFavs'); } catch(e) {}
  
  // 2. Redirect the user back to the login screen.
  try {
    window.location.href = 'login.html';
  } catch(e) {
    try {
      // Fallback redirection if window.location.href fails or is blocked
      window.location.replace('login.html');
    } catch(err) {}
  }
}
// Expose logout globally so it can be invoked by the inline HTML onclick attributes
window.logout = logout;

function getAuthHeaders() {
  const token = localStorage.getItem('ragToken') || '';
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

let docs = [], messages = [], streaming = false;
let responseStyle = 'normal', recognition = null, isListening = false;
let autoSave = true;
let favs = JSON.parse(localStorage.getItem('ragFavs') || '[]');

// ── MENU DROPDOWN ──
function toggleMenuDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('menu-dropdown');
  const isOpen = menu.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) {
    menu.classList.add('open');
    try {
      const user = JSON.parse(localStorage.getItem('ragUser') || '{}');
      const token = localStorage.getItem('ragToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        document.getElementById('dropdown-name').textContent = user.name || payload.name || 'User';
        document.getElementById('dropdown-email').textContent = user.email || payload.email || '';
        document.getElementById('dropdown-avatar').textContent = (user.name || payload.name || 'U').charAt(0).toUpperCase();
      }
    } catch(err) {}
  }
}
function closeAllDropdowns(e) {
  const menu = document.getElementById('menu-dropdown');
  const userPill = document.getElementById('user-pill');
  if (e && menu && userPill) {
    if (menu.contains(e.target) || userPill.contains(e.target)) {
      return;
    }
  }
  if (menu) menu.classList.remove('open');
}
document.addEventListener('click', closeAllDropdowns);

// ── THEME ──
function toggleTheme() {
  const h = document.documentElement;
  const isLight = h.dataset.theme === 'light';
  h.dataset.theme = isLight ? 'dark' : 'light';
  document.getElementById('theme-btn').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('ragTheme', h.dataset.theme);
}
(function() {
  const t = localStorage.getItem('ragTheme');
  if (t) { document.documentElement.dataset.theme = t; document.getElementById('theme-btn').textContent = t==='light'?'🌙':'☀️'; }
})();

// ── SHORTCUTS ──
function openShortcuts() { closeAllDropdowns(); document.getElementById('shortcuts-modal').classList.add('open'); }
function closeShortcuts() { document.getElementById('shortcuts-modal').classList.remove('open'); }
function openPageModal(title, pdfDoc, pageNum) {
  document.getElementById('page-modal-title').textContent = title;
  document.getElementById('page-modal').classList.add('open');
  const wrap = document.getElementById('page-canvas-wrap');
  wrap.innerHTML = '';
  if (pdfDoc) {
    pdfDoc.getPage(pageNum||1).then(pg => {
      const vp = pg.getViewport({scale:1.5});
      const c = document.createElement('canvas'); c.width=vp.width; c.height=vp.height;
      pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise.then(()=>wrap.appendChild(c));
    });
  }
}
function closePageModal() { document.getElementById('page-modal').classList.remove('open'); }
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
    if (e.key === 'Enter' && !e.shiftKey) return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); toggleSearch(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); toggleTheme(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); clearChat(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); exportChat(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveSession(); }
  else if (e.key === '?' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') openShortcuts();
  else if (e.key === 'Escape') { closeShortcuts(); closeFavModal(); if (document.getElementById('search-bar').classList.contains('open')) toggleSearch(); }
});

// ── ONLINE/OFFLINE ──
function updateConnStatus() {
  const dot = document.getElementById('status-dot');
  if (!dot) return;
  if (navigator.onLine) { dot.className='status-dot online'; dot.title='Online'; }
  else { dot.className='status-dot offline'; dot.title='Offline'; }
}
window.addEventListener('online', updateConnStatus);
window.addEventListener('offline', updateConnStatus);
updateConnStatus();

// ── TOAST ──
function showToast(msg, ms=2500) {
  const t = document.getElementById('toast'); t.textContent = msg;
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), ms);
}

// ── USAGE ──
const DAILY_LIMIT = 14400;
function getUsageData() {
  const d = JSON.parse(localStorage.getItem('ragUsage')||'{}');
  return d.date !== new Date().toDateString() ? { date: new Date().toDateString(), count: 0 } : d;
}
function incrementUsage() {
  const d = getUsageData(); d.count = (d.count||0)+1;
  localStorage.setItem('ragUsage', JSON.stringify(d)); updateUsageUI(d.count);
}
function manualSetUsage() {
  const cur = getUsageData().count||0;
  const inp = prompt(`Requests used today?\n(Current: ${cur})`, cur);
  if (!inp) return;
  const v = parseInt(inp);
  if (isNaN(v)||v<0){showToast('⚠ Invalid number');return;}
  const d = getUsageData(); d.count = Math.min(v, DAILY_LIMIT);
  localStorage.setItem('ragUsage', JSON.stringify(d)); updateUsageUI(d.count);
  showToast('✅ Usage updated!');
}
function updateUsageUI(count) {
  const pct = Math.min((count/DAILY_LIMIT)*100,100);
  document.getElementById('usage-count').innerHTML = `${count.toLocaleString()} <span>/ 14,400</span>`;
  const f = document.getElementById('usage-fill');
  f.style.width = pct+'%'; f.className = 'usage-fill'+(pct>=90?' danger':pct>=60?' warn':'');
  const now = new Date(), mid = new Date(now); mid.setHours(24,0,0,0);
  const diff = mid-now;
  document.getElementById('usage-reset').textContent = `Resets in ${Math.floor(diff/3600000)}h ${Math.floor((diff%3600000)/60000)}m`;
}
(function(){updateUsageUI(getUsageData().count||0);setInterval(()=>updateUsageUI(getUsageData().count||0),60000)})();

// ── SCROLL TO BOTTOM ──
const msgsEl = () => document.getElementById('messages');
function scrollToBottom() { const m = msgsEl(); m.scrollTop = m.scrollHeight; }
function initScrollBtn() {
  const m = msgsEl(), btn = document.getElementById('scroll-btn');
  m.addEventListener('scroll', () => {
    const atBottom = m.scrollHeight - m.scrollTop - m.clientHeight < 80;
    btn.classList.toggle('show', !atBottom && m.scrollHeight > m.clientHeight + 100);
  });
}

// ── MODEL ──
function updateModelBadge() {
  const labels = { 'llama-3.3-70b-versatile':'Llama 3.3 70B', 'llama-3.1-8b-instant':'Llama 3.1 8B (Fast)' };
  document.getElementById('model-badge').textContent = (labels[document.getElementById('model-select').value]||'AI Model') + ' · Groq';
}
function updateTemp(val) {
  showToast({ '0.9':'🎨 Creative mode — AI adds its own ideas', '0.6':'⚖️ Balanced mode — mix of PDF + AI', '0.3':'📄 Precise mode — mostly from PDF', '0.05':'🎯 Exact mode — strictly from PDF' }[val] || '');
}

// ── FONT SIZE ──
function setFontSize(size) { document.documentElement.style.setProperty('--font-size', size); }

// ── SIDEBAR TABS ──
function switchSidebarTab(tab) {
  ['docs','history','stats','favs'].forEach((t,i) => {
    document.querySelectorAll('.sidebar-tab')[i].classList.toggle('active', t===tab);
    document.getElementById('sp-'+t).classList.toggle('active', t===tab);
  });
  if (tab==='history') renderHistory();
  if (tab==='stats') updateStats();
  if (tab==='favs') renderFavs();
}

// ── MOBILE ──
function mobileTab(tab) {
  document.getElementById('sidebar').classList.toggle('mobile-open', tab==='docs');
  document.getElementById('mob-tab-docs').classList.toggle('active', tab==='docs');
  document.getElementById('mob-tab-chat').classList.toggle('active', tab==='chat');
}

// ── STYLE ──
function setStyle(s) {
  responseStyle = s;
  ['normal','short','detailed','bullets'].forEach(id => document.getElementById('style-'+id).classList.toggle('active', id===s));
}

// ── SEARCH ──
let searchMatches = [], searchIdx = -1;

function toggleSearch() {
  const bar = document.getElementById('search-bar');
  const open = !bar.classList.contains('open');
  bar.classList.toggle('open', open);
  document.getElementById('search-btn').classList.toggle('active', open);
  if (open) document.getElementById('search-input').focus();
  else { document.getElementById('search-input').value=''; searchChat(''); }
}

function clearSearchHighlights() {
  document.querySelectorAll('mark.sh').forEach(m => {
    const parent = m.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });
  searchMatches = []; searchIdx = -1;
}

function searchChat(q) {
  clearSearchHighlights();
  document.getElementById('search-count').textContent = '';
  if (!q) return;
  // IMPORTANT: use a capturing group so split() includes the matched text in results
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(' + escaped + ')', 'gi');
  document.querySelectorAll('.bubble').forEach(bubble => {
    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) {
      const tag = n.parentElement && n.parentElement.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      if (n.textContent.toLowerCase().includes(q.toLowerCase())) textNodes.push(n);
    }
    textNodes.forEach(tn => {
      const parts = tn.textContent.split(regex);
      if (parts.length <= 1) return;
      const frag = document.createDocumentFragment();
      parts.forEach((part, i) => {
        if (i % 2 === 0) { frag.appendChild(document.createTextNode(part)); }
        else {
          const mark = document.createElement('mark');
          mark.className = 'sh'; mark.textContent = part;
          searchMatches.push(mark); frag.appendChild(mark);
        }
      });
      tn.parentNode.replaceChild(frag, tn);
    });
  });
  const total = searchMatches.length;
  if (!total) { document.getElementById('search-count').textContent = 'No matches'; return; }
  searchIdx = 0;
  searchMatches[0].classList.add('sh-active');
  searchMatches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('search-count').textContent = `1 / ${total}`;
}

function navigateSearch(dir) {
  if (!searchMatches.length) return;
  searchMatches[searchIdx] && searchMatches[searchIdx].classList.remove('sh-active');
  searchIdx = (searchIdx + dir + searchMatches.length) % searchMatches.length;
  searchMatches[searchIdx].classList.add('sh-active');
  searchMatches[searchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('search-count').textContent = `${searchIdx + 1} / ${searchMatches.length}`;
}


// ── VOICE ──
function toggleVoice() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) { showToast('🎙 Voice not supported.'); return; }
  if (isListening) { recognition && recognition.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'en-US'; recognition.interimResults = false;
  recognition.onstart = () => { isListening=true; document.getElementById('mic-btn').classList.add('listening'); showToast('🎙 Listening…'); };
  recognition.onresult = e => { const t=e.results[0][0].transcript; const inp=document.getElementById('input'); inp.value=(inp.value+' '+t).trim(); autoResize(inp); };
  recognition.onend = () => { isListening=false; document.getElementById('mic-btn').classList.remove('listening'); };
  recognition.onerror = () => { isListening=false; document.getElementById('mic-btn').classList.remove('listening'); showToast('🎙 Voice error.'); };
  recognition.start();
}

// ── CHIP ──
function chipClick(text) { const i=document.getElementById('input'); i.value=text; autoResize(i); sendMessage(); }

// ── TEXTAREA ──
function autoResize(el) {
  el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px';
  document.getElementById('send-btn').disabled = !el.value.trim() || streaming;
}
function handleKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
function handleDrop(e) { e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag'); handleFiles(e.dataTransfer.files); }

// ── THUMBNAIL ──
async function renderThumb(pdfDoc, container) {
  try {
    const p = await pdfDoc.getPage(1), vp = p.getViewport({scale:.3});
    const c = document.createElement('canvas'); c.width=vp.width; c.height=vp.height;
    await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    container.innerHTML=''; container.appendChild(c);
  } catch(e){}
}

// ── FILES ──
async function handleFiles(files) {
  for (const file of Array.from(files)) {
    if (!file.name.toLowerCase().endsWith('.pdf')) continue;
    document.getElementById('upload-icon-wrap').textContent='⏳';
    document.getElementById('upload-status').innerHTML=`<div style="font-size:12px;color:var(--accent2)">Reading ${file.name}…</div>`;
    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data:ab}).promise;
      let pages = [];
      for (let i=1;i<=pdf.numPages;i++) {
        const pg=await pdf.getPage(i);
        const ct=await pg.getTextContent();
        pages.push(ct.items.map(s=>s.str).join(' '));
      }
      docs.push({name:file.name, pages, text:pages.join('\n'), pdfDoc:pdf, selected:true});
      updateDocsList(); mobileTab('chat');
      showToast(`✅ "${file.name}" loaded (${pdf.numPages} pages)`);
    } catch(err) {
      document.getElementById('upload-status').innerHTML=`<div style="color:var(--danger);font-size:12px">⚠ ${err.message}</div>`;
    }
    document.getElementById('upload-icon-wrap').textContent='📄';
    document.getElementById('upload-status').innerHTML='<div class="upload-title">Upload your PDFs</div><div class="upload-sub">Drag & drop or click below</div>';
  }
  updateStats();
}
function removeDoc(i) { showToast(`🗑 "${docs[i].name}" removed`); docs.splice(i,1); updateDocsList(); updateStats(); }

function updateDocsList() {
  const badge=document.getElementById('doc-badge');
  const selectedCount = docs.filter(d => d.selected !== false).length;
  badge.textContent = `${selectedCount} / ${docs.length} doc${docs.length>1?'s':''}`;
  badge.style.display=docs.length?'block':'none';
  const sub=document.getElementById('header-sub');
  if(sub) sub.textContent=docs.length? `${selectedCount} of ${docs.length} document${docs.length>1?'s':''} active` : 'Upload a PDF to get started';
  const wd=document.getElementById('welcome-desc');
  if(wd) wd.textContent=docs.length? `${selectedCount} of ${docs.length} document${docs.length>1?'s':''} ready. Ask me anything!` : 'Upload any PDF and ask questions in plain English. Get instant AI-powered answers with page citations.';
  
  // Show or hide the global toggle Select All / Deselect All button
  const toggleBtn = document.getElementById('toggle-all-docs');
  if (toggleBtn) {
    if (docs.length > 0) {
      toggleBtn.style.display = 'block';
      toggleBtn.textContent = selectedCount > 0 ? 'Deselect All' : 'Select All';
    } else {
      toggleBtn.style.display = 'none';
    }
  }

  const list=document.getElementById('docs-list');
  if(!docs.length){list.innerHTML='<div class="no-docs">No documents loaded yet</div>';return;}
  list.innerHTML=docs.map((d,i)=>`<div class="doc-item">
    <input type="checkbox" class="doc-checkbox" ${d.selected !== false ? 'checked' : ''} onchange="toggleDocSelection(${i})" title="Select/deselect document for chat"/>
    <div class="doc-thumb-ph" id="thumb-${i}">📄</div>
    <div class="doc-info"><div class="doc-name">${esc(d.name)}</div><div class="doc-pages">${d.pages.length} pages</div></div>
    <button class="doc-del" onclick="removeDoc(${i})">✕</button></div>`).join('');
  docs.forEach((d,i)=>{if(d.pdfDoc){const el=document.getElementById(`thumb-${i}`);if(el){el.className='doc-thumb';renderThumb(d.pdfDoc,el);}}});
}

// Toggle individual document selection
function toggleDocSelection(i) {
  docs[i].selected = !docs[i].selected;
  updateDocsList();
}

// Toggle selection state for all documents globally
function toggleAllDocs() {
  const selectedCount = docs.filter(d => d.selected !== false).length;
  const targetState = selectedCount === 0; // If none are selected, select all. Otherwise, deselect all.
  docs.forEach(d => d.selected = targetState);
  updateDocsList();
}
window.toggleDocSelection = toggleDocSelection;
window.toggleAllDocs = toggleAllDocs;

// ── STATS ──
function updateStats() {
  const total=messages.length, user=messages.filter(m=>m.role==='user').length;
  const words=messages.reduce((s,m)=>s+m.content.split(/\s+/).filter(Boolean).length,0);
  document.getElementById('stat-msgs').textContent=total;
  document.getElementById('stat-user').textContent=user;
  document.getElementById('stat-ai').textContent=total-user;
  document.getElementById('stat-words').textContent=words.toLocaleString();
  document.getElementById('stat-tokens').textContent=Math.round(words*1.3).toLocaleString();
  document.getElementById('stat-docs').textContent=docs.length;
  document.getElementById('stat-pages').textContent=docs.reduce((s,d)=>s+d.pages.length,0);
}

// ── CONTEXT ──
function retrieveContext(query) {
  // Only search within documents that are checked/selected
  const activeDocs = docs.filter(d => d.selected !== false);
  if (!activeDocs.length) return {text:'',citations:[]};
  
  const words=query.toLowerCase().split(/\s+/).filter(w=>w.length>3);
  let scored=[];
  for (const doc of activeDocs) {
    doc.pages.forEach((pageText,pi)=>{
      const CHUNK=1200;
      for(let i=0;i<pageText.length;i+=CHUNK-100){
        const chunk=pageText.slice(i,i+CHUNK);
        const score=words.reduce((s,w)=>s+(chunk.toLowerCase().split(w).length-1),0);
        scored.push({text:chunk,source:doc.name,page:pi+1,score});
      }
    });
  }
  scored.sort((a,b)=>b.score-a.score);
  const top=scored.filter(c=>c.score>0).slice(0,4);
  
  // Strict matching rule: In Exact (0.05) or Precise (0.3) modes, if no matching segments are found,
  // do not fall back to the first 800 characters of the document. Return an empty context instead.
  const matchMode = document.getElementById('temp-select')?.value || '0.3';
  const isStrict = (matchMode === '0.05' || matchMode === '0.3');
  if (isStrict && !top.length) {
    return {text:'',citations:[]};
  }
  
  const used=top.length?top:activeDocs.map(d=>({text:d.text.slice(0,800),source:d.name,page:1}));
  const citations=[...new Set(used.map(c=>`${c.source} p.${c.page}`))];
  return {text:used.map(c=>`[${c.source} — Page ${c.page}]\n${c.text}`).join('\n\n---\n\n'),citations};
}

function esc(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// ── CLEAR ──
function clearChat() {
  closeAllDropdowns();
  if(!messages.length){showToast('💬 Chat is already empty.');return;}
  messages=[];
  msgsEl().innerHTML=`<div class="welcome" id="welcome"><div class="welcome-glow">✦</div><div class="welcome-title">RAG PDF Chat</div><div class="welcome-sub" id="welcome-desc">${docs.length?docs.length+' document'+(docs.length>1?'s':'')+' ready. Ask me anything!':''}</div><div class="welcome-chips"><div class="chip" onclick="chipClick('Summarize this document')">📋 Summarize</div><div class="chip" onclick="chipClick('What are the key points?')">🔑 Key Points</div><div class="chip" onclick="chipClick('Explain the main topic')">💡 Explain</div><div class="chip" onclick="chipClick('List all important dates')">📅 Dates & Facts</div></div></div>`;
  updateStats(); showToast('🗑 Chat cleared!');
}

// ── EXPORT ──
function exportChat() {
  closeAllDropdowns();
  if(!messages.length){showToast('📭 No chat to export.');return;}
  const lines=[`RAG PDF Chat Export`,`Date: ${new Date().toLocaleString()}`,`Documents: ${docs.map(d=>d.name).join(', ')||'None'}`,'─'.repeat(50)];
  messages.forEach(m=>{lines.push(`\n[${m.role==='user'?'YOU':'AI'}]`);lines.push(m.content);});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}));
  a.download=`rag-chat-${new Date().toISOString().slice(0,10)}.txt`;
  a.click(); showToast('💾 Chat exported!');
}

// ── PRINT ──
function printChat() { closeAllDropdowns(); if(!messages.length){showToast('🖨 No chat to print.');return;} window.print(); }

// ── SAVE SESSION ──
// DB API helpers (with localStorage fallback)
const dbApi = {
  async getSessions() {
    try {
      const r = await fetch('/api/sessions', { headers: getAuthHeaders() }); if (!r.ok) throw new Error();
      return await r.json();
    } catch { return JSON.parse(localStorage.getItem('ragSessions') || '[]'); }
  },
  async saveSession(session) {
    try { await fetch('/api/sessions', {method:'POST', headers: getAuthHeaders(), body:JSON.stringify(session)}); }
    catch { /* localStorage handled by caller */ }
  },
  async deleteSession(id) {
    try { await fetch('/api/sessions', {method:'DELETE', headers: getAuthHeaders(), body:JSON.stringify({id})}); }
    catch { /* localStorage handled by caller */ }
  },
  async getFavs() {
    try {
      const r = await fetch('/api/favs', { headers: getAuthHeaders() }); if (!r.ok) throw new Error();
      return await r.json();
    } catch { return JSON.parse(localStorage.getItem('ragFavs') || '[]'); }
  },
  async addFav(content) {
    try { await fetch('/api/favs', {method:'POST', headers: getAuthHeaders(), body:JSON.stringify({content})}); }
    catch { /* localStorage handled by caller */ }
  },
  async removeFav(content) {
    try { await fetch('/api/favs', {method:'DELETE', headers: getAuthHeaders(), body:JSON.stringify({content})}); }
    catch { /* localStorage handled by caller */ }
  },
};

async function saveSession() {
  closeAllDropdowns();
  if(!messages.length){showToast('\u{1F4AC} Nothing to save.');return;}
  const first=messages.find(m=>m.role==='user')?.content||'Session';
  const session={id:Date.now().toString(),title:first.slice(0,40),date:new Date().toLocaleString(),messages:[...messages]};
  showToast('\u{1F4BE} Saving...');
  await dbApi.saveSession(session);
  // keep localStorage in sync
  const local=JSON.parse(localStorage.getItem('ragSessions')||'[]');
  local.unshift(session); if(local.length>20)local.pop();
  localStorage.setItem('ragSessions',JSON.stringify(local));
  showToast('\u{1F4CC} Session saved to MongoDB!'); renderHistory();
}
async function renderHistory() {
  const list=document.getElementById('history-list');
  list.innerHTML='<div class="no-docs">\u{1F504} Loading sessions...</div>';
  const sessions = await dbApi.getSessions();
  localStorage.setItem('ragSessions',JSON.stringify(sessions));
  window._sessions = sessions;
  if(!sessions.length){list.innerHTML='<div class="no-docs">No saved sessions yet</div>';return;}
  list.innerHTML=sessions.map(s=>`<div class="history-item" onclick="loadSession('${s.id}')">
    <button class="history-del" onclick="event.stopPropagation();deleteSession('${s.id}')">\u2715</button>
    <div class="history-title">${esc(s.title)}\u2026</div>
    <div class="history-meta">${s.date} \u00B7 ${s.messages.length} messages</div></div>`).join('');
}
function loadSession(id) {
  const sessions = window._sessions || JSON.parse(localStorage.getItem('ragSessions')||'[]');
  const s = sessions.find(x => String(x.id) === String(id));
  if(!s)return;
  messages=[...s.messages]; msgsEl().innerHTML='';
  const w=document.getElementById('welcome'); if(w) w.remove();
  messages.forEach(m=>appendMsgDirect(m.role==='assistant'?'ai':'user',m.content));
  switchSidebarTab('docs'); mobileTab('chat'); updateStats(); showToast('\u{1F553} Session loaded!');
}
async function deleteSession(id) {
  await dbApi.deleteSession(id);
  let local=JSON.parse(localStorage.getItem('ragSessions')||'[]').filter(x=>String(x.id)!==String(id));
  localStorage.setItem('ragSessions',JSON.stringify(local));
  renderHistory(); showToast('\u{1F5D1} Session deleted.');
}

// ── FAVOURITES ──
async function toggleFav(btn) {
  const content = decodeURIComponent(btn.dataset.encoded || '');
  if (!content) return;
  const idx = favs.findIndex(f => f.content === content);
  if (idx >= 0) {
    favs.splice(idx, 1);
    await dbApi.removeFav(content);
    btn.textContent = '\u2B50 Star'; btn.classList.remove('starred');
    showToast('\u2B50 Removed from favorites');
  } else {
    favs.push({ content, date: new Date().toLocaleString() });
    await dbApi.addFav(content);
    btn.textContent = '\u2B50 Starred!'; btn.classList.add('starred');
    showToast('\u2B50 Saved to MongoDB!');
  }
  localStorage.setItem('ragFavs', JSON.stringify(favs));
  renderFavs();
}
async function renderFavs() {
  const list = document.getElementById('favs-list');
  list.innerHTML = '<div class="no-docs">\u{1F504} Loading favorites...</div>';
  const loaded = await dbApi.getFavs();
  favs = loaded;
  localStorage.setItem('ragFavs', JSON.stringify(favs));
  if (!favs.length) {
    list.innerHTML='<div class="no-docs">No starred messages yet.<br/>Click \u2B50 on any AI response to save it.</div>';
    return;
  }
  list.innerHTML = favs.map((f,i) => `<div class="history-item" onclick="openFavModal(${i})" style="cursor:pointer">
    <button class="history-del" onclick="event.stopPropagation();removeFav(${i})">\u2715</button>
    <div class="history-title">${esc(f.content.slice(0,80))}\u2026</div>
    <div class="history-meta">${f.date} \u2022 tap to read full</div></div>`).join('');
}
async function removeFav(i) {
  const content = favs[i].content;
  await dbApi.removeFav(content);
  favs.splice(i,1);
  localStorage.setItem('ragFavs',JSON.stringify(favs));
  renderFavs(); showToast('\u{1F5D1} Removed from favorites');
}

// ── FAV MODAL ──
let currentFavIdx = -1;
function openFavModal(i) {
  currentFavIdx = i;
  const f = favs[i];
  document.getElementById('fav-modal-date').textContent = f.date;
  document.getElementById('fav-modal-body').innerHTML = marked.parse(f.content);
  document.getElementById('fav-modal').classList.add('open');
}
function closeFavModal() {
  document.getElementById('fav-modal').classList.remove('open');
  currentFavIdx = -1;
}
function copyFavModal() {
  if (currentFavIdx < 0) return;
  const text = favs[currentFavIdx].content;
  const cb = document.getElementById('fav-modal-body').querySelector('button');
  navigator.clipboard ? navigator.clipboard.writeText(text).then(() => showToast('📋 Copied!')) : (()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('📋 Copied!');})();
}

// ── COPY ──
function copyMsg(btn) {
  const text=decodeURIComponent(btn.dataset.text||'');
  if(!text)return;
  const doCopy=()=>{btn.textContent='✅ Copied!';btn.classList.add('copied');showToast('📋 Copied!');setTimeout(()=>{btn.textContent='📋 Copy';btn.classList.remove('copied');},2000);};
  navigator.clipboard?navigator.clipboard.writeText(text).then(doCopy).catch(()=>fallbackCopy(text,doCopy)):fallbackCopy(text,doCopy);
}
function fallbackCopy(text,cb){const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);cb();}

// ── APPEND ──
function appendMsgDirect(role,content) {
  const el=msgsEl(), row=document.createElement('div');
  row.className='msg-row '+role;
  const hasStarBtn = role==='ai';
  row.innerHTML=`<div class="avatar ${role}">${role==='user'?'U':'✦'}</div><div class="bubble-wrap"><div class="bubble ${role}">${role==='ai'?marked.parse(content):esc(content)}</div><div class="msg-actions"><button class="msg-copy" onclick="copyMsg(this)">📋 Copy</button>${hasStarBtn?'<button class="msg-star" onclick="toggleFav(this)">⭐ Star</button>':''}</div></div>`;
  const cb=row.querySelector('.msg-copy'); if(cb) cb.dataset.text=encodeURIComponent(content);
  const sb=row.querySelector('.msg-star'); if(sb) sb.dataset.encoded=encodeURIComponent(content);
  el.appendChild(row); el.scrollTop=el.scrollHeight;
}
function appendMsg(role,content,loading) {
  const w=document.getElementById('welcome'); if(w) w.remove();
  const el=msgsEl(), row=document.createElement('div');
  row.className='msg-row '+role;
  row.innerHTML=`<div class="avatar ${role}">${role==='user'?'U':'✦'}</div><div class="bubble-wrap"><div class="bubble ${role}">${loading?'<div class="dots"><span></span><span></span><span></span></div>':(role==='ai'?marked.parse(content):esc(content))}</div>${!loading?'<div class="msg-actions"><button class="msg-copy" onclick="copyMsg(this)">📋 Copy</button></div>':''}</div>`;
  if(!loading){const btn=row.querySelector('.msg-copy');if(btn)btn.dataset.text=encodeURIComponent(content);}
  el.appendChild(row); el.scrollTop=el.scrollHeight;
  return row.querySelector('.bubble');
}

// ── AUTO-SAVE ──
async function autoSaveSession() {
  if (!messages.length) return;
  const session = {
    id: 'auto',
    title: '[Auto] ' + (messages.find(m => m.role === 'user')?.content || 'Chat').slice(0, 35),
    date: new Date().toLocaleString(),
    messages: [...messages]
  };
  await dbApi.saveSession(session);
  const local = JSON.parse(localStorage.getItem('ragSessions') || '[]');
  const idx = local.findIndex(s => s.id === 'auto');
  if (idx >= 0) local[idx] = session; else local.unshift(session);
  localStorage.setItem('ragSessions', JSON.stringify(local));
}

// ── SEND ──
async function sendMessage() {
  const inputEl=document.getElementById('input'), msg=inputEl.value.trim();
  if(!msg||streaming)return;
  inputEl.value=''; autoResize(inputEl);
  streaming=true; document.getElementById('send-btn').disabled=true;
  messages.push({role:'user',content:msg});
  appendMsg('user',msg,false);
  const bubble=appendMsg('ai','',true);
  const {text:contextText,citations}=retrieveContext(msg);
  
  const styleHints={short:'Respond in 2-3 sentences only.',detailed:'Respond with a thorough, detailed explanation.',bullets:'Respond using clear bullet points.',normal:''};
  const langSel=document.getElementById('lang-select').value;
  const langInstr=langSel?`\nIMPORTANT: Respond in ${langSel} language.`:'';
  
  // Custom strictness instructions based on the selected "Match" parameter
  const matchMode = document.getElementById('temp-select').value;
  let strictnessInstr = '';
  if (contextText) {
    if (matchMode === '0.05') {
      strictnessInstr = '\nSTRICTNESS RULE: You are in EXACT MODE (100%). You must answer strictly using ONLY the provided document excerpts. Do not use any external or general knowledge. If the exact answer cannot be found in the excerpts, you MUST reply: "I cannot find the answer in the provided documents." Do not speculate, suggest, or extrapolate.';
    } else if (matchMode === '0.3') {
      strictnessInstr = '\nSTRICTNESS RULE: You are in PRECISE MODE (90%). Answer using the provided document excerpts. You may clarify terms using general knowledge, but do not introduce external facts. If the answer is not mentioned in the text, clearly state that.';
    } else if (matchMode === '0.6') {
      strictnessInstr = '\nSTRICTNESS RULE: You are in BALANCED MODE. Answer using the document excerpts, but you may supplement with general knowledge to provide a helpful response.';
    } else if (matchMode === '0.9') {
      strictnessInstr = '\nSTRICTNESS RULE: You are in CREATIVE MODE. Use the document excerpts as a starting reference, but feel free to expand and add external ideas.';
    }
  } else {
    // If no context was retrieved (e.g. no documents selected, or no keyword matches in strict modes)
    if (matchMode === '0.05' || matchMode === '0.3') {
      strictnessInstr = '\nSTRICTNESS RULE: No document excerpts were retrieved. Since you are in Exact/Precise mode, you must decline to answer and state that you require an uploaded and selected document to answer questions.';
    }
  }
  
  const system=(contextText?`You are a helpful assistant. Answer using these document excerpts:\n\n${contextText}\n\nIf the answer isn't in the excerpts, say so.`:'You are a helpful assistant. Answer from your knowledge.')+(styleHints[responseStyle]?'\n'+styleHints[responseStyle]:'')+langInstr+strictnessInstr;
  const model=document.getElementById('model-select').value;
  const temperature = parseFloat(document.getElementById('temp-select').value);
  try {
    const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system,messages:messages.map(m=>({role:m.role,content:m.content})),model,temperature})});
    const data=await res.json();
    if(data.error){
      bubble.innerHTML=`<span style="color:var(--danger)">${esc(data.error)}</span>`;
    } else {
      const reply=data.content?.[0]?.text||'No response received.';
      bubble.innerHTML=marked.parse(reply);
      if(citations.length){
        const citDiv=document.createElement('div'); citDiv.style.cssText='margin-top:6px;display:flex;gap:5px;flex-wrap:wrap';
        citations.forEach(c=>{const s=document.createElement('span');s.className='citation';s.textContent='📍 '+c;citDiv.appendChild(s);});
        bubble.appendChild(citDiv);
      }
      const wrap=bubble.parentElement, actDiv=document.createElement('div');
      actDiv.className='msg-actions';
      const cb=document.createElement('button'); cb.className='msg-copy'; cb.textContent='📋 Copy';
      cb.dataset.text=encodeURIComponent(reply); cb.onclick=function(){copyMsg(this);};
      const sb=document.createElement('button'); sb.className='msg-star'; sb.textContent='⭐ Star';
      sb.dataset.encoded=encodeURIComponent(reply); sb.onclick=function(){toggleFav(this);};
      actDiv.appendChild(cb); actDiv.appendChild(sb); wrap.appendChild(actDiv);
      messages.push({role:'assistant',content:reply});
      incrementUsage(); updateStats(); autoSaveSession();
    }
  } catch(e) {
    let m2=e.message;
    if(m2.includes('Failed to fetch')||m2.includes('NetworkError')||m2.includes('Load failed')) m2='📡 No internet connection. Please check your network and try again.';
    else if(m2.includes('timeout')||m2.includes('ETIMEDOUT')) m2='⏱ Request timed out. Please try again.';
    bubble.innerHTML=`<span style="color:var(--danger)">${esc(m2)}</span>`;
  }
  streaming=false;
  document.getElementById('send-btn').disabled=!document.getElementById('input').value.trim();
  msgsEl().scrollTop=99999;
}

// Init
initScrollBtn();

// ── BIND SIGN OUT BUTTON CLICK EVENT ──
// This event listener attaches a click handler dynamically to the logout button.
// It acts as a primary handler, using stopPropagation() to prevent conflict with dropdown-close events.
const logoutBtn = document.querySelector('.logout-btn-item');
if (logoutBtn) {
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();  // Prevents default navigation behaviors
    e.stopPropagation(); // Stops event bubbling so document close listeners aren't fired
    logout();            // Triggers the logout and redirect flow
  });
}
