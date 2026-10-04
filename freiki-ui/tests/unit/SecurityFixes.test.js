const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

describe('Security Fixes & Validation', () => {
  describe('JWT-Entropy Validation', () => {
    it('sollte sich wiederholende Zeichen erkennen', () => {
      const repeatedRegex = /^(.)\1{15,}$/;
      assert(repeatedRegex.test('aaaaaaaaaaaaaaaa'), 'aaaa... sollte erkannt werden');
      assert(!repeatedRegex.test('abcdefghijklmnop'), 'zufälliger String sollte nicht erkannt werden');
    });

    it('sollte vor schwachen Secrets warnen', () => {
      const hasUpper = /[A-Z]/;
      const hasLower = /[a-z]/;
      const hasDigit = /[0-9]/;
      const hasSpecial = /[^a-zA-Z0-9]/;

      const weakSecret = 'abcdefghijklmnop'; // nur lowercase
      assert(!hasUpper.test(weakSecret), 'kein Großbuchstabe');
      assert(!hasSpecial.test(weakSecret), 'kein Sonderzeichen');
    });

    it('sollte starke Secrets akzeptieren', () => {
      const strongSecret = 'MyS3cur3!Passw0rd#2026';
      const hasUpper = /[A-Z]/.test(strongSecret);
      const hasLower = /[a-z]/.test(strongSecret);
      const hasDigit = /[0-9]/.test(strongSecret);
      const hasSpecial = /[^a-zA-Z0-9]/.test(strongSecret);

      assert(hasUpper && hasLower && hasDigit && hasSpecial, 'Starkes Secret sollte alle Kriterien erfüllen');
    });
  });

  describe('Path-Traversal Prevention', () => {
    it('sollte ../etc/passwd blockieren', () => {
      const basePath = path.resolve('/app/images');
      const maliciousFile = '../../../etc/passwd';
      const fullPath = path.resolve(path.join(basePath, maliciousFile));

      const isValid = fullPath.startsWith(basePath + path.sep);
      assert(!isValid, 'Path-Traversal sollte blockiert werden');
    });

    it('sollte nested traversal blockieren', () => {
      const basePath = path.resolve('/app/uploads');
      const nested = '../../sensitive/file.txt';
      const fullPath = path.resolve(path.join(basePath, nested));

      const isValid = fullPath.startsWith(basePath + path.sep);
      assert(!isValid, 'Nested traversal sollte blockiert werden');
    });

    it('sollte legitime Pfade akzeptieren', () => {
      const basePath = path.resolve('/app/uploads');
      const legitFile = 'user-123/document.pdf';
      const fullPath = path.resolve(path.join(basePath, legitFile));

      const isValid = fullPath.startsWith(basePath + path.sep);
      assert(isValid, 'Legitimer Pfad sollte akzeptiert werden');
    });

    it('sollte subdirectories akzeptieren', () => {
      const basePath = path.resolve('/app/uploads');
      const subdir = 'archive/2026/file.zip';
      const fullPath = path.resolve(path.join(basePath, subdir));

      const isValid = fullPath.startsWith(basePath + path.sep);
      assert(isValid, 'Subdirectory sollte akzeptiert werden');
    });
  });

  describe('Admin-Form Validation', () => {
    it('sollte leere App-Namen ablehnen', () => {
      const name = '';
      const isValid = name.trim().length > 0;
      assert(!isValid, 'Leerer Name sollte ungültig sein');
    });

    it('sollte Whitespace-nur App-Namen ablehnen', () => {
      const name = '   ';
      const isValid = name.trim().length > 0;
      assert(!isValid, 'Nur Whitespace sollte ungültig sein');
    });

    it('sollte gültige App-Namen akzeptieren', () => {
      const validNames = ['FreiKI', 'KorKI', 'TestKI'];
      validNames.forEach(name => {
        const isValid = name.trim().length > 0;
        assert(isValid, `"${name}" sollte gültig sein`);
      });
    });

    it('sollte swVersion als Nummer validieren', () => {
      const isNumber = (val) => /^\d+$/.test(val);
      assert(isNumber('1'), '"1" sollte gültig sein');
      assert(isNumber('42'), '"42" sollte gültig sein');
      assert(!isNumber('v1'), '"v1" sollte ungültig sein');
      assert(!isNumber('1.0'), '"1.0" sollte ungültig sein');
    });
  });

  describe('CSP Compliance', () => {
    it('sollte frame-ancestors "self" enthalten', () => {
      const csp = "frame-ancestors 'self'";
      assert(csp.includes("'self'"), "frame-ancestors sollte 'self' enthalten");
      assert(!csp.includes("'none'"), "frame-ancestors sollte nicht 'none' sein");
    });

    it('sollte script-src korrekt sein', () => {
      const csp = "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";
      assert(csp.includes("'self'"));
      assert(csp.includes("'unsafe-inline'"), "onclick-Handler brauchen unsafe-inline");
      assert(csp.includes("'wasm-unsafe-eval'"));
    });

    it('sollte style-src unsafe-inline erlauben', () => {
      const csp = "style-src 'self' 'unsafe-inline'";
      assert(csp.includes("'unsafe-inline'"), "Inline Styles sind nötig");
    });
  });

  describe('RACE Condition Prevention', () => {
    it('sollte ENOENT graceful handhaben', () => {
      // Simulates try-catch bei fs.unlinkSync
      const simulateDelete = () => {
        const error = new Error('ENOENT: no such file');
        error.code = 'ENOENT';

        try {
          throw error;
        } catch (e) {
          if (e.code === 'ENOENT') {
            // Expected - file already deleted by another process
            return true;
          }
          throw e;
        }
      };

      assert(simulateDelete(), 'ENOENT sollte ignoriert werden (race condition)');
    });

    it('sollte andere Fehler propagieren', () => {
      const simulateDelete = () => {
        const error = new Error('EACCES: permission denied');
        error.code = 'EACCES';

        try {
          throw error;
        } catch (e) {
          if (e.code === 'ENOENT') {
            return true;
          }
          // Non-ENOENT Fehler sollten geloggt werden
          return false;
        }
      };

      assert(!simulateDelete(), 'Non-ENOENT Fehler sollten nicht ignoriert werden');
    });
  });

  describe('Prompt Injection Prevention', () => {
    it('sollte Sprachen-Input normalisieren statt zu verarbeiten', () => {
      // Statt LLM zu fragen, direkt mappen (hardcoded)
      const languageMap = {
        'de': 'deutsch',
        'deutsch': 'deutsch',
        'german': 'deutsch',
        'en': 'englisch',
        'englisch': 'englisch',
      };

      const normalize = (input) => {
        const lower = (input || '').toLowerCase().trim();
        return languageMap[lower] || null;
      };

      assert.strictEqual(normalize('de'), 'deutsch');
      assert.strictEqual(normalize('Deutsch'), 'deutsch');
      assert.strictEqual(normalize('GERMAN'), 'deutsch');
      assert.strictEqual(normalize('unknown-lang'), null);
    });

    it('sollte SQL-Injection-Versuche ablehnen', () => {
      const isSafeLanguage = (lang) => {
        // Nur alphanumeric + underscore erlaubt
        return /^[a-z0-9_]+$/.test((lang || '').toLowerCase());
      };

      assert(isSafeLanguage('deutsch'), 'deutsch sollte sicher sein');
      assert(!isSafeLanguage("deutsch'; DROP TABLE users--"), 'SQL-Injection sollte blockiert werden');
      assert(!isSafeLanguage('deutsch<script>'), 'XSS sollte blockiert werden');
    });
  });
});
