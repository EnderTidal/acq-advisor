/**
 * ACQ Advisor — Frontend logic
 * Chat interface + metrics display
 */

const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

let conversationHistory = [];

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  // Simple markdown: **bold**, *italic*, \n→<br>
  let html = escapeHtml(content)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  div.innerHTML = `<div class="msg-content"><p>${html}</p></div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.id = 'typingIndicator';
  div.innerHTML = `<div class="msg-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateMetrics(metrics) {
  if (!metrics) return;

  document.getElementById('metricStatus').textContent = 'Complete';
  document.getElementById('metricStatus').style.color = 'var(--green)';
  document.getElementById('metricLatency').textContent = `${metrics.totalLatencyMs}ms`;

  if (metrics.embedding) {
    document.getElementById('metricEmbed').textContent = `${metrics.embedding.latencyMs}ms`;
  }

  if (metrics.retrieval) {
    document.getElementById('metricRetrieval').textContent = `${metrics.retrieval.latencyMs}ms`;
    document.getElementById('metricChunks').textContent =
      `${metrics.retrieval.chunksUsed}/${metrics.retrieval.chunksSearched}`;
    document.getElementById('metricScores').textContent =
      metrics.retrieval.scores.map(s => s.toFixed(3)).join(', ') || '—';
  }

  if (metrics.generation) {
    document.getElementById('metricGen').textContent = `${metrics.generation.latencyMs}ms`;
    document.getElementById('metricTokens').textContent =
      `${metrics.generation.inputTokens} / ${metrics.generation.outputTokens}`;
    document.getElementById('metricModel').textContent = metrics.generation.model;
    document.getElementById('metricCost').textContent = metrics.generation.estimatedCost;
  }
}

function setLoading(loading) {
  sendBtn.disabled = loading;
  userInput.disabled = loading;
  if (loading) {
    document.getElementById('metricStatus').textContent = 'Processing...';
    document.getElementById('metricStatus').style.color = 'var(--orange)';
  }
}

async function sendMessage(e) {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  // Remove suggestion buttons after first message
  const suggestions = document.querySelector('.suggestions');
  if (suggestions) suggestions.remove();

  addMessage('user', text);
  userInput.value = '';

  conversationHistory.push({ role: 'user', content: text });

  setLoading(true);
  addTypingIndicator();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory })
    });

    const data = await res.json();
    removeTypingIndicator();

    if (data.error) {
      addMessage('bot', `Error: ${data.error}`);
    } else {
      addMessage('bot', data.reply);
      conversationHistory.push({ role: 'assistant', content: data.reply });
      updateMetrics(data.metrics);
    }
  } catch (err) {
    removeTypingIndicator();
    addMessage('bot', 'Connection error. Please try again.');
  }

  setLoading(false);
  userInput.focus();
}

function askSuggestion(btn) {
  userInput.value = btn.textContent;
  chatForm.dispatchEvent(new Event('submit'));
}

// Enter to send
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});
