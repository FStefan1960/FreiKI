    var _tcUrl = '';
    function openTeamchat() {
      var btn = document.getElementById('teamchat-btn');
      _tcUrl = btn ? btn.dataset.url : '';
      if (!_tcUrl) return;
      document.getElementById('tc-modal-overlay').classList.add('visible');
    }
    function tcClose(open) {
      document.getElementById('tc-modal-overlay').classList.remove('visible');
      if (open) { window.open(_tcUrl,'_blank'); }
    }
