    // UI-Sprache: Deutsch bleibt unverändert im Markup (Fallback), en/fr/es sind ein
    // Overlay per data-i18n-Attribut + Wörterbuch aus /i18n/<lang>.json.
    const FK_SUPPORTED_LANGS = ['de', 'en', 'fr', 'es', 'ru', 'id', 'mg'];
    function fkGetUiLang() {
      const stored = localStorage.getItem('fk_ui_lang');
      if (stored && FK_SUPPORTED_LANGS.includes(stored)) return stored;
      const nav = (navigator.language || 'de').slice(0, 2).toLowerCase();
      return FK_SUPPORTED_LANGS.includes(nav) ? nav : 'de';
    }
    async function fkApplyUiLang(lang) {
      document.documentElement.lang = lang;
      const sw = document.getElementById('fk-lang-switch');
      if (sw) sw.value = lang;
      if (lang === 'de') return;
      let dict = {};
      try {
        const res = await fetch('/i18n/' + lang + '.json');
        dict = await res.json();
      } catch (e) { console.warn('i18n: Wörterbuch konnte nicht geladen werden', e); }
      Object.keys(dict).forEach(k => {
        if (typeof dict[k] === 'string') dict[k] = dict[k].replace(/\{\{APP_NAME\}\}/g, window.FK_APP_NAME || 'FreiKI');
      });
      window.FK_I18N_DICT = dict;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if (dict[k]) el.textContent = dict[k];
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const k = el.getAttribute('data-i18n-placeholder');
        if (dict[k]) el.placeholder = dict[k];
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const k = el.getAttribute('data-i18n-title');
        if (dict[k]) el.title = dict[k];
      });
      document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const k = el.getAttribute('data-i18n-alt');
        if (dict[k]) el.alt = dict[k];
      });
      document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const k = el.getAttribute('data-i18n-html');
        if (dict[k]) el.innerHTML = (window.DOMPurify ? DOMPurify.sanitize(dict[k]) : dict[k]);
      });
    }
    window.t = function(key, germanDefault) {
      return (window.FK_I18N_DICT && window.FK_I18N_DICT[key]) || germanDefault;
    };
    document.addEventListener('DOMContentLoaded', () => {
      window.FK_I18N_READY = fkApplyUiLang(fkGetUiLang());
    });
