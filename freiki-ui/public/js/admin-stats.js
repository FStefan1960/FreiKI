    (function() {
      async function loadAdminStats() {
        if (!State.authToken) return;
        try {
          const r = await fetch('/api/admin/stats');
          if (!r.ok) return;
          const d = await r.json();
          const el = document.getElementById('stats-text');
          if (el) {
            let text = d.requests + ' / ' + d.users + ' / ' + d.gpuCacheLive.toFixed(1) + '% (↑' + d.gpuCachePeak.toFixed(1) + '%)';
            if (d.powerLive != null) text += ' · ' + d.powerLive + ' W';
            el.textContent = text;
          }
        } catch(_) {}
      }
      async function triggerDailyReport(ev) {
        if (!State.authToken) return;
        if (!confirm(t('admin.send_daily_report_confirm', 'Tagesbericht jetzt per Mail versenden?'))) return;
        const pill = document.getElementById('admin-stats');
        const el = document.getElementById('stats-text');
        const prevText = el ? el.textContent : '';
        if (pill) pill.classList.add('sending');
        if (el) el.textContent = t('admin.sending', 'Sende…');
        try {
          const r = await fetch('/api/admin/trigger-daily-report', { method: 'POST' });
          const d = await r.json().catch(() => ({}));
          if (el) el.textContent = r.ok ? t('admin.sent_check', '✓ gesendet') : t('admin.error_x', '✗ Fehler');
          if (!r.ok) alert(d.error || t('admin.report_send_failed', 'Fehler beim Senden des Tagesberichts'));
        } catch (_) {
          if (el) el.textContent = t('admin.error_x', '✗ Fehler');
        } finally {
          setTimeout(() => {
            if (pill) pill.classList.remove('sending');
            if (el) el.textContent = prevText;
          }, 3000);
        }
      }
      window.addEventListener('load', () => {
        loadAdminStats();
        setInterval(loadAdminStats, 60000);
      });
      window.freikiStatsLoad = loadAdminStats;
      window.triggerDailyReport = triggerDailyReport;
    })();
