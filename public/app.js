/**
 * ACQ Advisor — Frontend logic
 * Streaming chat + metrics + source display
 */

const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

let conversationHistory = [];
let totalQueries = 0;
let totalCost = 0;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="msg-content"><p>${renderMarkdown(content)}</p></div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function addStreamingMessage() {
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.innerHTML = `<div class="msg-content"><p class="stream-text"></p><div class="sources-wrap"></div></div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function updateMetrics(data) {
  if (data.embedding) {
    document.getElementById('metricEmbed').textContent = `${data.embedding.latencyMs}ms`;
  }
  if (data.retrieval) {
    document.getElementById('metricRetrieval').textContent = `${data.retrieval.latencyMs}ms`;
    document.getElementById('metricChunks').textContent =
      `${data.retrieval.chunksUsed}/${data.retrieval.chunksSearched}`;
    document.getElementById('metricScores').textContent =
      data.retrieval.scores.map(s => s.toFixed(3)).join(', ') || '—';
  }
  if (data.generation) {
    document.getElementById('metricGen').textContent = `${data.generation.latencyMs}ms`;
    document.getElementById('metricTokens').textContent =
      `${data.generation.inputTokens} / ${data.generation.outputTokens}`;
    document.getElementById('metricModel').textContent = data.generation.model;
    document.getElementById('metricCost').textContent = data.generation.estimatedCost;

    // Update cumulative dashboard
    const cost = parseFloat(data.generation.estimatedCost.replace('$', '')) || 0;
    totalCost += cost;
    totalQueries++;
    document.getElementById('dashQueries').textContent = totalQueries;
    document.getElementById('dashCost').textContent = `$${totalCost.toFixed(4)}`;
    document.getElementById('dashAvg').textContent = `$${(totalCost / totalQueries).toFixed(4)}`;
  }
  if (data.totalLatencyMs) {
    document.getElementById('metricLatency').textContent = `${data.totalLatencyMs}ms`;
    document.getElementById('metricStatus').textContent = 'Complete';
    document.getElementById('metricStatus').style.color = 'var(--green)';
  }
  // Update budget from server-provided D1 data (persistent across sessions)
  if (data.budget) {
    const spent = parseFloat(data.budget.dailySpend.replace('$', '')) || 0;
    const cap = parseFloat(data.budget.dailyCap.replace('$', '')) || 5.00;
    const remaining = parseFloat(data.budget.remaining.replace('$', '')) || 0;
    document.getElementById('budgetSpent').textContent = data.budget.dailySpend;
    document.getElementById('budgetCap').textContent = data.budget.dailyCap;
    document.getElementById('budgetRemaining').textContent = data.budget.remaining;
    const pct = Math.min(100, (spent / cap) * 100);
    const bar = document.getElementById('budgetBarFill');
    bar.style.width = `${pct}%`;
    bar.className = 'budget-bar-fill' + (pct > 80 ? ' critical' : pct > 50 ? ' warning' : '');
    // Update query count from server
    if (data.budget.queryCount !== undefined) {
      document.getElementById('dashQueries').textContent = data.budget.queryCount;
    }
  }
}

function showSources(sourcesWrap, sources) {
  if (!sources || sources.length === 0) return;
  const details = document.createElement('details');
  details.className = 'sources';
  details.innerHTML = `<summary>Sources (${sources.length} chunks)</summary>
    <div class="sources-list">
      ${sources.map((s, i) => `
        <div class="source-item">
          <span class="source-score">${s.score.toFixed(3)}</span>
          <span class="source-text">${escapeHtml(s.text)}</span>
        </div>
      `).join('')}
    </div>`;
  sourcesWrap.appendChild(details);
}

function setLoading(loading) {
  sendBtn.disabled = loading;
  userInput.disabled = loading;
  if (loading) {
    document.getElementById('metricStatus').textContent = 'Streaming...';
    document.getElementById('metricStatus').style.color = 'var(--orange)';
  }
}

async function sendMessage(e) {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  const suggestions = document.querySelector('.suggestions');
  if (suggestions) suggestions.remove();

  addMessage('user', text);
  userInput.value = '';
  conversationHistory.push({ role: 'user', content: text });

  setLoading(true);
  const msgDiv = addStreamingMessage();
  const streamText = msgDiv.querySelector('.stream-text');
  const sourcesWrap = msgDiv.querySelector('.sources-wrap');

  let fullText = '';
  let sources = [];

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));

          if (data.type === 'metrics') {
            updateMetrics(data);
            sources = data.sources || [];
          }

          if (data.type === 'text') {
            fullText += data.text;
            streamText.innerHTML = renderMarkdown(fullText);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }

          if (data.type === 'done') {
            updateMetrics(data);
          }

          if (data.type === 'error') {
            streamText.textContent = `Error: ${data.error}`;
          }
        } catch (e) {
          // Skip unparseable
        }
      }
    }

    conversationHistory.push({ role: 'assistant', content: fullText });
    showSources(sourcesWrap, sources);

  } catch (err) {
    streamText.textContent = 'Connection error. Please try again.';
  }

  setLoading(false);
  userInput.focus();
}

function askSuggestion(btn) {
  userInput.value = btn.textContent;
  chatForm.dispatchEvent(new Event('submit'));
}

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});
