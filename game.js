// ==========================================
// Web-team adventure - 10-Second Reflex Game
// ==========================================

class WebTeamAdventure {
  constructor() {
    // DOM Elements
    this.scoreDisplay = document.getElementById('score-display');
    this.timeDisplay = document.getElementById('time-display');
    this.timerBar = document.getElementById('timer-progress');
    this.scene = document.getElementById('scene-container');
    this.tableWrap = document.getElementById('white-table-wrap');
    this.particlesContainer = document.getElementById('particles-container');

    this.dog = document.getElementById('dog-character');
    this.donkey = document.getElementById('donkey-character');
    this.donkeyBubble = document.getElementById('donkey-bubble');

    // Manager Character
    this.manager = document.getElementById('manager-character');
    this.managerQuestion = document.getElementById('manager-question');
    this.managerTimerBar = document.getElementById('manager-timer-bar');
    this.managerOptions = document.getElementById('manager-options');
    this.managerTimers = [];
    this.managerAnswered = false;
    this.managerQuestions = [
      "Quick sync on Jira?",
      "Is this ticket in the sprint?",
      "Can we circle back on deliverables?",
      "Got 5 minutes for a quick 1:1?",
      "What's the ETA on deployment?",
      "Who approved this dog on the desk?!",
      "Can we align on synergies?",
      "Let's take this offline!",
      "Is this blocking the release?",
      "Did you log your story points?",
      "Can you update the roadmap?"
    ];

    this.pawLeftZone = document.getElementById('left-paw-zone');
    this.pawRightZone = document.getElementById('right-paw-zone');
    this.pawLeft = document.getElementById('paw-left');
    this.pawRight = document.getElementById('paw-right');

    this.startOverlay = document.getElementById('start-overlay');
    this.gameoverOverlay = document.getElementById('gameover-overlay');
    this.startBtn = document.getElementById('start-btn');
    this.restartBtn = document.getElementById('restart-btn');

    this.finalScore = document.getElementById('final-score');
    this.finalTps = document.getElementById('final-tps');
    this.finalRecord = document.getElementById('final-record');
    this.resultBadge = document.getElementById('result-badge');
    this.resultComment = document.getElementById('result-comment');

    // Game State
    this.gameDuration = 60.0;
    this.timeLeft = this.gameDuration;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('webteam_adventure_highscore') || '0', 10);
    this.isPlaying = false;
    this.donkeyTriggered = false;

    // Rocket League Arena Elements & Physics
    this.whiteTable = document.getElementById('white-table');
    this.rocketCarEl = document.getElementById('rocket-car');
    this.rocketBallEl = document.getElementById('rocket-ball');
    this.goalBanner = document.getElementById('goal-banner');

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      boost: false
    };

    this.car = {
      x: 240,
      y: 170,
      angle: -Math.PI / 2,
      speed: 0,
      radius: 18
    };

    this.ball = {
      x: 240,
      y: 110,
      vx: 0,
      vy: 0,
      radius: 14
    };

    this.isGoalResetting = false;

    // Paws tracking
    this.paws = {
      left: {
        el: this.pawLeft,
        zone: this.pawLeftZone,
        state: 'idle',
        autoRetreatTimer: null,
        side: 'left'
      },
      right: {
        el: this.pawRight,
        zone: this.pawRightZone,
        state: 'idle',
        autoRetreatTimer: null,
        side: 'right'
      }
    };

    this.timerRafId = null;
    this.lastTimestamp = null;
    this.spawnerTimeout = null;
    this.dogCaughtTimeout = null;
    this.circumference = 2 * Math.PI * 44;

    // Multiplayer State
    this.playerCountBadge = document.getElementById('player-count');
    this.isMultiplayer = false;
    this.ws = null;

    this.initAudio();
    this.bindEvents();
    this.connectWebSocket();
  }

  initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = AudioContext ? new AudioContext() : null;
  }

  playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.25) {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  playHitSound() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;

      // Punchy pop
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(400, now);
      osc1.frequency.exponentialRampToValueAtTime(1000, now + 0.08);

      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Cartoon boing
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(220, now + 0.02);
      osc2.frequency.exponentialRampToValueAtTime(660, now + 0.14);

      gain2.gain.setValueAtTime(0.25, now + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.02);
      osc2.stop(now + 0.22);
    } catch (e) {}
  }

  playSneakSound() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.linearRampToValueAtTime(380, now + 0.09);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.09);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  // Goofy donkey braying laugh sound ("HEE-HAW! HEE-HAW! HA-HA-HA!")
  playDonkeyLaughSound() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;

      const brays = [
        { start: 0.0, freqStart: 580, freqEnd: 740, dur: 0.18, type: 'sawtooth', vol: 0.25 },
        { start: 0.18, freqStart: 380, freqEnd: 240, dur: 0.28, type: 'sawtooth', vol: 0.35 },
        { start: 0.50, freqStart: 620, freqEnd: 780, dur: 0.18, type: 'sawtooth', vol: 0.25 },
        { start: 0.68, freqStart: 400, freqEnd: 220, dur: 0.32, type: 'sawtooth', vol: 0.38 },
        { start: 1.05, freqStart: 520, freqEnd: 480, dur: 0.1, type: 'triangle', vol: 0.2 },
        { start: 1.18, freqStart: 520, freqEnd: 460, dur: 0.1, type: 'triangle', vol: 0.2 },
        { start: 1.30, freqStart: 480, freqEnd: 380, dur: 0.14, type: 'triangle', vol: 0.2 }
      ];

      brays.forEach(b => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = b.type;
        osc.frequency.setValueAtTime(b.freqStart, now + b.start);
        osc.frequency.exponentialRampToValueAtTime(b.freqEnd, now + b.start + b.dur);

        gain.gain.setValueAtTime(b.vol, now + b.start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + b.start + b.dur);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now + b.start);
        osc.stop(now + b.start + b.dur);
      });
    } catch (e) {}
  }

  // Manager office chime ding-dong
  playManagerChime() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;
      [659.25, 880].forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.18, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.3);
      });
    } catch (e) {}
  }

  playWrongBuzz() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(105, now + 0.22);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  playGoalHorn() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;
      // Stadium air horn chord
      [293.66, 369.99, 440.0, 587.33].forEach(freq => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
      });
    } catch (e) {}
  }

  playBallHitSound() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.08);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {}
  }

  playFanfare() {
    if (!this.audioCtx) return;
    const notes = [440, 554, 659, 880];
    notes.forEach((note, idx) => {
      setTimeout(() => {
        this.playTone(note, 'triangle', 0.22, 0.28);
      }, idx * 110);
    });
  }

  sendInputState() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'car_input', data: this.keys }));
    }
  }

  connectWebSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isMultiplayer = true;
        this.sendInputState();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'state') {
            this.applyServerState(msg);
          } else if (msg.type === 'event') {
            this.applyServerEvent(msg);
          } else if (msg.type === 'players_update') {
            this.updatePlayerCount(msg.count);
          }
        } catch (err) {}
      };

      this.ws.onclose = () => {
        this.isMultiplayer = false;
        this.updatePlayerCount(1);
        setTimeout(() => this.connectWebSocket(), 2000);
      };

      this.ws.onerror = () => {
        if (this.ws) this.ws.close();
      };
    } catch (e) {
      setTimeout(() => this.connectWebSocket(), 3000);
    }
  }

  updatePlayerCount(count) {
    if (this.playerCountBadge) {
      const c = Math.max(1, count || 1);
      this.playerCountBadge.textContent = `${c} PLAYER${c > 1 ? 'S' : ''} ONLINE`;
    }
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => this.startGame());
    this.restartBtn.addEventListener('click', () => this.startGame());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.isPlaying) {
        e.preventDefault();
        this.startGame();
        return;
      }

      if (this.isPlaying) {
        let changed = false;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') {
          this.keys.forward = true;
          changed = true;
          e.preventDefault();
        } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
          this.keys.backward = true;
          changed = true;
          e.preventDefault();
        } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
          this.keys.left = true;
          changed = true;
          e.preventDefault();
        } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
          this.keys.right = true;
          changed = true;
          e.preventDefault();
        } else if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          this.keys.boost = true;
          changed = true;
          e.preventDefault();
        }
        if (changed) this.sendInputState();
      }
    });

    window.addEventListener('keyup', (e) => {
      let changed = false;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.keys.forward = false;
        changed = true;
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.keys.backward = false;
        changed = true;
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        this.keys.left = false;
        changed = true;
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.keys.right = false;
        changed = true;
      } else if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.keys.boost = false;
        changed = true;
      }
      if (changed) this.sendInputState();
    });

    // Touch Controls for Mobile / Tablets
    const touchMap = [
      { id: 'btn-touch-left', key: 'left' },
      { id: 'btn-touch-right', key: 'right' },
      { id: 'btn-touch-forward', key: 'forward' },
      { id: 'btn-touch-backward', key: 'backward' },
      { id: 'btn-touch-boost', key: 'boost' }
    ];

    touchMap.forEach(item => {
      const btn = document.getElementById(item.id);
      if (!btn) return;

      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('pressed');
        this.keys[item.key] = true;
        this.sendInputState();
      };

      const release = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('pressed');
        this.keys[item.key] = false;
        this.sendInputState();
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });

    ['left', 'right'].forEach(side => {
      const pawData = this.paws[side];

      const tapHandler = (e) => {
        if (!this.isPlaying) return;
        e.preventDefault();
        e.stopPropagation();
        this.handlePawTap(side, e);
      };

      pawData.el.addEventListener('pointerdown', tapHandler);
      pawData.zone.addEventListener('pointerdown', tapHandler);
    });
  }

  applyServerState(state) {
    this.updatePlayerCount(state.players_count);
    this.score = state.score;
    this.scoreDisplay.textContent = this.score;

    this.timeLeft = state.time_left;
    this.gameDuration = state.game_duration;
    this.timeDisplay.textContent = this.timeLeft.toFixed(1);

    const progress = (this.timeLeft / this.gameDuration);
    const offset = this.circumference * (1 - progress);
    this.timerBar.style.strokeDashoffset = offset;

    if (this.timeLeft <= 5.0 && !this.timerBar.classList.contains('urgent')) {
      this.timerBar.classList.add('urgent');
    } else if (this.timeLeft > 5.0 && this.timerBar.classList.contains('urgent')) {
      this.timerBar.classList.remove('urgent');
    }

    // Sync Game Status
    if (state.is_playing) {
      this.isPlaying = true;
      this.startOverlay.classList.remove('active');
      this.gameoverOverlay.classList.remove('active');
    } else if (!state.is_playing && this.isPlaying) {
      this.isPlaying = false;
    }

    // Sync Car
    this.car.x = state.car.x;
    this.car.y = state.car.y;
    this.car.angle = state.car.angle;
    this.renderCarAndBall(state.car.driving, state.car.boosting);

    // Sync Ball
    this.ball.x = state.ball.x;
    this.ball.y = state.ball.y;
    if (this.rocketBallEl) {
      this.rocketBallEl.style.left = `${this.ball.x}px`;
      this.rocketBallEl.style.top = `${this.ball.y}px`;
    }

    // Sync Paws
    ['left', 'right'].forEach(side => {
      const paw = this.paws[side];
      const pState = state.paws[side];
      paw.state = pState;
      if (pState === 'sneaking') {
        paw.el.classList.add('sneaking');
        paw.el.classList.remove('tapped');
      } else if (pState === 'tapped') {
        paw.el.classList.remove('sneaking');
        paw.el.classList.add('tapped');
      } else {
        paw.el.classList.remove('sneaking', 'tapped');
      }
    });

    // Sync Manager Quiz
    const m = state.manager;
    if (m) {
      if (m.status === 'question') {
        if (this.managerQuestion.textContent !== m.question) {
          this.managerQuestion.textContent = m.question;
          this.renderManagerOptions(m.options);
        }
        if (this.managerTimerBar) {
          const pct = Math.max(0, Math.min(100, (m.time_remaining / 2.0) * 100));
          this.managerTimerBar.style.transition = 'none';
          this.managerTimerBar.style.width = pct + '%';
        }
      } else if (m.status === 'approved') {
        this.managerQuestion.textContent = "APPROVED! 5 do 1!";
        if (this.managerOptions) this.managerOptions.innerHTML = '';
        if (this.managerTimerBar) this.managerTimerBar.style.width = '100%';
      } else if (m.status === 'wrong') {
        this.managerQuestion.textContent = "WRONG! (Always 5 do 1!)";
        if (this.managerOptions) this.managerOptions.innerHTML = '';
        if (this.managerTimerBar) this.managerTimerBar.style.width = '0%';
      } else if (m.status === 'expired') {
        this.managerQuestion.textContent = "Too slow! Options expired.";
        if (this.managerOptions) this.managerOptions.innerHTML = '';
        if (this.managerTimerBar) this.managerTimerBar.style.width = '0%';
      }
    }

    // Sync Donkey
    if (state.donkey && state.donkey.laughing) {
      this.donkey.classList.remove('hidden');
      this.donkey.classList.add('appearing', 'laughing');
      this.donkeyBubble.textContent = state.donkey.text;
    } else {
      this.donkey.classList.add('hidden');
      this.donkey.classList.remove('appearing', 'laughing');
    }
  }

  applyServerEvent(evt) {
    if (evt.name === 'goal') {
      this.playGoalHorn();
      if (this.goalBanner) {
        this.goalBanner.classList.remove('active');
        void this.goalBanner.offsetWidth;
        this.goalBanner.classList.add('active');
        setTimeout(() => {
          if (this.goalBanner) this.goalBanner.classList.remove('active');
        }, 1100);
      }
      const sc = this.tableToSceneCoords(evt.x, evt.y);
      this.spawnHitShockwave(sc.x, sc.y);
      this.spawnComicSparks(sc.x, sc.y);
    } else if (evt.name === 'car_ball_hit') {
      this.playBallHitSound();
      const sc = this.tableToSceneCoords(evt.x, evt.y);
      this.spawnComicSparks(sc.x, sc.y);
    } else if (evt.name === 'ball_hit') {
      this.playBallHitSound();
    } else if (evt.name === 'paw_hit') {
      this.playHitSound();
      const sc = this.tableToSceneCoords(evt.x, evt.y);
      this.spawnHitShockwave(sc.x, sc.y);
      this.spawnComicSparks(sc.x, sc.y);
      this.spawnTapParticle(sc.x, sc.y);
      this.triggerTableShake();
      this.showDogCaught();
    } else if (evt.name === 'paw_sneak') {
      this.playSneakSound();
      this.dog.classList.remove('sneaking-left', 'sneaking-right');
      this.dog.classList.add(evt.side === 'left' ? 'sneaking-left' : 'sneaking-right');
    } else if (evt.name === 'paw_retreat') {
      this.resetDogExpression();
    } else if (evt.name === 'manager_correct') {
      this.playTone(880, 'triangle', 0.25, 0.3);
    } else if (evt.name === 'manager_wrong') {
      this.playWrongBuzz();
    } else if (evt.name === 'donkey_laugh') {
      this.playDonkeyLaughSound();
    } else if (evt.name === 'game_over') {
      this.endGame(evt.score, evt.high_score);
    }
  }

  renderManagerOptions(options) {
    if (!this.managerOptions) return;
    this.managerOptions.innerHTML = '';
    options.forEach(optText => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'manager-opt-btn';
      btn.textContent = optText;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleManagerAnswer(optText, btn);
      });
      this.managerOptions.appendChild(btn);
    });
  }

  startGame() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (this.isMultiplayer && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'start_game' }));
      return;
    }

    // Reset scores & state
    this.score = 0;
    this.timeLeft = this.gameDuration;
    this.isPlaying = true;
    this.donkeyTriggered = false;

    // Reset Rocket League Car & Ball
    const tw = this.whiteTable ? this.whiteTable.clientWidth : 480;
    const th = this.whiteTable ? this.whiteTable.clientHeight : 220;
    this.car.x = tw / 2;
    this.car.y = th - 40;
    this.car.angle = -Math.PI / 2;
    this.car.speed = 0;
    this.ball.x = tw / 2;
    this.ball.y = th / 2 + 15;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.isGoalResetting = false;
    if (this.goalBanner) this.goalBanner.classList.remove('active');
    this.renderCarAndBall();

    this.scoreDisplay.textContent = '0';
    this.scoreDisplay.classList.remove('bump');
    this.timeDisplay.textContent = this.timeLeft.toFixed(1);

    // Reset timer visuals
    this.timerBar.classList.remove('urgent');
    this.timerBar.style.strokeDashoffset = '0';

    // Remove overlays
    this.startOverlay.classList.remove('active');
    this.gameoverOverlay.classList.remove('active');

    // HIDE DONKEY: Donkey stays hidden behind the chair until the final second!
    this.donkey.classList.remove('appearing', 'laughing');
    this.donkey.classList.add('hidden');

    // Reset dog expressions & paws
    this.resetDogExpression();
    this.resetPaw('left');
    this.resetPaw('right');

    // Hide & schedule manager
    this.clearManagerTimers();
    this.startManagerQuestionLoop();

    this.playTone(523.25, 'triangle', 0.2, 0.25);

    // Start timer loop
    this.lastTimestamp = performance.now();
    this.timerRafId = requestAnimationFrame((ts) => this.gameLoop(ts));

    // Schedule first paw sneak after 300ms
    this.scheduleNextSneak(300);
  }

  // Continuous Manager Question Loop (Manager & Popup Always Visible)
  startManagerQuestionLoop() {
    this.clearManagerTimers();
    const t = setTimeout(() => {
      if (this.isPlaying) this.promptNextManagerQuestion();
    }, 800);
    this.managerTimers.push(t);
  }

  promptNextManagerQuestion() {
    if (!this.isPlaying || !this.manager) return;

    this.managerAnswered = false;
    const q = this.managerQuestions[Math.floor(Math.random() * this.managerQuestions.length)];
    this.managerQuestion.textContent = q;

    // 4 Options: Always exactly one "5 do 1" and 3 funny dummy answers
    const dummyPool = [
      "ASAP", "In Jira", "Tomorrow", "Sprint 42",
      "Ask QA", "Blocked", "LGTM", "Offline", "Need 1:1", "Roadmap", "P0 Bug"
    ];
    const pickedDummies = [...dummyPool].sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [...pickedDummies, "5 do 1"].sort(() => Math.random() - 0.5);

    // Render options
    this.renderManagerOptions(options);

    // Reset timer bar to 100%
    if (this.managerTimerBar) {
      this.managerTimerBar.style.transition = 'none';
      this.managerTimerBar.style.width = '100%';
    }

    this.playManagerChime();

    // 2-Second visual countdown bar
    setTimeout(() => {
      if (this.managerTimerBar && !this.managerAnswered) {
        this.managerTimerBar.style.transition = 'width 2.0s linear';
        this.managerTimerBar.style.width = '0%';
      }
    }, 20);

    // 2-SECOND LIMIT: Options disappear if not answered in 2 seconds!
    const timeoutTimer = setTimeout(() => {
      if (!this.managerAnswered && this.isPlaying) {
        this.managerQuestion.textContent = "Too slow! Options expired.";
        if (this.managerOptions) this.managerOptions.innerHTML = '';

        // Cooldown before next question
        const nextQTimer = setTimeout(() => {
          if (this.isPlaying) this.promptNextManagerQuestion();
        }, 1400);
        this.managerTimers.push(nextQTimer);
      }
    }, 2000);

    this.managerTimers.push(timeoutTimer);
  }

  handleManagerAnswer(selectedOption, buttonEl) {
    if (this.isMultiplayer && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'manager_answer', option: selectedOption }));
    }
    if (this.managerAnswered || !this.isPlaying) return;
    this.managerAnswered = true;

    // Freeze timer bar
    if (this.managerTimerBar) {
      this.managerTimerBar.style.transition = 'none';
    }

    // ONLY "5 do 1" is correct!
    const isCorrect = (selectedOption === "5 do 1");

    if (isCorrect) {
      buttonEl.classList.add('correct');

      // Award bonus point!
      this.score++;
      this.scoreDisplay.textContent = this.score;
      this.scoreDisplay.classList.add('bump');
      setTimeout(() => this.scoreDisplay.classList.remove('bump'), 150);

      this.playTone(880, 'triangle', 0.25, 0.3);
      this.managerQuestion.textContent = "APPROVED! 5 do 1!";

      const rect = buttonEl.getBoundingClientRect();
      const sceneRect = this.scene.getBoundingClientRect();
      this.spawnTapParticle(rect.left + rect.width / 2 - sceneRect.left, rect.top - sceneRect.top);

      // Ask next question after brief celebration
      const nextTimer = setTimeout(() => {
        if (this.managerOptions) this.managerOptions.innerHTML = '';
        if (this.isPlaying) this.promptNextManagerQuestion();
      }, 1400);
      this.managerTimers.push(nextTimer);
    } else {
      buttonEl.classList.add('wrong');
      this.playWrongBuzz();
      this.managerQuestion.textContent = "WRONG! (Always 5 do 1!)";

      // Ask next question after penalty
      const nextTimer = setTimeout(() => {
        if (this.managerOptions) this.managerOptions.innerHTML = '';
        if (this.isPlaying) this.promptNextManagerQuestion();
      }, 1500);
      this.managerTimers.push(nextTimer);
    }
  }

  clearManagerTimers() {
    this.managerTimers.forEach(t => clearTimeout(t));
    this.managerTimers = [];
  }

  gameLoop(currentTimestamp) {
    if (!this.isPlaying) return;

    if (!this.isMultiplayer) {
      const delta = (currentTimestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = currentTimestamp;

      this.timeLeft = Math.max(0, this.timeLeft - delta);
      this.timeDisplay.textContent = this.timeLeft.toFixed(1);

      const progress = (this.timeLeft / this.gameDuration);
      const offset = this.circumference * (1 - progress);
      this.timerBar.style.strokeDashoffset = offset;

      // Urgent mode for last 5 seconds
      if (this.timeLeft <= 5.0 && !this.timerBar.classList.contains('urgent')) {
        this.timerBar.classList.add('urgent');
      }

      // Rocket League arena car & ball physics simulation
      this.updateRocketLeaguePhysics(delta);

      // DONKEY SURPRISE: Appears in the LAST SECOND (timeLeft <= 1.0) laughing at the score!
      if (this.timeLeft <= 1.0 && !this.donkeyTriggered) {
        this.triggerDonkeyLaugh();
      }

      if (this.timeLeft <= 0) {
        this.endGame();
        return;
      }
    }

    this.timerRafId = requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  // Rocket League Physics Loop on Desk
  updateRocketLeaguePhysics(delta) {
    const tw = this.whiteTable ? this.whiteTable.clientWidth : 480;
    const th = this.whiteTable ? this.whiteTable.clientHeight : 220;

    // 1. Car Steering & Acceleration
    const turnSpeed = 4.2; // rad/sec
    if (this.keys.left) {
      this.car.angle -= turnSpeed * delta;
    }
    if (this.keys.right) {
      this.car.angle += turnSpeed * delta;
    }

    if (this.keys.forward) {
      const acc = this.keys.boost ? 720 : 440;
      const maxSpd = this.keys.boost ? 350 : 225;
      this.car.speed = Math.min(maxSpd, this.car.speed + acc * delta);
    } else if (this.keys.backward) {
      this.car.speed = Math.max(-125, this.car.speed - 360 * delta);
    } else {
      // Natural rolling friction
      this.car.speed *= Math.pow(0.12, delta);
      if (Math.abs(this.car.speed) < 2) this.car.speed = 0;
    }

    // Move Car
    this.car.x += Math.cos(this.car.angle) * this.car.speed * delta;
    this.car.y += Math.sin(this.car.angle) * this.car.speed * delta;

    // Clamp Car inside Table
    const carMarginX = 22;
    const carMarginY = 18;
    this.car.x = Math.max(carMarginX, Math.min(tw - carMarginX, this.car.x));
    this.car.y = Math.max(carMarginY, Math.min(th - carMarginY, this.car.y));

    // 2. Ball Motion & Damping
    this.ball.x += this.ball.vx * delta;
    this.ball.y += this.ball.vy * delta;

    const ballDamp = Math.pow(0.35, delta);
    this.ball.vx *= ballDamp;
    this.ball.vy *= ballDamp;
    if (Math.hypot(this.ball.vx, this.ball.vy) < 2) {
      this.ball.vx = 0;
      this.ball.vy = 0;
    }

    // 3. Goal Collision Check (Goal Mouth: width ~120px at top center)
    const goalLeft = tw / 2 - 60;
    const goalRight = tw / 2 + 60;
    const goalTop = 22;

    if (!this.isGoalResetting && this.ball.y - this.ball.radius <= goalTop &&
        this.ball.x >= goalLeft && this.ball.x <= goalRight) {
      this.triggerGoalScored(tw, th);
    }

    // 4. Ball Wall Bounces
    // Left & Right
    if (this.ball.x - this.ball.radius < 6) {
      this.ball.x = 6 + this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx) * 0.85;
      this.playBallHitSound();
    } else if (this.ball.x + this.ball.radius > tw - 6) {
      this.ball.x = tw - 6 - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.85;
      this.playBallHitSound();
    }

    // Bottom
    if (this.ball.y + this.ball.radius > th - 8) {
      this.ball.y = th - 8 - this.ball.radius;
      this.ball.vy = -Math.abs(this.ball.vy) * 0.85;
      this.playBallHitSound();
    }

    // Top (Outside the goal opening)
    if (this.ball.y - this.ball.radius < 8) {
      const inGoalMouth = (this.ball.x >= goalLeft && this.ball.x <= goalRight);
      if (!inGoalMouth) {
        this.ball.y = 8 + this.ball.radius;
        this.ball.vy = Math.abs(this.ball.vy) * 0.85;
        this.playBallHitSound();
      }
    }

    // 5. Car - Ball Collision
    const cdx = this.ball.x - this.car.x;
    const cdy = this.ball.y - this.car.y;
    const cdist = Math.hypot(cdx, cdy);
    const minHitDist = this.car.radius + this.ball.radius;

    if (cdist < minHitDist && cdist > 0.001) {
      // Normal direction
      const nx = cdx / cdist;
      const ny = cdy / cdist;

      // Push ball outside car
      const overlap = minHitDist - cdist;
      this.ball.x += nx * overlap;
      this.ball.y += ny * overlap;

      // Impart velocity
      const carVx = Math.cos(this.car.angle) * this.car.speed;
      const carVy = Math.sin(this.car.angle) * this.car.speed;
      const kickPower = Math.max(160, Math.hypot(carVx, carVy) * 1.45 + (this.keys.boost ? 140 : 0));

      this.ball.vx = nx * kickPower + carVx * 0.4;
      this.ball.vy = ny * kickPower + carVy * 0.4;

      this.car.speed *= 0.55;
      this.playBallHitSound();

      // Sparks in scene coordinates
      const sc = this.tableToSceneCoords(this.ball.x, this.ball.y);
      this.spawnComicSparks(sc.x, sc.y);
    }

    // 6. Car or Ball ramming sneaking rear paws!
    ['left', 'right'].forEach(side => {
      const paw = this.paws[side];
      if (paw.state === 'sneaking') {
        const pawX = side === 'left' ? 40 : tw - 40;
        const pawY = th / 2;

        const carDist = Math.hypot(this.car.x - pawX, this.car.y - pawY);
        const ballDist = Math.hypot(this.ball.x - pawX, this.ball.y - pawY);

        if (carDist < 48 || ballDist < 38) {
          const sc = this.tableToSceneCoords(pawX, pawY);
          const sceneRect = this.scene ? this.scene.getBoundingClientRect() : { left: 0, top: 0 };
          this.handlePawTap(side, { clientX: sc.x + sceneRect.left, clientY: sc.y + sceneRect.top });
          if (ballDist < 38) {
            this.ball.vx *= -0.8;
            this.ball.vy *= -0.8;
          }
        }
      }
    });

    // 7. Render Car and Ball
    this.renderCarAndBall();
  }

  tableToSceneCoords(tableX, tableY) {
    if (!this.whiteTable || !this.scene) return { x: tableX, y: tableY };
    const tRect = this.whiteTable.getBoundingClientRect();
    const sRect = this.scene.getBoundingClientRect();
    return {
      x: tableX + (tRect.left - sRect.left),
      y: tableY + (tRect.top - sRect.top)
    };
  }

  renderCarAndBall(forceDriving = null, forceBoosting = null) {
    if (this.rocketCarEl) {
      const deg = (this.car.angle * 180 / Math.PI);
      this.rocketCarEl.style.left = `${this.car.x}px`;
      this.rocketCarEl.style.top = `${this.car.y}px`;
      this.rocketCarEl.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;

      const isDriving = forceDriving !== null ? forceDriving : Math.abs(this.car.speed) > 15;
      const isBoosting = forceBoosting !== null ? forceBoosting : (this.keys.boost && (this.keys.forward || this.car.speed > 50));
      this.rocketCarEl.classList.toggle('driving', isDriving);
      this.rocketCarEl.classList.toggle('boosting', isBoosting);
    }

    if (this.rocketBallEl) {
      this.rocketBallEl.style.left = `${this.ball.x}px`;
      this.rocketBallEl.style.top = `${this.ball.y}px`;
    }
  }

  triggerGoalScored(tw, th) {
    this.isGoalResetting = true;
    this.score += 3;
    this.scoreDisplay.textContent = this.score;
    this.scoreDisplay.classList.add('bump');
    setTimeout(() => this.scoreDisplay.classList.remove('bump'), 150);

    this.playGoalHorn();

    if (this.goalBanner) {
      this.goalBanner.classList.remove('active');
      void this.goalBanner.offsetWidth;
      this.goalBanner.classList.add('active');
    }

    const sc = this.tableToSceneCoords(tw / 2, 24);
    this.spawnHitShockwave(sc.x, sc.y);
    this.spawnComicSparks(sc.x, sc.y);

    // Reset ball to kickoff position after celebration delay
    setTimeout(() => {
      this.ball.x = tw / 2;
      this.ball.y = th / 2 + 15;
      this.ball.vx = 0;
      this.ball.vy = 0;
      if (this.goalBanner) this.goalBanner.classList.remove('active');
      this.isGoalResetting = false;
    }, 1100);
  }

  // Trigger donkey popping up in the final second and laughing mockingly
  triggerDonkeyLaugh() {
    this.donkeyTriggered = true;

    // Reveal and start laughing
    this.donkey.classList.remove('hidden');
    this.donkey.classList.add('appearing', 'laughing');

    let mockText = 'HEE-HAW! ONLY ' + this.score + ' POINTS?!';
    if (this.score === 0) {
      mockText = 'HEE-HAW! ZERO POINTS?! HA-HA-HA!';
    } else if (this.score <= 10) {
      mockText = 'HEE-HAW! ONLY ' + this.score + '?! SO WEAK!';
    } else if (this.score <= 25) {
      mockText = 'HEE-HAW! JUST ' + this.score + '?! TOO SLOW!';
    } else if (this.score <= 45) {
      mockText = 'HEE-HAW! ' + this.score + ' POINTS?! IS THAT ALL?!';
    } else {
      mockText = 'HEE-HAW! ' + this.score + '?! I CAN BEAT THAT!';
    }

    this.donkeyBubble.textContent = mockText;
    this.playDonkeyLaughSound();
  }

  scheduleNextSneak(delay = null) {
    if (!this.isPlaying) return;
    if (this.spawnerTimeout) clearTimeout(this.spawnerTimeout);

    let waitTime = delay;
    if (waitTime === null) {
      const timeFactor = (this.gameDuration - this.timeLeft) / this.gameDuration;
      const minInterval = 320;
      const maxInterval = 750 - (timeFactor * 350);
      waitTime = Math.random() * (maxInterval - minInterval) + minInterval;
    }

    this.spawnerTimeout = setTimeout(() => {
      this.triggerPawSneak();
      this.scheduleNextSneak();
    }, waitTime);
  }

  triggerPawSneak() {
    if (!this.isPlaying) return;

    const availablePaws = [];
    if (this.paws.left.state === 'idle') availablePaws.push('left');
    if (this.paws.right.state === 'idle') availablePaws.push('right');

    if (availablePaws.length === 0) return;

    if (this.timeLeft < 4.5 && availablePaws.length === 2 && Math.random() < 0.35) {
      this.sneakPaw('left');
      setTimeout(() => {
        if (this.isPlaying) this.sneakPaw('right');
      }, 150);
      return;
    }

    const chosenSide = availablePaws[Math.floor(Math.random() * availablePaws.length)];
    this.sneakPaw(chosenSide);
  }

  sneakPaw(side) {
    const paw = this.paws[side];
    if (paw.state !== 'idle' || !this.isPlaying) return;

    paw.state = 'sneaking';
    paw.el.classList.remove('tapped');
    paw.el.classList.add('sneaking');

    // Dog glances towards sneaking paw
    const dirClass = side === 'left' ? 'sneaking-left' : 'sneaking-right';
    this.dog.classList.remove('sneaking-left', 'sneaking-right');
    this.dog.classList.add(dirClass);

    this.playSneakSound();

    const timeFactor = (this.gameDuration - this.timeLeft) / this.gameDuration;
    const windowDuration = Math.max(650, 1200 - (timeFactor * 500));

    if (paw.autoRetreatTimer) clearTimeout(paw.autoRetreatTimer);
    paw.autoRetreatTimer = setTimeout(() => {
      if (paw.state === 'sneaking' && this.isPlaying) {
        this.retreatPaw(side);
      }
    }, windowDuration);
  }

  retreatPaw(side) {
    const paw = this.paws[side];
    if (paw.state !== 'sneaking') return;

    paw.el.classList.remove('sneaking');
    paw.state = 'idle';
    this.resetDogExpression();
  }

  handlePawTap(side, event) {
    if (this.isMultiplayer && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'paw_tap', side: side }));
    }
    if (!this.isPlaying) return;

    const paw = this.paws[side];

    if (paw.state === 'sneaking') {
      paw.state = 'tapped';

      if (paw.autoRetreatTimer) clearTimeout(paw.autoRetreatTimer);

      // 1. INCREMENT SCORE IMMEDIATELY
      this.score++;
      this.scoreDisplay.textContent = this.score;
      this.scoreDisplay.classList.add('bump');
      setTimeout(() => this.scoreDisplay.classList.remove('bump'), 150);

      // 2. PLAY HIT SOUND
      this.playHitSound();

      // 3. GET TAP COORDINATES FOR IMPACT VISUALS
      let clientX = event.clientX;
      let clientY = event.clientY;

      if (!clientX || !clientY) {
        const rect = paw.el.getBoundingClientRect();
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
      }

      const sceneRect = this.scene.getBoundingClientRect();
      const x = clientX - sceneRect.left;
      const y = clientY - sceneRect.top;

      // Spawn impact visuals
      this.spawnHitShockwave(x, y);
      this.spawnComicSparks(x, y);
      this.spawnTapParticle(x, y);

      // Table rumble
      this.triggerTableShake();

      // 4. ANIMATE PAW SQUASH & RETREAT
      paw.el.classList.remove('sneaking');
      paw.el.classList.add('tapped');

      // 5. DOG CAUGHT REACTION
      this.showDogCaught();

      // Reset paw to idle
      setTimeout(() => {
        this.resetPaw(side);
      }, 380);
    }
  }

  triggerTableShake() {
    if (!this.tableWrap) return;
    this.tableWrap.classList.remove('shake');
    void this.tableWrap.offsetWidth;
    this.tableWrap.classList.add('shake');
    setTimeout(() => {
      this.tableWrap.classList.remove('shake');
    }, 200);
  }

  spawnHitShockwave(x, y) {
    const ring = document.createElement('div');
    ring.className = 'hit-shockwave';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    this.particlesContainer.appendChild(ring);

    setTimeout(() => {
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }, 400);
  }

  spawnComicSparks(x, y) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('div');
      spark.className = 'comic-spark-star';

      const angle = (i / count) * 2 * Math.PI + (Math.random() * 0.4 - 0.2);
      const dist = Math.floor(Math.random() * 35 + 40);
      const dx = `${Math.cos(angle) * dist}px`;
      const dy = `${Math.sin(angle) * dist}px`;
      const rot = `${Math.random() * 140 - 70}deg`;

      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      spark.style.setProperty('--dx', dx);
      spark.style.setProperty('--dy', dy);
      spark.style.setProperty('--rot', rot);

      this.particlesContainer.appendChild(spark);

      setTimeout(() => {
        if (spark.parentNode) spark.parentNode.removeChild(spark);
      }, 480);
    }
  }

  spawnTapParticle(x, y) {
    const pop = document.createElement('div');
    pop.className = 'tap-pop';

    const words = ['+1', 'BOP!', 'WHACK!', 'HIT!', '+1'];
    const text = words[Math.floor(Math.random() * words.length)];
    pop.textContent = text;

    pop.style.left = `${x}px`;
    pop.style.top = `${y - 10}px`;

    this.particlesContainer.appendChild(pop);

    setTimeout(() => {
      if (pop.parentNode) pop.parentNode.removeChild(pop);
    }, 700);
  }

  showDogCaught() {
    this.dog.classList.remove('neutral', 'sneaking-left', 'sneaking-right');
    this.dog.classList.add('caught');

    if (this.dogCaughtTimeout) clearTimeout(this.dogCaughtTimeout);
    this.dogCaughtTimeout = setTimeout(() => {
      this.resetDogExpression();
    }, 400);
  }

  resetDogExpression() {
    this.dog.classList.remove('caught', 'sneaking-left', 'sneaking-right');
    this.dog.classList.add('neutral');
  }

  resetPaw(side) {
    const paw = this.paws[side];
    if (paw.autoRetreatTimer) clearTimeout(paw.autoRetreatTimer);
    paw.el.classList.remove('sneaking', 'tapped');
    paw.state = 'idle';
  }

  endGame() {
    this.isPlaying = false;
    if (this.timerRafId) cancelAnimationFrame(this.timerRafId);
    if (this.spawnerTimeout) clearTimeout(this.spawnerTimeout);

    this.resetPaw('left');
    this.resetPaw('right');
    this.resetDogExpression();

    // Clear manager timers & options
    this.clearManagerTimers();
    if (this.managerQuestion) {
      this.managerQuestion.textContent = "Time's up! Let's circle back.";
    }
    if (this.managerOptions) {
      this.managerOptions.innerHTML = '';
    }

    // Ensure donkey is visible and laughing at the final score if it wasn't triggered yet
    if (!this.donkeyTriggered) {
      this.triggerDonkeyLaugh();
    }

    let isNewHigh = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('webteam_adventure_highscore', this.highScore);
      isNewHigh = true;
    }

    const tps = (this.score / this.gameDuration).toFixed(1);

    let badge = 'Web-Team Member';
    let comment = 'The donkey cannot stop laughing at your score!';

    if (this.score >= 50) {
      badge = 'Web-Team Legend!';
      comment = 'Ultra-fast hands! Even the laughing donkey is speechless!';
    } else if (this.score >= 35) {
      badge = 'Desk Master Guardian!';
      comment = 'Incredible reflexes! The donkey will have to try harder to laugh!';
    } else if (this.score >= 20) {
      badge = 'Speed Champion!';
      comment = 'Good job! But the donkey still thinks you were too slow!';
    } else if (this.score >= 10) {
      badge = 'Quick Reflexes!';
      comment = 'The donkey is laughing hard at that score!';
    } else {
      badge = 'Playful Partner!';
      comment = 'The donkey is rolling on the floor laughing at that score!';
    }

    if (isNewHigh && this.score > 0) {
      badge += ' - NEW RECORD!';
    }

    this.finalScore.textContent = this.score;
    this.finalTps.textContent = tps;
    this.finalRecord.textContent = this.highScore;
    this.resultBadge.textContent = badge;
    this.resultComment.textContent = comment;

    // Show Game Over overlay after 650ms so player gets to see the donkey's full popup and laughter!
    setTimeout(() => {
      this.gameoverOverlay.classList.add('active');
    }, 650);
  }
}

// Auto-instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  window.adventureGame = new WebTeamAdventure();
});
