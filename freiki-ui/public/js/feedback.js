// ── Feedback Modal ──
let feedbackType = 'feedback';

function openFeedback() {
  document.getElementById('feedback-modal').classList.add('show');
  document.getElementById('feedback-text').value = '';
  document.getElementById('feedback-submit').disabled = false;
  document.getElementById('feedback-submit').textContent = t('common.send', 'Senden');
  closeSidebar();
}

function closeFeedback() {
  document.getElementById('feedback-modal').classList.remove('show');
}

function closeFeedbackOnOverlay(e) {
  if (e.target === document.getElementById('feedback-modal')) closeFeedback();
}

function setFeedbackType(type, btn) {
  feedbackType = type;
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function submitFeedback() {
  const text = document.getElementById('feedback-text').value.trim();
  if (!text) return;
  const btn = document.getElementById('feedback-submit');
  btn.disabled = true;
  btn.textContent = t('js.sending', 'Wird gesendet...');
  await sendFeedback({ type: feedbackType, text });
  btn.textContent = t('js.sent_checkmark', '✓ Gesendet');
  setTimeout(closeFeedback, 1000);
}

async function sendFeedback(data) {
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        user: currentUsername,
        mode: currentMode,
        timestamp: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Feedback-Fehler:', e);
  }
}

// ── Sterne-Bewertung ──
function addStarRating(bubble, msgId) {
  const wrapper = bubble.parentElement.querySelector('.msg-actions') || bubble.parentElement;
  const ratingDiv = document.createElement('div');
  ratingDiv.className = 'star-rating';
  ratingDiv.id = 'rating-' + msgId;

  for (let i = 1; i <= 4; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = '★';
    star.dataset.value = i;

    star.addEventListener('mouseenter', () => {
      if (ratingDiv.dataset.submitted) return;
      ratingDiv.querySelectorAll('.star').forEach(s =>
        s.classList.toggle('active', s.dataset.value <= i)
      );
    });
    star.addEventListener('mouseleave', () => {
      if (ratingDiv.dataset.submitted) return;
      const current = ratingDiv.dataset.current || 0;
      ratingDiv.querySelectorAll('.star').forEach(s =>
        s.classList.toggle('active', s.dataset.value <= current)
      );
    });
    star.addEventListener('click', () => {
      if (ratingDiv.dataset.submitted) return;
      ratingDiv.dataset.current = i;
      ratingDiv.dataset.submitted = '1';
      ratingDiv.querySelectorAll('.star').forEach(s => {
        s.classList.toggle('active', s.dataset.value <= i);
        s.classList.add('submitted');
      });
      const thanks = document.createElement('span');
      thanks.className = 'rating-thanks';
      thanks.textContent = t('js.thanks', 'Danke!');
      ratingDiv.appendChild(thanks);
      sendFeedback({
        type: 'rating',
        rating: i,
        messagePreview: bubble.innerText.slice(0, 200)
      });
    });
    ratingDiv.appendChild(star);
  }
  wrapper.appendChild(ratingDiv);
}
