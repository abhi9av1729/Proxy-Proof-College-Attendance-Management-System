/* ==========================================================================
   4-Year College Attendance System - Core Application Logic
   ========================================================================== */

(function () {
  'use strict';

  // --- LOCALSTORAGE KEYS & DEFAULT CONFIGURATION ---
  const STORAGE_KEYS = {
    ADMIN_USER: 'att_admin_user',
    ADMIN_PASS: 'att_admin_pass',
    REP_PASSCODE: 'att_rep_passcode',
    STUDENT_PASSCODE: 'att_student_passcode',
    WEBAPP_URL: 'att_webapp_url',
    THEME: 'att_theme',
    SAVED_STUDENT: 'att_saved_student',
    ATTENDANCE_LOGS: 'att_attendance_logs'
  };

  // Default Credentials & Settings
  const DEFAULTS = {
    ADMIN_USER: 'Abhi9av',
    ADMIN_PASS: 'Abhi9av@1729',
    REP_PASSCODE: '8899',
    STUDENT_PASSCODE: '1234',
    WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbzq-dUY3e88Jcs5M1ir3TUFpRDKhqDc-gBcQtkviPgzpMRsnAYozMrUNu5NCJEViFwP8Q/exec'
  };

  // Application State
  let state = {
    theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'dark',
    adminUser: localStorage.getItem(STORAGE_KEYS.ADMIN_USER) || DEFAULTS.ADMIN_USER,
    adminPass: localStorage.getItem(STORAGE_KEYS.ADMIN_PASS) || DEFAULTS.ADMIN_PASS,
    repPasscode: localStorage.getItem(STORAGE_KEYS.REP_PASSCODE) || DEFAULTS.REP_PASSCODE,
    studentPasscode: localStorage.getItem(STORAGE_KEYS.STUDENT_PASSCODE) || DEFAULTS.STUDENT_PASSCODE,
    webAppUrl: localStorage.getItem(STORAGE_KEYS.WEBAPP_URL) || DEFAULTS.WEBAPP_URL,
    
    isAdminAuthenticated: false,
    isRepUnlocked: false,
    isStudentUnlocked: false,
    isScanning: false,
    isProcessingScan: false,
    currentFacingMode: 'environment', // 'environment' or 'user'
    
    logs: JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE_LOGS) || '[]')
  };

  // HTML5 Scanner Instance
  let html5QrScanner = null;

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  function playSuccessChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      
      // Note 1 (E5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);
      
      // Note 2 (B5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.1);
      gain2.gain.setValueAtTime(0.4, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  function playDuplicateBuzz() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(140, now + 0.15);
      
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSectionDropdowns();
    initUppercaseEnforcement();
    initTabNavigation();
    initModals();
    initStudentForm();
    initRepScannerControls();
    initAdminSettings();
    renderScannedLogs();

    // Check if Lucide icons are available
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Auto-sync offline logs & start live multi-device polling loop
    if (navigator.onLine) {
      syncPendingLogs();
      fetchTodayLogsFromSheet();
    }
    window.addEventListener('online', () => {
      syncPendingLogs();
      fetchTodayLogsFromSheet();
    });

    // Continuously poll Google Sheets every 5 seconds for instant multi-device sync
    setInterval(fetchTodayLogsFromSheet, 5000);
  });

  // --- THEME ENGINE ---
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();

    const themeBtn = document.getElementById('theme-toggle-btn');
    themeBtn.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
      updateThemeIcon();
    });
  }

  function updateThemeIcon() {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    if (state.theme === 'light') {
      icon.setAttribute('data-lucide', 'sun');
    } else {
      icon.setAttribute('data-lucide', 'moon');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  // --- HELPER: LOCAL CALENDAR DATE & DROPDOWNS ---
  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function initSectionDropdowns() {
    const sections = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    ['student-section', 'manual-section'].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      select.innerHTML = sections.map(s => `<option value="${s}">Section ${s}</option>`).join('');
    });
  }

  function initUppercaseEnforcement() {
    const uppercaseInputs = document.querySelectorAll('.uppercase-input');
    uppercaseInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.toUpperCase();
        e.target.setSelectionRange(start, end);
      });
    });
  }

  // --- TAB NAVIGATION ---
  function initTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabTarget = btn.getAttribute('data-tab');

        // Check Rep Mode passcode protection
        if (tabTarget === 'rep' && !state.isRepUnlocked) {
          openModal('rep-auth-modal');
          return;
        }

        switchTab(tabTarget);
      });
    });
  }

  function switchTab(tabTarget) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabTarget}"]`);
    const activePanel = document.getElementById(`${tabTarget}-panel`);

    if (activeBtn) activeBtn.classList.add('active');
    if (activePanel) activePanel.classList.add('active');
  }

  // --- MODAL SYSTEM ---
  function initModals() {
    const closeBtns = document.querySelectorAll('[data-close-modal]');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        closeModal(modalId);
      });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal(overlay.id);
        }
      });
    });
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  // --- TIER 1: STUDENT ID GENERATOR ---
  function initStudentForm() {
    const form = document.getElementById('student-id-form');
    const savedStudentStr = localStorage.getItem(STORAGE_KEYS.SAVED_STUDENT);

    // Student Passcode Modal Unlock & Generate Button
    document.getElementById('unlock-student-btn').addEventListener('click', () => {
      const passcode = document.getElementById('student-passcode-input').value.trim();
      if (passcode === state.studentPasscode) {
        closeModal('student-auth-modal');
        document.getElementById('student-passcode-input').value = '';

        if (state.pendingStudentData) {
          // Save to localStorage for quick retrieval
          localStorage.setItem(STORAGE_KEYS.SAVED_STUDENT, JSON.stringify(state.pendingStudentData));
          
          generateStudentQR(state.pendingStudentData);

          // Trigger Confetti Effect
          if (window.confetti) {
            window.confetti({
              particleCount: 70,
              spread: 60,
              origin: { y: 0.7 }
            });
          }
          state.pendingStudentData = null;
        }
      } else {
        alert('Incorrect Student Passcode. Access Denied.');
      }
    });

    // Restore saved student if present
    if (savedStudentStr) {
      try {
        const saved = JSON.parse(savedStudentStr);
        document.getElementById('student-name').value = saved.name || '';
        document.getElementById('student-reg').value = saved.regNo || '';
        if (saved.course) document.getElementById('student-course').value = saved.course;
        if (saved.section) document.getElementById('student-section').value = saved.section;
      } catch (e) {
        console.warn('Failed to parse saved student info:', e);
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const name = document.getElementById('student-name').value.trim().toUpperCase();
      const regNo = document.getElementById('student-reg').value.trim().toUpperCase();
      const course = document.getElementById('student-course').value;
      const section = document.getElementById('student-section').value;

      if (!name || !regNo) {
        alert('Please fill in both Name and Registration Number.');
        return;
      }

      state.pendingStudentData = { regNo, name, course, section };

      // Open Passcode Modal when student wants to generate QR code!
      openModal('student-auth-modal');
    });

    // Download QR Image Button Action
    document.getElementById('download-qr-btn').addEventListener('click', () => {
      const canvas = document.getElementById('qr-canvas');
      if (!canvas) return;

      const regNo = document.getElementById('card-display-reg').textContent || 'STUDENT';
      const imageURI = canvas.toDataURL('image/png');
      
      const link = document.createElement('a');
      link.download = `QR_ID_${regNo}.png`;
      link.href = imageURI;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // --- STANDALONE EMBEDDED QR ENGINE (100% Offline & Reliable) ---
  var QRCodeLib = (function () {
    function QRPolynomial(num, shift) {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) offset++;
      this.num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    }
    QRPolynomial.prototype = {
      get: function (index) { return this.num[index]; },
      getLength: function () { return this.num.length; },
      multiply: function (e) {
        var num = new Array(this.getLength() + e.getLength() - 1);
        for (var i = 0; i < this.getLength(); i++) {
          for (var j = 0; j < e.getLength(); j++) {
            num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
          }
        }
        return new QRPolynomial(num, 0);
      },
      mod: function (e) {
        if (this.getLength() - e.getLength() < 0) return this;
        var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        var num = new Array(this.getLength());
        for (var i = 0; i < this.getLength(); i++) num[i] = this.get(i);
        for (var i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
        return new QRPolynomial(num, 0).mod(e);
      }
    };

    var QRRSBlock = {
      RS_BLOCK_TABLE: [
        [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
        [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
        [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
        [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
        [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
        [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
        [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
        [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
        [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
        [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]
      ],
      getRSBlocks: function (typeNumber, errorCorrectionLevel) {
        var rsBlock = this.getRsBlockTable(typeNumber, errorCorrectionLevel);
        if (!rsBlock) return [];
        var length = rsBlock.length / 3;
        var list = [];
        for (var i = 0; i < length; i++) {
          var count = rsBlock[i * 3 + 0];
          var totalCount = rsBlock[i * 3 + 1];
          var dataCount = rsBlock[i * 3 + 2];
          for (var j = 0; j < count; j++) list.push({ totalCount: totalCount, dataCount: dataCount });
        }
        return list;
      },
      getRsBlockTable: function (typeNumber, errorCorrectionLevel) {
        switch (errorCorrectionLevel) {
          case 1: return this.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
          case 0: return this.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
          case 3: return this.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
          case 2: return this.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
          default: return undefined;
        }
      }
    };

    var QRMath = {
      glog: function (n) { if (n < 1) throw new Error("glog(" + n + ")"); return QRMath.LOG_TABLE[n]; },
      gexp: function (n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return QRMath.EXP_TABLE[n]; },
      EXP_TABLE: new Array(256), LOG_TABLE: new Array(256)
    };
    for (var i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
    for (var i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    for (var i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

    function QRCodeModel(typeNumber, errorCorrectionLevel) {
      this.typeNumber = typeNumber;
      this.errorCorrectionLevel = errorCorrectionLevel;
      this.modules = null;
      this.moduleCount = 0;
      this.dataCache = null;
      this.dataList = [];
    }
    QRCodeModel.prototype = {
      addData: function (data) {
        this.dataList.push({
          mode: 4, data: data,
          getLength: function () { return this.data.length; },
          write: function (buffer) {
            for (var i = 0; i < this.data.length; i++) buffer.put(this.data.charCodeAt(i), 8);
          }
        });
        this.dataCache = null;
      },
      isDark: function (row, col) {
        if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) return false;
        return this.modules[row][col];
      },
      getModuleCount: function () { return this.moduleCount; },
      make: function () {
        if (this.typeNumber < 1) {
          var typeNumber = 1;
          for (typeNumber = 1; typeNumber < 40; typeNumber++) {
            var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectionLevel);
            var buffer = { buffer: [], length: 0, put: function (num, length) { for (var i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) == 1); }, putBit: function (bit) { var bufIndex = Math.floor(this.length / 8); if (this.buffer.length <= bufIndex) this.buffer.push(0); if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8)); this.length++; } };
            for (var i = 0; i < this.dataList.length; i++) {
              var item = this.dataList[i];
              buffer.put(4, 4);
              buffer.put(item.getLength(), typeNumber < 10 ? 8 : 16);
              item.write(buffer);
            }
            var totalDataCount = 0;
            for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
            if (buffer.length <= totalDataCount * 8) break;
          }
          this.typeNumber = typeNumber;
        }
        this.makeImpl(false, this.getBestMaskPattern());
      },
      makeImpl: function (test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (var row = 0; row < this.moduleCount; row++) {
          this.modules[row] = new Array(this.moduleCount);
          for (var col = 0; col < this.moduleCount; col++) this.modules[row][col] = null;
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) this.setupTypeNumber(test);
        if (this.dataCache == null) this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectionLevel, this.dataList);
        this.mapData(this.dataCache, maskPattern);
      },
      setupPositionProbePattern: function (row, col) {
        for (var r = -1; r <= 7; r++) {
          if (row + r <= -1 || this.moduleCount <= row + r) continue;
          for (var c = -1; c <= 7; c++) {
            if (col + c <= -1 || this.moduleCount <= col + c) continue;
            if ((0 <= r && r <= 6 && (c == 0 || c == 6)) || (0 <= c && c <= 6 && (r == 0 || r == 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      },
      getBestMaskPattern: function () {
        var minLostPoint = 0;
        var bestMaskPattern = 0;
        for (var i = 0; i < 8; i++) {
          this.makeImpl(true, i);
          var lostPoint = QRCodeModel.getLostPoint(this);
          if (i == 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; bestMaskPattern = i; }
        }
        return bestMaskPattern;
      },
      setupTimingPattern: function () {
        for (var r = 8; r < this.moduleCount - 8; r++) {
          if (this.modules[r][6] != null) continue;
          this.modules[r][6] = (r % 2 == 0);
        }
        for (var c = 8; c < this.moduleCount - 8; c++) {
          if (this.modules[6][c] != null) continue;
          this.modules[6][c] = (c % 2 == 0);
        }
      },
      setupPositionAdjustPattern: function () {
        var pos = QRCodeModel.getPatternPosition(this.typeNumber);
        for (var i = 0; i < pos.length; i++) {
          for (var j = 0; j < pos.length; j++) {
            var row = pos[i];
            var col = pos[j];
            if (this.modules[row][col] != null) continue;
            for (var r = -2; r <= 2; r++) {
              for (var c = -2; c <= 2; c++) {
                if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) {
                  this.modules[row + r][col + c] = true;
                } else {
                  this.modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      },
      setupTypeNumber: function (test) {
        var bits = QRCodeModel.getBCHTypeNumber(this.typeNumber);
        for (var i = 0; i < 18; i++) {
          var mod = (!test && ((bits >> i) & 1) == 1);
          this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
          this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
        }
      },
      setupTypeInfo: function (test, maskPattern) {
        var data = (this.errorCorrectionLevel << 3) | maskPattern;
        var bits = QRCodeModel.getBCHTypeInfo(data);
        for (var i = 0; i < 15; i++) {
          var mod = (!test && ((bits >> i) & 1) == 1);
          if (i < 6) this.modules[i][8] = mod;
          else if (i < 8) this.modules[i + 1][8] = mod;
          else this.modules[this.moduleCount - 15 + i][8] = mod;
          if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
          else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
          else this.modules[8][15 - i - 1] = mod;
        }
        this.modules[this.moduleCount - 8][8] = (!test);
      },
      mapData: function (data, maskPattern) {
        var inc = -1;
        var row = this.moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        for (var col = this.moduleCount - 1; col > 0; col -= 2) {
          if (col == 6) col--;
          while (true) {
            for (var c = 0; c < 2; c++) {
              if (this.modules[row][col - c] == null) {
                var dark = false;
                if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) == 1);
                var mask = QRCodeModel.getMask(maskPattern, row, col - c);
                if (mask) dark = !dark;
                this.modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex == -1) { byteIndex++; bitIndex = 7; }
              }
            }
            row += inc;
            if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
          }
        }
      }
    };

    QRCodeModel.PAD0 = 0xEC; QRCodeModel.PAD1 = 0x11;
    QRCodeModel.createData = function (typeNumber, errorCorrectionLevel, dataList) {
      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);
      var buffer = { buffer: [], length: 0, put: function (num, length) { for (var i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) == 1); }, putBit: function (bit) { var bufIndex = Math.floor(this.length / 8); if (this.buffer.length <= bufIndex) this.buffer.push(0); if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8)); this.length++; } };
      for (var i = 0; i < dataList.length; i++) {
        var item = dataList[i];
        buffer.put(4, 4);
        buffer.put(item.getLength(), typeNumber < 10 ? 8 : 16);
        item.write(buffer);
      }
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
      while (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
      while (buffer.length % 8 != 0) buffer.putBit(false);
      while (true) {
        if (buffer.length >= totalDataCount * 8) break;
        buffer.put(QRCodeModel.PAD0, 8);
        if (buffer.length >= totalDataCount * 8) break;
        buffer.put(QRCodeModel.PAD1, 8);
      }
      return QRCodeModel.createBytes(buffer, rsBlocks);
    };
    QRCodeModel.createBytes = function (buffer, rsBlocks) {
      var offset = 0;
      var maxDcCount = 0;
      var maxEcCount = 0;
      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);
      for (var r = 0; r < rsBlocks.length; r++) {
        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (var i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
        offset += dcCount;
        var rsPoly = QRCodeModel.getErrorCorrectionPolynomial(ecCount);
        var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i++) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
        }
      }
      var data = [];
      for (var i = 0; i < maxDcCount; i++) { for (var r = 0; r < rsBlocks.length; r++) { if (i < dcdata[r].length) data.push(dcdata[r][i]); } }
      for (var i = 0; i < maxEcCount; i++) { for (var r = 0; r < rsBlocks.length; r++) { if (i < ecdata[r].length) data.push(ecdata[r][i]); } }
      return data;
    };
    QRCodeModel.getErrorCorrectionPolynomial = function (errorCorrectionLength) {
      var a = new QRPolynomial([1], 0);
      for (var i = 0; i < errorCorrectionLength; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
      return a;
    };
    QRCodeModel.getMask = function (maskPattern, i, j) {
      switch (maskPattern) {
        case 0: return (i + j) % 2 == 0;
        case 1: return i % 2 == 0;
        case 2: return j % 3 == 0;
        case 3: return (i + j) % 3 == 0;
        case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
        case 5: return (i * j) % 2 + (i * j) % 3 == 0;
        case 6: return ((i * j) % 2 + (i * j) % 3) % 2 == 0;
        case 7: return ((i * j) % 3 + (i + j) % 2) % 2 == 0;
        default: return false;
      }
    };
    QRCodeModel.getLostPoint = function (qrCode) {
      var moduleCount = qrCode.getModuleCount();
      var lostPoint = 0;
      for (var row = 0; row < moduleCount; row++) {
        for (var col = 0; col < moduleCount; col++) {
          var sameCount = 0;
          var dark = qrCode.isDark(row, col);
          for (var r = -1; r <= 1; r++) {
            if (row + r < 0 || moduleCount <= row + r) continue;
            for (var c = -1; c <= 1; c++) {
              if (col + c < 0 || moduleCount <= col + c) continue;
              if (r == 0 && c == 0) continue;
              if (dark == qrCode.isDark(row + r, col + c)) sameCount++;
            }
          }
          if (sameCount > 5) lostPoint += (3 + sameCount - 5);
        }
      }
      return lostPoint;
    };
    QRCodeModel.getPatternPosition = function (typeNumber) {
      return [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]][typeNumber - 1] || [6, 26, 50];
    };
    QRCodeModel.getBCHTypeInfo = function (data) {
      var d = data << 10;
      while (QRCodeModel.getBCHDigit(d) - QRCodeModel.getBCHDigit(0x537) >= 0) {
        d ^= (0x537 << (QRCodeModel.getBCHDigit(d) - QRCodeModel.getBCHDigit(0x537)));
      }
      return ((data << 10) | d) ^ 0x5412;
    };
    QRCodeModel.getBCHTypeNumber = function (data) {
      var d = data << 12;
      while (QRCodeModel.getBCHDigit(d) - QRCodeModel.getBCHDigit(0x1f25) >= 0) {
        d ^= (0x1f25 << (QRCodeModel.getBCHDigit(d) - QRCodeModel.getBCHDigit(0x1f25)));
      }
      return (data << 12) | d;
    };
    QRCodeModel.getBCHDigit = function (data) {
      var digit = 0;
      while (data != 0) { digit++; data >>>= 1; }
      return digit;
    };

    return {
      drawToCanvas: function (canvas, text, size) {
        size = size || 220;
        var qr = new QRCodeModel(0, 1);
        qr.addData(text);
        qr.make();
        
        var ctx = canvas.getContext('2d');
        var moduleCount = qr.getModuleCount();
        var margin = 2;
        var totalCells = moduleCount + margin * 2;
        var cellSize = size / totalCells;

        canvas.width = size;
        canvas.height = size;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = '#000000';
        for (var r = 0; r < moduleCount; r++) {
          for (var c = 0; c < moduleCount; c++) {
            if (qr.isDark(r, c)) {
              var x = Math.round((c + margin) * cellSize);
              var y = Math.round((r + margin) * cellSize);
              var w = Math.ceil(cellSize);
              var h = Math.ceil(cellSize);
              ctx.fillRect(x, y, w, h);
            }
          }
        }
      }
    };
  })();

  function generateStudentQR(data) {
    const jsonPayload = JSON.stringify(data);
    const canvas = document.getElementById('qr-canvas');
    if (!canvas) return;

    // 1. Draw using embedded standalone QRCodeLib (Guaranteed 100% offline & fast)
    try {
      QRCodeLib.drawToCanvas(canvas, jsonPayload, 200);
    } catch (err) {
      console.warn('QRCodeLib error, falling back to window.QRCode:', err);
      if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
        window.QRCode.toCanvas(canvas, jsonPayload, { width: 200, margin: 1 });
      }
    }

    // Update Digital Card text elements
    document.getElementById('card-display-name').textContent = data.name;
    document.getElementById('card-display-reg').textContent = data.regNo;
    document.getElementById('card-display-course').textContent = data.course;
    document.getElementById('card-display-section').textContent = `SECTION ${data.section}`;

    // Show Card Container
    document.getElementById('id-card-wrapper').classList.remove('hidden');
    
    // Smooth scroll to card
    document.getElementById('id-card-wrapper').scrollIntoView({ behavior: 'smooth' });
  }

  // --- TIER 2: REPRESENTATIVE SCANNER ---
  function initRepScannerControls() {
    // Rep Passcode Modal Unlock Button
    document.getElementById('unlock-rep-btn').addEventListener('click', () => {
      const passcode = document.getElementById('rep-passcode-input').value.trim();
      if (passcode === state.repPasscode) {
        state.isRepUnlocked = true;
        closeModal('rep-auth-modal');
        document.getElementById('rep-passcode-input').value = '';
        switchTab('rep');
      } else {
        alert('Incorrect Representative Passcode. Access Denied.');
      }
    });

    // Start Camera Button
    document.getElementById('start-camera-btn').addEventListener('click', startScanner);
    
    // Stop Camera Button
    document.getElementById('stop-camera-btn').addEventListener('click', stopScanner);

    // Switch Camera Button
    document.getElementById('switch-camera-btn').addEventListener('click', () => {
      state.currentFacingMode = state.currentFacingMode === 'environment' ? 'user' : 'environment';
      if (state.isScanning) {
        stopScanner().then(() => startScanner());
      }
    });

    // Manual Entry Button
    document.getElementById('manual-entry-btn').addEventListener('click', () => {
      openModal('manual-entry-modal');
    });

    // Manual Entry Form Submit
    document.getElementById('manual-attendance-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('manual-name').value.trim().toUpperCase();
      const regNo = document.getElementById('manual-reg').value.trim().toUpperCase();
      const course = document.getElementById('manual-course').value;
      const section = document.getElementById('manual-section').value;

      if (!name || !regNo) return;

      processStudentScan({ regNo, name, course, section });
      closeModal('manual-entry-modal');
      document.getElementById('manual-attendance-form').reset();
    });

    // Sync Now Button
    document.getElementById('sync-now-btn').addEventListener('click', () => {
      syncPendingLogs();
    });
  }

  function startScanner() {
    if (state.isScanning) return;

    document.getElementById('scanner-placeholder').classList.add('hidden');
    document.getElementById('stop-camera-btn').classList.remove('hidden');
    document.getElementById('switch-camera-btn').classList.remove('hidden');
    
    const statusBadge = document.getElementById('scanner-status-badge');
    statusBadge.textContent = 'Scanning Active';
    statusBadge.className = 'badge badge-success';

    if (!html5QrScanner) {
      html5QrScanner = new Html5Qrcode('reader');
    }

    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    html5QrScanner.start(
      { facingMode: state.currentFacingMode },
      config,
      onScanSuccess,
      onScanFailure
    ).then(() => {
      state.isScanning = true;
    }).catch(err => {
      console.error('Unable to start camera scanner:', err);
      alert('Unable to access camera. Please allow camera permissions or use Manual Entry.');
      stopScanner();
    });
  }

  function stopScanner() {
    return new Promise((resolve) => {
      if (html5QrScanner && state.isScanning) {
        html5QrScanner.stop().then(() => {
          state.isScanning = false;
          updateScannerUIStopped();
          resolve();
        }).catch(err => {
          console.error('Error stopping scanner:', err);
          state.isScanning = false;
          updateScannerUIStopped();
          resolve();
        });
      } else {
        updateScannerUIStopped();
        resolve();
      }
    });
  }

  function updateScannerUIStopped() {
    document.getElementById('scanner-placeholder').classList.remove('hidden');
    document.getElementById('stop-camera-btn').classList.add('hidden');
    document.getElementById('switch-camera-btn').classList.add('hidden');
    
    const statusBadge = document.getElementById('scanner-status-badge');
    statusBadge.textContent = 'Scanner Idle';
    statusBadge.className = 'badge badge-warning';
  }

  function onScanSuccess(decodedText, decodedResult) {
    if (state.isProcessingScan) return;

    let studentData = null;
    try {
      studentData = JSON.parse(decodedText);
    } catch (e) {
      // Fallback if scanned text is just a raw roll number
      studentData = {
        regNo: decodedText.trim().toUpperCase(),
        name: 'STUDENT (' + decodedText.trim().toUpperCase() + ')',
        course: 'B.Tech',
        section: 'A'
      };
    }

    if (studentData && studentData.regNo) {
      processStudentScan(studentData);
    }
  }

  function onScanFailure(error) {
    // Ignore minor scanner frame read errors
  }

  // --- CORE ATTENDANCE PROCESSING & FULL SCREEN FLASH OVERLAYS ---
  function processStudentScan(data) {
    state.isProcessingScan = true;
    
    const name = (data.name || 'UNKNOWN STUDENT').toUpperCase();
    const regNo = (data.regNo || 'NO-REG').toUpperCase();
    const course = data.course || 'B.Tech';
    const section = data.section || 'A';

    const todayDateStr = getTodayDateString();

    // Check if student was ALREADY scanned today (resets automatically every calendar day)
    const alreadyScanned = state.logs.some(log => {
      const logDate = log.dateStr || (log.timestamp ? log.timestamp.split('T')[0] : '');
      return logDate === todayDateStr && log.regNo.toUpperCase() === regNo;
    });

    // Pause Camera Scan while showing overlay
    if (html5QrScanner && state.isScanning) {
      try {
        html5QrScanner.pause(true);
      } catch (e) { console.warn(e); }
    }

    if (alreadyScanned) {
      // --- DUPLICATE SCAN: ORANGE FLASH OVERLAY (1.5 Seconds) ---
      playDuplicateBuzz();
      
      document.getElementById('flash-duplicate-name').textContent = name;
      document.getElementById('flash-duplicate-reg').textContent = regNo;
      
      const overlay = document.getElementById('flash-duplicate-overlay');
      overlay.classList.add('active');

      setTimeout(() => {
        overlay.classList.remove('active');
        resumeCameraAfterOverlay();
      }, 1500);

    } else {
      // --- SUCCESSFUL SCAN: BRIGHT GREEN FLASH OVERLAY (1.5 Seconds) ---
      playSuccessChime();

      document.getElementById('flash-success-name').textContent = name;
      document.getElementById('flash-success-reg').textContent = regNo;

      const overlay = document.getElementById('flash-success-overlay');
      overlay.classList.add('active');

      const now = new Date();
      const todayDateStr = getTodayDateString();
      const timeStr = now.toLocaleTimeString([], { hour12: false });

      // Record new attendance entry matching sheet layout: Date, Time, RegNo, Name, Course, Section
      const newRecord = {
        id: Date.now().toString(),
        regNo,
        name,
        course,
        section,
        timestamp: now.toISOString(),
        dateStr: todayDateStr,
        timeStr: timeStr,
        status: 'pending',
        repId: 'REP-01'
      };

      state.logs.unshift(newRecord);
      saveLogs();
      renderScannedLogs();

      // Trigger HTTP POST sync
      syncSingleRecord(newRecord);

      setTimeout(() => {
        overlay.classList.remove('active');
        resumeCameraAfterOverlay();
      }, 1500);
    }
  }

  function resumeCameraAfterOverlay() {
    if (html5QrScanner && state.isScanning) {
      try {
        html5QrScanner.resume();
      } catch (e) { console.warn(e); }
    }
    state.isProcessingScan = false;
  }

  // --- BACKEND SYNC & OFFLINE QUEUE MANAGER ---
  function syncSingleRecord(record) {
    if (!state.webAppUrl || !navigator.onLine) return;

    fetch(state.webAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(record)
    }).then(() => {
      record.status = 'synced';
      saveLogs();
      renderScannedLogs();
    }).catch(err => {
      console.warn('Sync failed, queued offline:', err);
    });
  }

  function syncPendingLogs() {
    if (!state.webAppUrl || !navigator.onLine) {
      if (!state.webAppUrl) {
        console.log('Web App URL not configured in Admin Settings.');
      }
      return;
    }

    // First fetch live logs from sheet to sync cross-device scans
    fetchTodayLogsFromSheet();

    const pendingLogs = state.logs.filter(log => log.status === 'pending');
    if (pendingLogs.length === 0) return;

    pendingLogs.forEach(record => {
      fetch(state.webAppUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(record)
      }).then(() => {
        record.status = 'synced';
        saveLogs();
        renderScannedLogs();
      }).catch(err => {
        console.warn('Offline sync item failed:', err);
      });
    });
  }

  // --- LIVE CROSS-DEVICE LOG & PASSCODE FETCHING (JSONP BULLETPROOF ENGINE) ---
  function fetchTodayLogsFromSheet() {
    if (!state.webAppUrl || !navigator.onLine) return;

    const cbName = '__att_sync_cb_' + Date.now();
    window[cbName] = function(data) {
      try {
        delete window[cbName];
        const el = document.getElementById(cbName);
        if (el) el.remove();
      } catch (e) {}

      if (!data || data.result !== 'success') return;

      // Check if Admin triggered a global logs clear on another device
      if (data.lastClearedAt) {
        const localLastClear = localStorage.getItem('att_last_cleared_at') || '0';
        if (String(data.lastClearedAt) > String(localLastClear)) {
          localStorage.setItem('att_last_cleared_at', String(data.lastClearedAt));
          state.logs = [];
          saveLogs();
          renderScannedLogs();
        }
      }

      // Sync ALL remote config & passcodes if changed on another device
      if (data.repPasscode) {
        state.repPasscode = data.repPasscode;
        localStorage.setItem(STORAGE_KEYS.REP_PASSCODE, data.repPasscode);
      }
      if (data.studentPasscode) {
        state.studentPasscode = data.studentPasscode;
        localStorage.setItem(STORAGE_KEYS.STUDENT_PASSCODE, data.studentPasscode);
      }
      if (data.adminUser) {
        state.adminUser = data.adminUser;
        localStorage.setItem(STORAGE_KEYS.ADMIN_USER, data.adminUser);
      }
      if (data.adminPass) {
        state.adminPass = data.adminPass;
        localStorage.setItem(STORAGE_KEYS.ADMIN_PASS, data.adminPass);
      }
      if (data.webAppUrl && data.webAppUrl !== state.webAppUrl) {
        state.webAppUrl = data.webAppUrl;
        localStorage.setItem(STORAGE_KEYS.WEBAPP_URL, data.webAppUrl);
      }

      if (data.logs && Array.isArray(data.logs)) {
        const todayDateStr = getTodayDateString();
        
        data.logs.forEach(remoteLog => {
          if (!remoteLog || !remoteLog.regNo) return;

          const exists = state.logs.some(localLog => 
            localLog.regNo.toUpperCase() === remoteLog.regNo.toUpperCase()
          );

          if (!exists) {
            state.logs.unshift({
              id: 'remote-' + Math.random().toString(36).substring(2),
              regNo: remoteLog.regNo.toUpperCase(),
              name: remoteLog.name.toUpperCase(),
              course: remoteLog.course || 'B.Tech',
              section: remoteLog.section || 'A',
              timestamp: new Date().toISOString(),
              dateStr: todayDateStr,
              timeStr: remoteLog.timeStr || '',
              status: 'synced',
              repId: 'REP-REMOTE'
            });
          }
        });

        saveLogs();
        renderScannedLogs();
      }
    };

    // Inject JSONP script tag (bypasses browser CORS restrictions 100%)
    const script = document.createElement('script');
    script.id = cbName;
    script.src = `${state.webAppUrl}?action=getTodayLogs&callback=${cbName}&t=${Date.now()}`;
    script.onerror = function() {
      try {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      } catch (e) {}
    };
    document.body.appendChild(script);
  }

  function saveLogs() {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(state.logs));
  }

  function renderScannedLogs() {
    const listContainer = document.getElementById('scanned-logs-list');
    const todayCountBadge = document.getElementById('today-count-badge');
    const pendingCountBadge = document.getElementById('pending-count-badge');

    const todayDateStr = getTodayDateString();
    const todayLogs = state.logs.filter(log => {
      if (!log) return false;
      const logDate = (log.dateStr || (log.timestamp ? log.timestamp.split('T')[0] : '')).trim();
      return logDate === todayDateStr || logDate.indexOf(todayDateStr) !== -1 || !log.dateStr;
    });

    const pendingCount = state.logs.filter(l => l.status === 'pending').length;

    todayCountBadge.textContent = `${todayLogs.length} Scanned`;

    if (pendingCount > 0) {
      pendingCountBadge.textContent = `${pendingCount} Offline`;
      pendingCountBadge.classList.remove('hidden');
    } else {
      pendingCountBadge.classList.add('hidden');
    }

    if (todayLogs.length === 0) {
      listContainer.innerHTML = `
        <p style="text-align: center; color: var(--text-muted); padding: 16px; font-size: 13px;">
          No attendance marked today yet.
        </p>
      `;
      return;
    }

    listContainer.innerHTML = todayLogs.map(log => {
      const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const statusBadge = log.status === 'synced'
        ? `<span class="badge badge-success">Synced</span>`
        : `<span class="badge badge-warning">Pending</span>`;

      return `
        <div class="log-item">
          <div class="log-info">
            <span class="log-name">${escapeHtml(log.name)}</span>
            <span class="log-sub">${escapeHtml(log.regNo)} &bull; ${escapeHtml(log.course)} (${escapeHtml(log.section)})</span>
          </div>
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            ${statusBadge}
            <span class="log-time">${timeStr}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- TIER 3: ADMIN SETTINGS & AUTH ---
  function initAdminSettings() {
    const gearBtn = document.getElementById('admin-gear-btn');
    
    // Open Admin Modal
    gearBtn.addEventListener('click', () => {
      if (state.isAdminAuthenticated) {
        showAdminSettingsView();
      } else {
        showAdminLoginView();
      }
      openModal('admin-modal');
    });

    // Admin Login Submit Button
    document.getElementById('admin-login-submit-btn').addEventListener('click', () => {
      const user = document.getElementById('admin-login-user').value.trim();
      const pass = document.getElementById('admin-login-pass').value.trim();

      if (user === state.adminUser && pass === state.adminPass) {
        state.isAdminAuthenticated = true;
        showAdminSettingsView();
      } else {
        alert('Invalid Admin Credentials.');
      }
    });

    // Save Admin Settings Form Submit
    document.getElementById('admin-config-form').addEventListener('submit', (e) => {
      e.preventDefault();

      const newUrl = document.getElementById('cfg-webapp-url').value.trim();
      const newRepPasscode = document.getElementById('cfg-rep-passcode').value.trim();
      const newStudentPasscode = document.getElementById('cfg-student-passcode').value.trim();
      const newUser = document.getElementById('cfg-admin-user').value.trim();
      const newPass = document.getElementById('cfg-admin-pass').value.trim();

      if (newRepPasscode) {
        state.repPasscode = newRepPasscode;
        localStorage.setItem(STORAGE_KEYS.REP_PASSCODE, newRepPasscode);
      }

      if (newStudentPasscode) {
        state.studentPasscode = newStudentPasscode;
        localStorage.setItem(STORAGE_KEYS.STUDENT_PASSCODE, newStudentPasscode);
      }

      state.webAppUrl = newUrl;
      localStorage.setItem(STORAGE_KEYS.WEBAPP_URL, newUrl);

      if (newUser) {
        state.adminUser = newUser;
        localStorage.setItem(STORAGE_KEYS.ADMIN_USER, newUser);
      }

      if (newPass) {
        state.adminPass = newPass;
        localStorage.setItem(STORAGE_KEYS.ADMIN_PASS, newPass);
      }

      // Sync ALL credentials & settings to cloud so ALL devices receive updates automatically
      if (state.webAppUrl) {
        fetch(state.webAppUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'saveConfig',
            webAppUrl: state.webAppUrl,
            repPasscode: state.repPasscode,
            studentPasscode: state.studentPasscode,
            adminUser: state.adminUser,
            adminPass: state.adminPass
          })
        }).catch(err => console.warn('Cloud total config sync failed:', err));
      }

      alert('Admin Configuration & Credentials Saved Globally Across All Devices!');
      closeModal('admin-modal');
    });

    // Logout Admin Button
    document.getElementById('admin-logout-btn').addEventListener('click', () => {
      state.isAdminAuthenticated = false;
      showAdminLoginView();
      closeModal('admin-modal');
    });

    // Export CSV Button
    document.getElementById('export-csv-btn').addEventListener('click', exportLogsToCSV);

    // Clear All App Data Button
    document.getElementById('clear-all-data-btn').addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all local attendance records and saved QR data from this device?')) {
        clearAllAppData();
        closeModal('admin-modal');
      }
    });

    // Google Apps Script Helper Modal Toggle
    document.getElementById('view-gas-script-btn').addEventListener('click', () => {
      closeModal('admin-modal');
      openModal('gas-script-modal');
    });

    // Copy GAS Code Button
    document.getElementById('copy-gas-code-btn').addEventListener('click', () => {
      const code = document.getElementById('gas-code-text').textContent;
      navigator.clipboard.writeText(code).then(() => {
        alert('Google Apps Script code copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy text:', err);
      });
    });
  }

  function showAdminLoginView() {
    document.getElementById('admin-login-view').classList.remove('hidden');
    document.getElementById('admin-settings-view').classList.add('hidden');
    document.getElementById('admin-login-user').value = '';
    document.getElementById('admin-login-pass').value = '';
  }

  function showAdminSettingsView() {
    document.getElementById('admin-login-view').classList.add('hidden');
    document.getElementById('admin-settings-view').classList.remove('hidden');

    document.getElementById('cfg-webapp-url').value = state.webAppUrl;
    document.getElementById('cfg-rep-passcode').value = state.repPasscode;
    document.getElementById('cfg-student-passcode').value = state.studentPasscode;
    document.getElementById('cfg-admin-user').value = state.adminUser;
    document.getElementById('cfg-admin-pass').value = state.adminPass;
  }

  function exportLogsToCSV() {
    if (state.logs.length === 0) {
      alert('No attendance records available to export.');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Timestamp,Registration No,Student Name,Course,Section,Sync Status,Rep ID\n";

    state.logs.forEach(log => {
      const row = [
        `"${log.timestamp}"`,
        `"${log.regNo}"`,
        `"${log.name}"`,
        `"${log.course}"`,
        `"${log.section}"`,
        `"${log.status}"`,
        `"${log.repId || 'REP-01'}"`
      ].join(",");
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Attendance_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function clearAllAppData() {
    // Send global clear signal to cloud backend
    if (state.webAppUrl && navigator.onLine) {
      const nowTs = String(Date.now());
      localStorage.setItem('att_last_cleared_at', nowTs);
      
      fetch(state.webAppUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'clearLogs',
          timestamp: nowTs
        })
      }).catch(err => console.warn('Global logs clear sync failed:', err));
    }

    // Remove local storage items for student QR and attendance logs
    localStorage.removeItem(STORAGE_KEYS.SAVED_STUDENT);
    localStorage.removeItem(STORAGE_KEYS.ATTENDANCE_LOGS);

    // Reset internal state
    state.logs = [];
    state.pendingStudentData = null;

    // Reset student form UI
    const nameInput = document.getElementById('student-name');
    const regInput = document.getElementById('student-reg');
    if (nameInput) nameInput.value = '';
    if (regInput) regInput.value = '';

    // Hide generated ID card wrapper
    const idWrapper = document.getElementById('id-card-wrapper');
    if (idWrapper) idWrapper.classList.add('hidden');

    // Re-render empty log list
    renderScannedLogs();

    alert('All local and global attendance records have been cleared across all devices!');
  }

})();
