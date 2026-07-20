/**
 * app.js
 * --------------------------------------------------------------------------
 * DevDocAssistant frontend logic.
 *
 * Talks to two backend endpoints (see config.js for the base URL):
 *   POST /api/knowledge/ingest  -> { text, sourceName }
 *   POST /api/chat/query        -> { query }
 *
 * No frameworks — plain DOM manipulation, kept intentionally simple and
 * readable so it's easy to extend.
 * --------------------------------------------------------------------------
 */

(() => {
  'use strict';

  // ---- DOM references -------------------------------------------------
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const pasteText = document.getElementById('pasteText');
  const sourceNameInput = document.getElementById('sourceNameInput');
  const ingestPasteBtn = document.getElementById('ingestPasteBtn');
  const ingestLog = document.getElementById('ingestLog');
  const statChunks = document.getElementById('statChunks');
  const statDocs = document.getElementById('statDocs');

  const chatScroll = document.getElementById('chatScroll');
  const emptyState = document.getElementById('emptyState');
  const queryForm = document.getElementById('queryForm');
  const queryInput = document.getElementById('queryInput');
  const queryBtn = document.getElementById('queryBtn');

  const connStatusDot = document.getElementById('connStatusDot');
  const connStatusLabel = document.getElementById('connStatusLabel');

  const toastEl = document.getElementById('toast');

  // ---- Local session state (purely for the stat counters / log) -------
  let totalChunks = 0;
  let totalDocs = 0;
  let toastTimer = null;

  // ======================================================================
  // Toast helper
  // ======================================================================
  function showToast(message, variant = 'default') {
    toastEl.textContent = message;
    toastEl.className = 'toast show' + (variant !== 'default' ? ` ${variant}` : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3200);
  }

  // ======================================================================
  // Backend health check
  // ======================================================================
  async function checkBackendHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
      if (res.ok) {
        connStatusDot.className = 'status-dot online';
        connStatusLabel.textContent = 'backend connected';
      } else {
        throw new Error('non-200');
      }
    } catch (err) {
      connStatusDot.className = 'status-dot offline';
      connStatusLabel.textContent = 'backend unreachable';
    }
  }

  // ======================================================================
  // Ingestion log rendering
  // ======================================================================
  function clearLogEmptyState() {
    const emptyEl = ingestLog.querySelector('.log-empty');
    if (emptyEl) emptyEl.remove();
  }

  function addLogItem(name, status, meta = '') {
    clearLogEmptyState();
    const item = document.createElement('div');
    item.className = `log-item ${status}`;

    const icon = status === 'success' ? '✓' : status === 'error' ? '✕' : '…';

    item.innerHTML = `
      <span class="log-icon">${icon}</span>
      <div class="log-body">
        <div class="log-name">${escapeHtml(name)}</div>
        <div class="log-meta">${escapeHtml(meta)}</div>
      </div>
    `;
    ingestLog.prepend(item);
    return item;
  }

  function updateLogItem(item, status, meta) {
    item.className = `log-item ${status}`;
    const icon = status === 'success' ? '✓' : status === 'error' ? '✕' : '…';
    item.querySelector('.log-icon').textContent = icon;
    item.querySelector('.log-meta').textContent = meta;
  }

  function bumpStats(chunkCount) {
    totalChunks += chunkCount;
    totalDocs += 1;
    statChunks.textContent = totalChunks;
    statDocs.textContent = totalDocs;
  }

  // ======================================================================
  // Core ingest call — shared by file uploads and the paste box
  // ======================================================================
  async function ingestText(text, sourceName) {
    const logItem = addLogItem(sourceName, 'pending', 'embedding & storing…');

    try {
      const res = await fetch(`${API_BASE_URL}/api/knowledge/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceName }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || `Request failed (${res.status})`);
      }

      updateLogItem(logItem, 'success', `${data.chunksIngested} chunk(s) indexed`);
      bumpStats(data.chunksIngested || 0);
      showToast(`Ingested ${sourceName}`, 'success');
    } catch (err) {
      updateLogItem(logItem, 'error', err.message || 'Ingestion failed');
      showToast(`Failed to ingest ${sourceName}`, 'error');
    }
  }

  // ======================================================================
  // File handling (drag/drop + click-to-browse)
  // ======================================================================
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const text = await readFileAsText(file);
        if (!text || !text.trim()) {
          addLogItem(file.name, 'error', 'File is empty — skipped');
          continue;
        }
        await ingestText(text, file.name);
      } catch (err) {
        addLogItem(file.name, 'error', 'Could not read file');
      }
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = ''; // allow re-selecting the same file later
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) handleFiles(files);
  });

  // ======================================================================
  // Paste-box ingestion
  // ======================================================================
  ingestPasteBtn.addEventListener('click', async () => {
    const text = pasteText.value.trim();
    if (!text) {
      showToast('Paste some text first', 'error');
      return;
    }

    const sourceName = sourceNameInput.value.trim() || 'pasted-text';

    ingestPasteBtn.disabled = true;
    ingestPasteBtn.classList.add('is-loading');

    await ingestText(text, sourceName);

    ingestPasteBtn.disabled = false;
    ingestPasteBtn.classList.remove('is-loading');
    pasteText.value = '';
    sourceNameInput.value = '';
  });

  // ======================================================================
  // Query / chat
  // ======================================================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function renderSourceCard(source) {
    // score is a cosine similarity in roughly [0,1] for normalized vectors —
    // clamp defensively in case Atlas returns something outside that range.
    const scorePct = Math.max(0, Math.min(1, source.similarityScore ?? 0)) * 100;

    return `
      <div class="source-card">
        <div class="source-card-head">
          <span class="source-name">${escapeHtml(source.sourceName)}</span>
          <span class="source-chunk-idx">chunk ${source.chunkIndex}</span>
        </div>
        <div class="score-track">
          <div class="score-bar"><div class="score-fill" style="width:${scorePct.toFixed(0)}%"></div></div>
          <span class="score-value">${scorePct.toFixed(0)}% match</span>
        </div>
        <div class="source-excerpt">${escapeHtml(source.excerpt)}</div>
      </div>
    `;
  }

  async function submitQuery(query) {
    emptyState.style.display = 'none';

    // Render the question turn
    const turn = document.createElement('div');
    turn.className = 'turn';
    turn.innerHTML = `
      <div class="turn-question"><span class="prompt-caret">$</span> ${escapeHtml(query)}</div>
      <div class="turn-answer is-loading">
        <span class="dot-flicker"><span></span><span></span><span></span></span>
        <span>retrieving context &amp; generating answer</span>
      </div>
    `;
    chatScroll.appendChild(turn);
    chatScroll.scrollTop = chatScroll.scrollHeight;

    const answerBox = turn.querySelector('.turn-answer');

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || `Request failed (${res.status})`);
      }

      answerBox.classList.remove('is-loading');

      const sourcesHtml = (data.sources && data.sources.length > 0)
        ? `
          <div class="sources-block">
            <div class="sources-label">Sources</div>
            ${data.sources.map(renderSourceCard).join('')}
          </div>
        `
        : '';

      answerBox.innerHTML = `
        <div class="answer-text">${escapeHtml(data.answer)}</div>
        ${sourcesHtml}
      `;
    } catch (err) {
      answerBox.classList.remove('is-loading');
      answerBox.innerHTML = `<div class="answer-text error-text">Couldn't get an answer: ${escapeHtml(err.message)}</div>`;
    }

    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  queryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;

    queryInput.value = '';
    queryBtn.disabled = true;

    submitQuery(query).finally(() => {
      queryBtn.disabled = false;
      queryInput.focus();
    });
  });

  // ======================================================================
  // Init
  // ======================================================================
  checkBackendHealth();
  setInterval(checkBackendHealth, 15000); // keep the status dot honest
})();
