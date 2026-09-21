// Global UI State
let activePhone = null;
let sessionsData = [];
let pollingInterval = null;
let countdownInterval = null;

let apiPassword = localStorage.getItem('apiPassword') || '';

// Override fetch to include password
const originalFetch = window.fetch;
window.fetch = async function () {
  let [resource, config] = arguments;
  if (!config) config = {};
  if (!config.headers) config.headers = {};
  if (apiPassword) {
    config.headers['x-api-password'] = apiPassword;
  }
  return originalFetch(resource, config);
};

// DOM Elements
const sessionsList = document.getElementById('sessionsList');
const messagesContainer = document.getElementById('messagesContainer');
const chatHeader = document.getElementById('chatHeader');
const controlsPanel = document.getElementById('controlsPanel');
const activePhoneEl = document.getElementById('activePhone');
const aiStatusBadge = document.getElementById('aiStatusBadge');
const aiToggleCheckbox = document.getElementById('aiToggleCheckbox');
const btnResume = document.getElementById('btnResume');
const chatInputArea = document.getElementById('chatInputArea');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

// Login Elements
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const apiPasswordInput = document.getElementById('apiPasswordInput');
const loginError = document.getElementById('loginError');

function startApp() {
  fetchSessions();
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(fetchSessions, 3000);
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = apiPasswordInput.value.trim();
      if (!pwd) return;
      
      apiPassword = pwd;
      
      try {
        const response = await fetch('/api/sessions');
        if (response.ok) {
          localStorage.setItem('apiPassword', apiPassword);
          if (loginModal) loginModal.style.display = 'none';
          if (loginError) loginError.style.display = 'none';
          startApp();
        } else {
          if (loginError) loginError.style.display = 'block';
          apiPassword = '';
        }
      } catch (err) {
        if (loginError) {
          loginError.innerText = 'Network Error';
          loginError.style.display = 'block';
        }
      }
    });
  }

  if (apiPassword) {
    fetch('/api/sessions').then(res => {
      if (res.ok) {
        if (loginModal) loginModal.style.display = 'none';
        startApp();
      } else {
        if (loginModal) loginModal.style.display = 'flex';
        localStorage.removeItem('apiPassword');
        apiPassword = '';
      }
    });
  } else {
    if (loginModal) loginModal.style.display = 'flex';
  }

  // Setup Event Listeners for Pause Buttons
  document.querySelectorAll('.btn-pause').forEach(button => {
    button.addEventListener('click', (e) => {
      const minutes = e.target.getAttribute('data-time');
      pauseAI(minutes);
    });
  });

  // Resume Button Event
  btnResume.addEventListener('click', resumeAI);

  // AI Toggle Change Event
  aiToggleCheckbox.addEventListener('change', (e) => {
    toggleAI(e.target.checked);
  });

  // Message Form Submit
  messageForm.addEventListener('submit', handleSendMessage);
});

// Fetch all active sessions
async function fetchSessions() {
  try {
    const response = await fetch('/api/sessions');
    if (!response.ok) throw new Error('Failed to fetch sessions');
    sessionsData = await response.json();
    renderSessions();
    if (activePhone) {
      updateChatHeaderState();
    }
  } catch (err) {
    console.error('Error fetching sessions:', err);
  }
}

// Render sessions list in the sidebar
function renderSessions() {
  if (sessionsData.length === 0) {
    sessionsList.innerHTML = '<div class="empty-sessions">No active chats found yet.</div>';
    return;
  }

  sessionsList.innerHTML = '';
  sessionsData.forEach(session => {
    const item = document.createElement('div');
    item.className = `session-item ${activePhone === session.phone ? 'active' : ''}`;
    item.onclick = () => selectChat(session.phone);

    // Determine status badge
    let statusText = '🤖 AI Active';
    let badgeClass = 'badge-ai';
    
    const isPaused = session.pausedUntil && session.pausedUntil > Date.now();
    if (!session.aiEnabled) {
      statusText = '👤 Manual Only';
      badgeClass = 'badge-manual';
    } else if (isPaused) {
      statusText = '⏸️ AI Paused';
      badgeClass = 'badge-paused';
    }

    item.innerHTML = `
      <div class="session-meta">
        <span class="phone-number">+${session.phone}</span>
        <span class="item-badge ${badgeClass}">${statusText}</span>
      </div>
      <div class="last-msg">${session.lastMessage || 'No messages yet'}</div>
    `;
    sessionsList.appendChild(item);
  });
}

// Select a chat to view
async function selectChat(phone) {
  activePhone = phone;
  
  // Highlight active item in sidebar
  document.querySelectorAll('.session-item').forEach(item => {
    const num = item.querySelector('.phone-number').innerText.replace('+', '');
    if (num === phone) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Show header panels and inputs
  controlsPanel.style.display = 'flex';
  aiStatusBadge.style.display = 'inline-flex';
  chatInputArea.style.display = 'block';

  // Load chat history
  await fetchChatHistory(phone);
  
  // Update header labels/controls
  updateChatHeaderState();
}

// Fetch chat history for selected phone
async function fetchChatHistory(phone) {
  try {
    const response = await fetch(`/api/chats/${phone}`);
    if (!response.ok) throw new Error('Failed to load chat history');
    const data = await response.json();
    renderMessages(data.history);
  } catch (err) {
    console.error('Error fetching history:', err);
  }
}

// Render message bubbles in chat pane
function renderMessages(history) {
  messagesContainer.innerHTML = '';
  
  // Filter out system prompt to keep conversation log clean
  const chatMessages = history.filter(msg => msg.role !== 'system');

  if (chatMessages.length === 0) {
    messagesContainer.innerHTML = '<div class="empty-state"><p>No messages in this chat history.</p></div>';
    return;
  }

  chatMessages.forEach(msg => {
    const bubble = document.createElement('div');
    // Align based on role
    const isUser = msg.role === 'user';
    bubble.className = `message-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.innerText = msg.content;
    bubble.appendChild(contentDiv);

    if (msg.timestamp) {
      const timeDiv = document.createElement('div');
      timeDiv.className = 'msg-time';
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timeDiv.innerText = timeStr;
      bubble.appendChild(timeDiv);
    }

    messagesContainer.appendChild(bubble);
  });

  scrollToBottom();
}

// Update Chat Header Controls and Timers
function updateChatHeaderState() {
  const session = sessionsData.find(s => s.phone === activePhone);
  if (!session) return;

  activePhoneEl.innerText = `+${session.phone}`;

  // Clear existing countdown
  clearInterval(countdownInterval);

  const isPaused = session.pausedUntil && session.pausedUntil > Date.now();

  // Reset status classes
  aiStatusBadge.className = 'status-badge';
  
  if (!session.aiEnabled) {
    aiStatusBadge.classList.add('ai-disabled');
    aiStatusBadge.querySelector('.status-text').innerText = 'Manual Only';
    aiToggleCheckbox.checked = false;
    btnResume.style.display = 'none';
  } else if (isPaused) {
    aiStatusBadge.classList.add('ai-paused');
    aiToggleCheckbox.checked = true;
    btnResume.style.display = 'inline-block';
    
    // Start live countdown timer
    startCountdown(session.pausedUntil);
  } else {
    aiStatusBadge.classList.add('ai-active');
    aiStatusBadge.querySelector('.status-text').innerText = 'AI Autoreply Active';
    aiToggleCheckbox.checked = true;
    btnResume.style.display = 'none';
  }
}

// Start visual countdown for paused status
function startCountdown(pausedUntilTime) {
  const statusTextSpan = aiStatusBadge.querySelector('.status-text');

  function updateTimer() {
    const remainingMs = pausedUntilTime - Date.now();
    if (remainingMs <= 0) {
      clearInterval(countdownInterval);
      statusTextSpan.innerText = 'AI Active';
      fetchSessions(); // trigger refresh
      return;
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    
    statusTextSpan.innerText = `AI Paused (${formattedMinutes}:${formattedSeconds})`;
  }

  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}

// Pause AI for active chat
async function pauseAI(minutes) {
  if (!activePhone) return;
  try {
    const response = await fetch('/api/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activePhone, durationMinutes: minutes })
    });
    if (response.ok) {
      fetchSessions();
    }
  } catch (err) {
    console.error('Error pausing AI:', err);
  }
}

// Resume AI for active chat
async function resumeAI() {
  if (!activePhone) return;
  try {
    const response = await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activePhone })
    });
    if (response.ok) {
      fetchSessions();
    }
  } catch (err) {
    console.error('Error resuming AI:', err);
  }
}

// Toggle AI State for active chat
async function toggleAI(enabled) {
  if (!activePhone) return;
  try {
    const response = await fetch('/api/toggle-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activePhone, aiEnabled: enabled })
    });
    if (response.ok) {
      fetchSessions();
    }
  } catch (err) {
    console.error('Error toggling AI state:', err);
  }
}

// Send Manual Message
async function handleSendMessage(e) {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message || !activePhone) return;

  // Optimistic UI update: show message immediately
  const localBubble = document.createElement('div');
  localBubble.className = 'message-bubble bubble-assistant';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'msg-content';
  contentDiv.innerText = message;
  localBubble.appendChild(contentDiv);

  const timeDiv = document.createElement('div');
  timeDiv.className = 'msg-time';
  timeDiv.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  localBubble.appendChild(timeDiv);

  messagesContainer.appendChild(localBubble);
  scrollToBottom();

  messageInput.value = '';

  try {
    const response = await fetch('/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activePhone, message: message })
    });
    
    if (response.ok) {
      fetchSessions(); // refresh state to show 5m pause
    } else {
      console.error('Send message failed');
    }
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

// Auto-Scroll message window to bottom
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Knowledge Base Logic ---
const btnOpenKB = document.getElementById('btnOpenKB');
const btnCloseKB = document.getElementById('btnCloseKB');
const kbModal = document.getElementById('kbModal');
const kbForm = document.getElementById('kbForm');
const kbList = document.getElementById('kbList');

let editingKbId = null;

if (btnOpenKB) {
  btnOpenKB.addEventListener('click', () => {
    kbModal.style.display = 'flex';
    fetchKnowledgeBase();
  });
}
if (btnCloseKB) {
  btnCloseKB.addEventListener('click', () => {
    kbModal.style.display = 'none';
  });
}

async function fetchKnowledgeBase() {
  try {
    const res = await fetch('/api/knowledge');
    const data = await res.json();
    renderKnowledgeBase(data);
  } catch (e) {
    console.error('Failed to fetch KB');
  }
}

function renderKnowledgeBase(data) {
  if (!data || data.length === 0) {
    kbList.innerHTML = '<div class="empty-state">No knowledge base items found.</div>';
    return;
  }
  kbList.innerHTML = '';
  data.forEach(item => {
    const div = document.createElement('div');
    div.className = 'kb-item';
    
    // Escape quotes to safely pass to inline onclick handler
    const safeQ = item.question.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeA = item.answer.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    div.innerHTML = `
      <p><strong>Q:</strong> ${item.question}</p>
      <p><strong>A:</strong> ${item.answer}</p>
      <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
        <button class="btn-edit-kb" style="background: var(--accent-blue); color: #fff; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.8rem;" onclick="editKnowledge('${item._id}', '${safeQ}', '${safeA}')">Edit</button>
        <button class="btn-delete-kb" style="background: #ff5c5c; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.8rem; position: static;" onclick="deleteKnowledge('${item._id}')">Delete</button>
      </div>
    `;
    kbList.appendChild(div);
  });
}

window.editKnowledge = function(id, q, a) {
  editingKbId = id;
  document.getElementById('kbQuestion').value = q;
  document.getElementById('kbAnswer').value = a;
  
  const submitBtn = kbForm.querySelector('button[type="submit"]');
  submitBtn.innerText = 'Update Knowledge Base';
  submitBtn.style.background = 'var(--accent-blue)';
  
  // Scroll up to form
  document.getElementById('kbModal').querySelector('.login-box').scrollTop = 0;
};

if (kbForm) {
  kbForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = document.getElementById('kbQuestion').value;
    const answer = document.getElementById('kbAnswer').value;
    
    try {
      let res;
      if (editingKbId) {
        res = await fetch(`/api/knowledge/${editingKbId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer })
        });
      } else {
        res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer })
        });
      }
      
      if (res.ok) {
        document.getElementById('kbQuestion').value = '';
        document.getElementById('kbAnswer').value = '';
        editingKbId = null;
        
        const submitBtn = kbForm.querySelector('button[type="submit"]');
        submitBtn.innerText = 'Add to Knowledge Base';
        submitBtn.style.background = 'var(--accent-green)';
        
        fetchKnowledgeBase();
      }
    } catch (err) {
      console.error(err);
    }
  });
}

window.deleteKnowledge = async function(id) {
  if (!confirm('Are you sure you want to delete this?')) return;
  try {
    const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    if (res.ok) fetchKnowledgeBase();
  } catch (e) {
    console.error(e);
  }
};

// --- Bot Welcome Flow Builder Logic ---
const btnOpenBotFlow = document.getElementById('btnOpenBotFlow');
const btnCloseBotFlow = document.getElementById('btnCloseBotFlow');
const botFlowModal = document.getElementById('botFlowModal');
const flowToggleCheckbox = document.getElementById('flowToggleCheckbox');
const flowStepsContainer = document.getElementById('flowStepsContainer');
const btnSaveFlow = document.getElementById('btnSaveFlow');
const btnResetFlow = document.getElementById('btnResetFlow');
const flowSaveStatus = document.getElementById('flowSaveStatus');

let currentBotFlow = null;

if (btnOpenBotFlow) {
  btnOpenBotFlow.addEventListener('click', () => {
    if (botFlowModal) botFlowModal.style.display = 'flex';
    fetchBotFlow();
  });
}

if (btnCloseBotFlow) {
  btnCloseBotFlow.addEventListener('click', () => {
    if (botFlowModal) botFlowModal.style.display = 'none';
  });
}

async function fetchBotFlow() {
  if (!flowStepsContainer) return;
  try {
    const res = await fetch('/api/bot-flow');
    if (!res.ok) throw new Error('Failed to load bot flow');
    const data = await res.json();
    currentBotFlow = data.flow || {};
    
    if (flowToggleCheckbox) {
      flowToggleCheckbox.checked = currentBotFlow.isEnabled !== false;
    }
    
    renderFlowSteps();
  } catch (err) {
    console.error('Error fetching bot flow:', err);
    flowStepsContainer.innerHTML = '<div style="color:#ff5c5c; padding:10px;">Failed to load flow steps.</div>';
  }
}

function renderFlowSteps() {
  if (!flowStepsContainer || !currentBotFlow || !currentBotFlow.steps) return;
  
  flowStepsContainer.innerHTML = '';
  
  currentBotFlow.steps.forEach((step, index) => {
    const card = document.createElement('div');
    card.className = 'flow-step-card';
    card.setAttribute('data-step-index', index);

    // Determine badge type
    let badgeClass = 'badge-text';
    let badgeLabel = '💬 Text Prompt';
    if (step.messageType === 'interactive_button') {
      badgeClass = 'badge-button';
      badgeLabel = '🔘 WhatsApp Buttons (Quick Replies)';
    } else if (step.messageType === 'interactive_list') {
      badgeClass = 'badge-list';
      badgeLabel = '📋 WhatsApp List Menu';
    }

    let optionsHtml = '';
    if (step.options && step.options.length > 0) {
      optionsHtml = `
        <div class="options-container">
          <label class="flow-input-label" style="font-weight:600; color:#fff;">Options / Buttons to Display:</label>
          ${step.options.map((opt, optIndex) => `
            <div class="option-row" data-opt-index="${optIndex}">
              <input type="text" class="flow-text-input opt-title" placeholder="Button/Option Title" value="${escapeHtml(opt.title || '')}" style="flex: 1;">
              <input type="text" class="flow-text-input opt-desc" placeholder="Short description (for list)" value="${escapeHtml(opt.description || '')}" style="flex: 1.5; ${step.messageType === 'interactive_button' ? 'display:none;' : ''}">
            </div>
          `).join('')}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flow-step-header">
        <div class="flow-step-title">
          <span>${escapeHtml(step.title || `Step ${step.stepNumber}`)}</span>
        </div>
        <span class="flow-step-badge ${badgeClass}">${badgeLabel}</span>
      </div>

      <div>
        <label class="flow-input-label">Message Header (Optional bold headline):</label>
        <input type="text" class="flow-text-input step-header" placeholder="e.g. Welcome to Digital ORRA! 🚀" value="${escapeHtml(step.headerText || '')}">
      </div>

      <div>
        <label class="flow-input-label">Message Content / Question (Required):</label>
        <textarea class="flow-textarea step-body" rows="3" placeholder="Enter message text">${escapeHtml(step.bodyText || '')}</textarea>
      </div>

      ${step.messageType === 'interactive_list' ? `
        <div>
          <label class="flow-input-label">List Button Text:</label>
          <input type="text" class="flow-text-input step-btn-label" placeholder="e.g. Select Option" value="${escapeHtml(step.actionButtonText || 'Select Option')}">
        </div>
      ` : ''}

      ${optionsHtml}

      <div>
        <label class="flow-input-label">Footer Note (Optional subtle text):</label>
        <input type="text" class="flow-text-input step-footer" placeholder="e.g. Digital ORRA - Panchkula" value="${escapeHtml(step.footerText || '')}">
      </div>
    `;

    flowStepsContainer.appendChild(card);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

if (btnSaveFlow) {
  btnSaveFlow.addEventListener('click', async () => {
    if (!currentBotFlow || !currentBotFlow.steps) return;
    
    // Harvest inputs from DOM
    const stepCards = document.querySelectorAll('.flow-step-card');
    stepCards.forEach((card, idx) => {
      const step = currentBotFlow.steps[idx];
      if (!step) return;

      const headerInput = card.querySelector('.step-header');
      const bodyInput = card.querySelector('.step-body');
      const footerInput = card.querySelector('.step-footer');
      const btnLabelInput = card.querySelector('.step-btn-label');

      if (headerInput) step.headerText = headerInput.value.trim();
      if (bodyInput) step.bodyText = bodyInput.value.trim();
      if (footerInput) step.footerText = footerInput.value.trim();
      if (btnLabelInput) step.actionButtonText = btnLabelInput.value.trim();

      const optRows = card.querySelectorAll('.option-row');
      optRows.forEach((row, oIdx) => {
        if (step.options && step.options[oIdx]) {
          const tInput = row.querySelector('.opt-title');
          const dInput = row.querySelector('.opt-desc');
          if (tInput) step.options[oIdx].title = tInput.value.trim();
          if (dInput) step.options[oIdx].description = dInput.value.trim();
        }
      });
    });

    const isEnabled = flowToggleCheckbox ? flowToggleCheckbox.checked : true;

    btnSaveFlow.disabled = true;
    btnSaveFlow.innerText = 'Saving...';

    try {
      const res = await fetch('/api/bot-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isEnabled: isEnabled,
          steps: currentBotFlow.steps
        })
      });

      if (res.ok) {
        if (flowSaveStatus) {
          flowSaveStatus.style.display = 'inline';
          setTimeout(() => { flowSaveStatus.style.display = 'none'; }, 3000);
        }
      } else {
        alert('Failed to save flow. Please check console.');
      }
    } catch (err) {
      console.error('Error saving flow:', err);
      alert('Network error while saving flow.');
    } finally {
      btnSaveFlow.disabled = false;
      btnSaveFlow.innerText = '💾 Save Flow Changes';
    }
  });
}

if (btnResetFlow) {
  btnResetFlow.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all steps to the default 5-step flow? Any custom text changes will be replaced.')) {
      return;
    }

    try {
      const res = await fetch('/api/bot-flow/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        currentBotFlow = data.flow || {};
        if (flowToggleCheckbox) flowToggleCheckbox.checked = currentBotFlow.isEnabled !== false;
        renderFlowSteps();
        if (flowSaveStatus) {
          flowSaveStatus.innerText = 'Reset to default successfully! ✓';
          flowSaveStatus.style.display = 'inline';
          setTimeout(() => { 
            flowSaveStatus.style.display = 'none'; 
            flowSaveStatus.innerText = 'Saved successfully! ✓';
          }, 3000);
        }
      }
    } catch (err) {
      console.error('Error resetting flow:', err);
    }
  });
}

