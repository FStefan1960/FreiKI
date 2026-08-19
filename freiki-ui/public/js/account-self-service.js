  function openChangePw() {
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
    document.getElementById('pw-error').style.display = 'none';
    document.getElementById('changepw-modal').classList.add('show');
    setTimeout(() => document.getElementById('pw-current').focus(), 50);
  }
  function closeChangePw() {
    document.getElementById('changepw-modal').classList.remove('show');
  }
  async function submitChangePw() {
    const current = document.getElementById('pw-current').value;
    const newPw   = document.getElementById('pw-new').value;
    const confirm = document.getElementById('pw-confirm').value;
    const errEl   = document.getElementById('pw-error');
    const btn     = document.getElementById('pw-submit-btn');

    errEl.style.display = 'none';
    if (!current || !newPw || !confirm) { errEl.textContent = t('changepw.fill_all_fields', 'Bitte alle Felder ausfüllen.'); errEl.style.display='block'; return; }
    if (newPw !== confirm) { errEl.textContent = t('changepw.passwords_mismatch', 'Neue Passwörter stimmen nicht überein.'); errEl.style.display='block'; return; }
    if (newPw.length < 8) { errEl.textContent = t('changepw.min_length', 'Passwort muss mindestens 8 Zeichen haben.'); errEl.style.display='block'; return; }

    btn.disabled = true;
    btn.textContent = '...';
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw })
      });
      const data = await res.json();
      if (data.success) {
        closeChangePw();
        alert(t('changepw.success', 'Passwort erfolgreich geändert.'));
      } else {
        errEl.textContent = data.error || t('changepw.change_failed', 'Fehler beim Ändern des Passworts.');
        errEl.style.display = 'block';
      }
    } catch(e) {
      errEl.textContent = t('common.connection_error', 'Verbindungsfehler.');
      errEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = t('common.change', 'Ändern');
  }

  async function openChangeLanguage() {
    document.getElementById('lang-input').value = '';
    document.getElementById('lang-error').style.display = 'none';
    document.getElementById('lang-current').textContent = '…';
    document.getElementById('change-language-modal').classList.add('show');
    setTimeout(() => document.getElementById('lang-input').focus(), 50);
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      document.getElementById('lang-current').textContent = data.language || t('lang_modal.default_language', 'deutsch');
    } catch (e) {
      document.getElementById('lang-current').textContent = t('lang_modal.default_language', 'deutsch');
    }
  }
  function closeChangeLanguage() {
    document.getElementById('change-language-modal').classList.remove('show');
  }
  async function submitChangeLanguage() {
    const input = document.getElementById('lang-input').value.trim();
    const errEl = document.getElementById('lang-error');
    const btn   = document.getElementById('lang-submit-btn');

    errEl.style.display = 'none';
    if (!input) { errEl.textContent = t('lang_modal.enter_language', 'Bitte eine Sprache eingeben.'); errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = '...';
    try {
      const res = await fetch('/api/change-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: input })
      });
      const data = await res.json();
      if (data.ok) {
        closeChangeLanguage();
        alert(t('lang_modal.changed_to', 'Antwortsprache geändert auf: ') + data.language);
      } else {
        errEl.textContent = data.error || t('lang_modal.change_failed', 'Fehler beim Ändern der Sprache.');
        errEl.style.display = 'block';
      }
    } catch (e) {
      errEl.textContent = t('common.connection_error', 'Verbindungsfehler.');
      errEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = t('common.change', 'Ändern');
  }
