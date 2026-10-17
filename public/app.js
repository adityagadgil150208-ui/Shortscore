'use strict';

const state = { reports: [], selectedId: null, savedOnly: false, query: '', bookmarks: readBookmarks() };
const $ = (selector, root = document) => root.querySelector(selector);
const icons = {
  bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>',
  check: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>',
  info: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 9v5m0-8v.2"/></svg>'
};

function readBookmarks() {
  try {
    const stored = JSON.parse(localStorage.getItem('shortscope-bookmarks') || '[]');
    return new Set(Array.isArray(stored) ? stored.filter(value => typeof value === 'string') : []);
  } catch { return new Set(); }
}

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function icon(name) {
  const wrapper = node('span');
  wrapper.innerHTML = icons[name]; // Only fixed icons above; report content always uses textContent.
  return wrapper.firstElementChild;
}

function formatDate(report) {
  if (!report.date_dropped) return report.is_example ? 'Date not provided' : 'Added ' + new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(report.analyzed_at || Date.now()));
  const date = new Date(report.date_dropped + 'T12:00:00Z');
  return Number.isNaN(date.getTime()) ? 'Date not provided' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function isSaved(report) { return state.bookmarks.has(report.ticker); }

function renderLibrary() {
  $('#all-count').textContent = state.reports.length;
  $('#saved-count').textContent = state.reports.filter(isSaved).length;
  $('#all-tab').classList.toggle('active', !state.savedOnly);
  $('#all-tab').setAttribute('aria-pressed', String(!state.savedOnly));
  $('#saved-tab').classList.toggle('active', state.savedOnly);
  $('#saved-tab').setAttribute('aria-pressed', String(state.savedOnly));
  const list = $('#report-list');
  list.replaceChildren();
  const reports = state.reports.filter(report => (!state.savedOnly || isSaved(report)) && [report.ticker, report.company_name, report.short_seller, report.classification].join(' ').toLowerCase().includes(state.query));
  if (!reports.length) {
    list.append(node('p', 'list-message', state.savedOnly ? 'No saved reports match. Save a report with the bookmark button to find it here.' : 'No reports match your search. Try a company name or stock ticker.'));
    return;
  }
  reports.forEach(report => {
    const card = node('button', 'report-card' + (report.id === state.selectedId ? ' selected' : ''));
    card.type = 'button';
    card.setAttribute('aria-pressed', String(report.id === state.selectedId));
    card.setAttribute('aria-controls', 'report-detail');
    card.setAttribute('aria-label', report.company_name + ', ' + report.ticker + (report.is_example ? ', example report' : ', AI summary'));
    const top = node('span', 'report-card-top');
    const name = node('span', 'report-card-name');
    name.append(node('strong', '', report.company_name), node('small', '', report.ticker));
    top.append(node('span', 'ticker-tile', report.ticker), name, node('span', 'report-chevron', '›'));
    const bottom = node('span', 'report-card-bottom');
    bottom.append(node('span', 'sample-label', report.is_example ? 'EXAMPLE' : 'AI SUMMARY'), node('span', '', formatDate(report)));
    card.append(top, node('p', 'report-card-topic', report.classification), bottom);
    card.addEventListener('click', () => { state.selectedId = report.id; renderLibrary(); renderReport(); });
    list.append(card);
  });
}

function renderReport() {
  const target = $('#report-detail');
  target.setAttribute('aria-busy', 'false');
  target.replaceChildren();
  const report = state.reports.find(item => item.id === state.selectedId);
  if (!report) { target.append(node('p', 'detail-loading', 'Choose a report to explore its main claims.')); return; }
  const header = node('header', 'detail-header');
  const meta = node('div', 'report-meta-row');
  const kicker = node('div', 'report-kicker');
  kicker.append(node('span', 'sample-label', report.is_example ? 'EXAMPLE REPORT' : 'AI SUMMARY'), node('span', '', report.is_example ? 'FOR LEARNING' : 'NOT INDEPENDENTLY VERIFIED'));
  const save = node('button', 'save-button');
  save.type = 'button';
  save.setAttribute('aria-pressed', String(isSaved(report)));
  save.setAttribute('aria-label', (isSaved(report) ? 'Unsave ' : 'Save ') + report.company_name + ' report');
  save.append(icon('bookmark'), node('span', '', isSaved(report) ? 'Saved' : 'Save'));
  save.addEventListener('click', () => {
    if (isSaved(report)) state.bookmarks.delete(report.ticker); else state.bookmarks.add(report.ticker);
    let persisted = true;
    try { localStorage.setItem('shortscope-bookmarks', JSON.stringify([...state.bookmarks])); } catch { persisted = false; }
    renderLibrary(); renderReport();
    $('.save-button').focus({ preventScroll: true });
    toast(persisted ? (isSaved(report) ? 'Saved in this browser. Find it in your Saved tab.' : 'Removed from your saved reports.') : 'Updated for this visit. Browser storage is unavailable.');
  });
  meta.append(kicker, save);
  const company = node('div', 'company-title');
  const companyInfo = node('div');
  companyInfo.append(node('h2', '', report.company_name), node('p', '', 'Report by ' + report.short_seller + ' · ' + formatDate(report)));
  company.append(node('span', 'ticker-tile', report.ticker), companyInfo);
  header.append(meta, company, node('span', 'topic-badge', report.classification));
  const body = node('div', 'detail-body');
  const quickTitle = node('h3', 'takeaway-title');
  quickTitle.append(node('span', 'takeaway-icon', '✦'), document.createTextNode('The quick take'));
  const bullets = node('ol', 'summary-list');
  (report.executive_summary || []).forEach((text, index) => {
    const bullet = node('li');
    bullet.append(node('span', 'number', String(index + 1).padStart(2, '0')), node('span', '', text));
    bullets.append(bullet);
  });
  const evidence = node('section', 'evidence-box');
  const evidenceTitle = node('h3');
  evidenceTitle.append(icon('search'), document.createTextNode('What the report points to'));
  evidence.append(evidenceTitle, node('p', '', report.smoking_gun));
  body.append(quickTitle, node('p', 'section-subtitle', 'The author’s claims, in everyday language. These are not verified findings.'), bullets, evidence, node('div', 'detail-divider'));
  const claimsTitle = node('h3', 'claims-heading', 'A closer look at the claims');
  const claims = node('div', 'claim-list');
  (report.primary_claims || []).forEach(claim => {
    const item = node('details', 'claim');
    item.append(node('summary', '', claim.claim), node('p', '', claim.metric_disputed));
    claims.append(item);
  });
  body.append(claimsTitle, node('p', 'section-subtitle', 'Open a claim to see the detail the author cites.'), claims);
  const checkSection = node('section', 'check-section');
  const checkTitle = node('h3');
  checkTitle.append(icon('check'), document.createTextNode('A few things to check next'));
  const checks = node('ul', 'check-list');
  (report.what_to_check || []).forEach(text => { const li = node('li'); li.append(icon('check'), node('span', '', text)); checks.append(li); });
  checkSection.append(checkTitle, checks);
  body.append(checkSection);
  if (report.key_terms?.length) {
    const glossary = node('section', 'glossary');
    glossary.append(node('h3', '', 'A little less jargon'));
    report.key_terms.forEach(term => { const item = node('details', 'term'); item.append(node('summary', '', term.term), node('p', '', term.definition)); glossary.append(item); });
    body.append(glossary);
  }
  const note = node('footer', 'source-note');
  note.append(icon('info'), node('span', '', report.source_note));
  target.append(header, body, note);
}

async function loadReports() {
  try {
    const response = await fetch('/api/campaigns');
    if (!response.ok) throw new Error('Reports could not be loaded.');
    const reports = await response.json();
    if (!Array.isArray(reports)) throw new Error('Unexpected response.');
    state.reports = reports;
    state.selectedId = reports[0]?.id || null;
    renderLibrary(); renderReport();
  } catch {
    $('#report-list').replaceChildren(node('p', 'list-message', 'We couldn’t load the reports. Try again in a moment.'));
    const target = $('#report-detail');
    target.setAttribute('aria-busy', 'false');
    const message = node('div', 'detail-loading');
    const retry = node('button', 'button button-primary retry-button', 'Try again');
    retry.addEventListener('click', () => { retry.disabled = true; loadReports(); });
    message.append(node('h2', 'empty-title', 'Let’s try that again.'), node('p', '', 'The report library is temporarily unavailable.'), retry);
    target.replaceChildren(message);
  }
}

let toastTimer;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200); }

const analyzeDialog = $('#analyze-dialog');
const learnDialog = $('#learn-dialog');
document.querySelectorAll('[data-open-learn]').forEach(button => button.addEventListener('click', () => learnDialog.showModal()));
document.querySelectorAll('[data-open-analyze]').forEach(button => button.addEventListener('click', () => { analyzeDialog.showModal(); checkAvailability(); }));
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#back-to-reports').addEventListener('click', () => learnDialog.close());
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { const rect = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close(); }));
$('#search').addEventListener('input', event => { state.query = event.target.value.trim().toLowerCase(); renderLibrary(); });
$('#all-tab').addEventListener('click', () => { state.savedOnly = false; renderLibrary(); });
$('#saved-tab').addEventListener('click', () => { state.savedOnly = true; renderLibrary(); });

async function checkAvailability() {
  const status = $('#api-status');
  status.className = 'api-status';
  status.textContent = 'Checking summary availability…';
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error();
    const health = await response.json();
    status.classList.add(health.analysis_available ? 'available' : 'unavailable');
    status.textContent = health.analysis_available ? '✦ Ready to request a summary. You can explore examples anytime.' : 'New summaries aren’t available right now. You can still explore all of our example reports.';
  } catch { status.classList.add('unavailable'); status.textContent = 'We couldn’t reach the summary service. Please try again shortly.'; }
}

$('#sample-button').addEventListener('click', () => {
  const form = $('#analyze-form');
  form.elements.ticker.value = 'NOVA';
  form.elements.company_name.value = 'Nova Home (fictional example)';
  form.elements.short_seller.value = 'Example Research (fictional)';
  form.elements.raw_text.value = 'FICTIONAL EXAMPLE FOR LEARNING. We are short Nova Home, a made-up home goods company. We believe sales growth may look stronger than actual demand. In this fictional report, the company recorded sales when products were shipped to distributors, even though those distributors still had significant unsold stock. Its annual filing shows customer payments taking longer to arrive. We also question purchases from a supplier owned by a company executive’s relative. These are allegations in an illustrative report, not verified findings. The company says its sales practices follow accounting rules and that supplier contracts were reviewed independently. No source documents are included in this excerpt.';
  updateCharacterCount();
  $('#form-error').hidden = true;
});

function updateCharacterCount() { $('#character-count').textContent = $('#raw-text').value.length.toLocaleString('en-US') + ' / 40,000 characters'; }
$('#raw-text').addEventListener('input', updateCharacterCount);

$('#analyze-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $('#form-error');
  const submit = $('#submit-button');
  const rawText = form.elements.raw_text.value.trim();
  if (rawText.length < 80) { error.textContent = 'Please paste at least 80 characters so there’s enough context to summarize.'; error.hidden = false; return; }
  const payload = { ticker: form.elements.ticker.value.trim().toUpperCase(), company_name: form.elements.company_name.value.trim(), short_seller: form.elements.short_seller.value.trim(), raw_text: rawText };
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Finding the main points…';
  form.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(55000) });
    let result;
    try { result = await response.json(); } catch { throw new Error('The summary service returned an unreadable response. Please try again.'); }
    if (!response.ok) throw new Error(result.error || 'We couldn’t summarize that report. Please try again.');
    if (!result.id || !Array.isArray(result.executive_summary)) throw new Error('The summary was incomplete. Please try again.');
    state.reports.unshift(result);
    state.reports = state.reports.slice(0, 100);
    state.selectedId = result.id;
    state.savedOnly = false; state.query = ''; $('#search').value = '';
    renderLibrary(); renderReport();
    analyzeDialog.close();
    form.reset(); updateCharacterCount();
    $('#report-detail').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    toast('Your summary is ready. Remember to check the original sources.');
  } catch (failure) {
    error.textContent = failure.name === 'TimeoutError' || failure.name === 'AbortError' ? 'This is taking longer than expected. Please try again in a moment.' : failure instanceof TypeError ? 'We couldn’t connect. Check that the server is running and try again.' : failure.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Get a plain-English summary →';
    form.setAttribute('aria-busy', 'false');
  }
});

loadReports();
