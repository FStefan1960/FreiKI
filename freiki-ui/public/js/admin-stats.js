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
      window.addEventListener('load', () => {
        loadAdminStats();
        setInterval(loadAdminStats, 60000);
      });
      window.freikiStatsLoad = loadAdminStats;
    })();
