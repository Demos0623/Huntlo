import * as THREE from 'three';
import { InputManager } from './Input/InputManager.js';
import { TouchControls } from './Input/TouchControls.js?v=mobile-abilities';
import { isPerfMode, setPerfMode } from './perf.js';
import { FPSCamera } from './Camera/FPSCamera.js';
import { MovementController } from './Movement/MovementController.js';
import { WeaponManager } from './Weapons/WeaponManager.js?v=training-range';
import { ViewModel } from './Weapons/ViewModel.js?v=knife-hit-fast-start';
import { WeaponModelLoader } from './Weapons/WeaponModelLoader.js';
import { HitSystem } from './Combat/HitSystem.js';
import { Target } from './Combat/Target.js';
import { Bots } from './Combat/Bot.js?v=training-range';
import { AbilitySystem } from './Abilities/AbilitySystem.js';
import { HUD } from './UI/HUD.js?v=training-range';
import { BuyMenu } from './UI/BuyMenu.js';
import { Weapons, Armor } from './Weapons/WeaponData.js';
import { Minimap } from './UI/Minimap.js?v=training-range';
import { ESP } from './UI/ESP.js';
import { AudioManager } from './Audio/AudioManager.js';
import { buildArena } from './World/Arena.js';
import { buildTrainingRange } from './World/TrainingRange.js';
import { setupEnvironment } from './World/Environment.js';
import { buildRTX } from './Render/RTX.js';
import { PlayerModel } from './World/PlayerModel.js';
import { Net } from './Net/Net.js';
import { RemotePlayers } from './Net/RemotePlayers.js';

const FIXED_DT = 1 / 120;
const MAX_STEPS = 5;

class Game {
  constructor() {
    const canvas = document.getElementById('game');

    const detectedMobile = TouchControls.isTouchDevice();
    let savedControlMode = detectedMobile ? 'mobile' : 'desktop';
    try {
      const saved = localStorage.getItem('valo_control_mode');
      if (saved === 'mobile' || saved === 'desktop') savedControlMode = saved;
    } catch (_) { /* use device default */ }
    this.controlMode = savedControlMode;
    this._isMobile = this.controlMode === 'mobile';
    this._perf = isPerfMode();

    this._lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    const light = this._isMobile || this._lowEnd || this._perf;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !light, powerPreference: 'high-performance' });
    this._basePR = Math.min(window.devicePixelRatio || 1, light ? 1.5 : 2);
    this._renderScale = 1;
    this._fpsAccum = 0; this._fpsFrames = 0;
    this._shadowsAllowed = !light;
    this.renderer.setPixelRatio(this._basePR);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this._shadowsAllowed;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();

    this.env = setupEnvironment(this.scene, this.renderer);

    const map = buildArena(this.scene);
    const rangeMap = buildTrainingRange(this.scene);
    this._maps = { home: map, range: rangeMap };
    this._mapMode = 'home';
    this._activeMap = map;
    this._surfMats = map.materials || {};
    this._arena = { areas: map.areas, walls: map.walls, covers: map.covers, bounds: map.bounds };
    this.targets = map.targets;
    this._spawns = map.spawns;
    let team = 'attacker';
    try { const t = localStorage.getItem('valo_team'); if (t === 'attacker' || t === 'defender') team = t; } catch (_) {  }
    this._team = team;

    this.occluders = map.colliders.filter((c) => !(c.userData && c.userData.target));
    this._enemyRay = new THREE.Raycaster();

    this.camera = new FPSCamera(window.innerWidth / window.innerHeight);
    this.camera.yaw = this._spawns[team].yaw;
    this.movement = new MovementController(map.world, this._spawns[team].pos.clone());
    this.input = new InputManager(canvas);

    this.audio = new AudioManager();
    this.hitSystem = new HitSystem(this.scene, map.colliders);

    // AI bots — OFF by default. "boton" spawns them, "botoff" removes them.
    const dp = this._spawns.defender.pos;
    this._botSpawns = [[3, -2], [-3, 2], [1.5, 3.5]].map(
      ([ox, oz]) => new THREE.Vector3(dp.x + ox, 0, dp.z + oz));
    let botDiff = 'normal';
    try { const d = localStorage.getItem('valo_botdiff'); if (d === 'easy' || d === 'normal' || d === 'hard') botDiff = d; } catch (_) { /* ignore */ }
    this.homeBots = new Bots(this.scene, this.hitSystem.colliders, [], botDiff);
    this.rangeBots = new Bots(this.scene, rangeMap.colliders, rangeMap.botSpawns, 'easy', {
      practice: true, patrolRadius: 4.5,
    });
    this.bots = this.homeBots;
    this.hud = new HUD(document.getElementById('hud'));
    this._trainingStats = { shots: 0, hits: 0, headshots: 0 };
    this.hud.setTrainingReset(() => this._resetTrainingStats());
    this.hud.setTrainingStats(this._trainingStats);

    // Build touch controls after the HUD: HUD initializes its own markup, so
    // creating the overlay first would remove it before a mobile match starts.
    this.touch = new TouchControls(document.getElementById('hud'));
    if (this.touch) this.input.attachTouch(this.touch);

    this.weapons = new WeaponManager({
      camera: this.camera,
      hitSystem: this.hitSystem,
      audio: this.audio,
      hud: this.hud,
      getEyePosition: () => this.movement.eyePosition,
      getMoveState: () => this.movement.getAccuracyState(),

      onShot: (muzzle, end, weaponId) => {
        if (this.net && this.net.connected) {
          this.net.send({ t: 'shot', o: [muzzle.x, muzzle.y, muzzle.z], e: [end.x, end.y, end.z], wid: weaponId });
        }
      },
      onShotResult: (result) => this._registerTrainingShot(result),
    });

    this.playerModel = new PlayerModel(this.scene);

    this.modelLoader = new WeaponModelLoader();
    this.viewModel = new ViewModel(this.camera, this.modelLoader);
    this.viewModel.scene.environment = this.scene.environment;
    this.viewModel.setWeapon(this.weapons.current.def.id);

    this.modelLoader.preload().then(() => this.viewModel.forceRebuild());

    this.health = 150;
    this.hud.setHealth(this.health);

    this.credits = 9000;
    this.infiniteMoney = false;
    this.shield = 0;

    this._boughtSlot = { primary: false, secondary: false };
    this.hud.setCredits(this._displayCredits());
    this.hud.setShield(this.shield);
    this.buyMenu = new BuyMenu(document.getElementById('hud'), {
      getCredits: () => this._displayCredits(),
      getOwned: () => [this.weapons.weapons.primary.def.id, this.weapons.weapons.secondary.def.id],
      getInfinite: () => this.infiniteMoney,
      getLockedSlots: () => Object.keys(this._boughtSlot).filter((s) => this._boughtSlot[s]),
      onBuyWeapon: (id) => this._buyWeapon(id),
      onBuyArmor: (id) => this._buyArmor(id),
      onToggleInfinite: () => this._toggleInfinite(),
      onToggle: (open) => this._onBuyMenuToggle(open),
      getBlocked: () => this._dead,
    });

    this.minimap = new Minimap(document.getElementById('hud'), {
      areas: map.areas, walls: map.walls, covers: map.covers, bounds: map.bounds,
    });
    // The imported arena is the source of truth for visible walls. Upgrade the
    // minimap from its startup layout once the GLB has finished loading.
    map.ready?.then(({ minimapWalls, minimapCovers }) => {
      map._minimapWalls = minimapWalls;
      map._minimapCovers = minimapCovers;
      if (this._mapMode !== 'home') return;
      this.minimap.setWalls(minimapWalls);
      this.minimap.setCovers(minimapCovers);
      this._refreshActiveMapColliders();
    });

    this.esp = new ESP(document.getElementById('hud'), this.camera.camera);

    // Abilities (Q/E/C/X) — Curveball flash to start.
    this.abilities = new AbilitySystem(this);

    // RTX mode (bloom + ambient occlusion post-processing). Off on low-end/perf.
    this.rtxOn = false; this._rtx = null;
    let wantRtx = false;
    try { wantRtx = localStorage.getItem('valo_rtx') === '1'; } catch (_) { /* ignore */ }
    if (wantRtx && !this._perf && !this._lowEnd) this._setRtx(true);

    this.aimlock = false;
    this._aimRadius = 110;
    this.triggerbot = false;
    this._trigRelease = false;
    this.mapEsp = false;
    this._spinbot = false; // "spin" code: broadcast a fast-spinning yaw (anti-aim)
    this._tpArmed = false; // "tp" code: press T to teleport to the crosshair
    this.flick = false;    // "flick" code: snap aim to enemy head when firing
    this.selfbot = false;  // "selfbot" code: AI plays your character
    this.muscle = false;   // "muscle" code: cosmetic power-build player model
    this.rainbow = false;  // "rainbow" code: cycle gold gun accents through color
    this._flashedT = 0;    // seconds remaining blinded (broadcast so others see it)

    let savedNick = '';
    try { savedNick = (localStorage.getItem('valo_nick') || '').slice(0, 16); } catch (_) {  }
    this.nickname = savedNick;
    const nickEl = document.getElementById('v-nick');
    if (nickEl) {
      nickEl.value = savedNick;

      nickEl.addEventListener('click', (e) => e.stopPropagation());
      nickEl.addEventListener('keydown', (e) => e.stopPropagation());
      nickEl.addEventListener('input', () => {
        this.nickname = nickEl.value.slice(0, 16);
        try { localStorage.setItem('valo_nick', this.nickname); } catch (_) {  }
      });
    }

    // Look-sensitivity slider — persists and applies to the camera live.
    let savedSens = 1;
    try { const v = parseFloat(localStorage.getItem('valo_sens')); if (v > 0) savedSens = v; } catch (_) {  }
    savedSens = Math.max(0.1, Math.min(3, savedSens));
    this.camera.sensScale = savedSens;
    const sensEl = document.getElementById('v-sens');
    const sensVal = document.getElementById('v-sens-val');
    if (sensEl) {
      sensEl.value = String(savedSens);
      if (sensVal) sensVal.textContent = savedSens.toFixed(2);
      sensEl.addEventListener('click', (e) => e.stopPropagation());
      sensEl.addEventListener('input', () => {
        const v = Math.max(0.1, Math.min(3, parseFloat(sensEl.value) || 1));
        this.camera.sensScale = v;
        if (sensVal) sensVal.textContent = v.toFixed(2);
        try { localStorage.setItem('valo_sens', String(v)); } catch (_) {  }
      });
    }

    const teamWrap = document.getElementById('v-team');
    if (teamWrap) {
      const paintTeam = () => teamWrap.querySelectorAll('.v-team-b').forEach(
        (b) => b.classList.toggle('v-team-on', b.dataset.team === this._team));
      paintTeam();
      teamWrap.querySelectorAll('.v-team-b').forEach((b) =>
        b.addEventListener('click', (e) => { e.stopPropagation(); this.setTeam(b.dataset.team); paintTeam(); }));
    }

    const controlWrap = document.getElementById('v-control-mode');
    if (controlWrap) {
      const paintControlMode = () => controlWrap.querySelectorAll('.v-team-b').forEach(
        (b) => b.classList.toggle('v-control-on', b.dataset.control === this.controlMode));
      paintControlMode();
      controlWrap.querySelectorAll('.v-team-b').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._setControlMode(b.dataset.control);
        paintControlMode();
      }));
    }

    this._commands = {};
    for (const name of Object.keys(this._cheatDefs())) {
      this._commands[name] = () => this._toggleCheat(name);
    }
    // Bot difficulty codes (one-shot setters, not toggles).
    const setDiff = (name, label) => () => {
      this.bots.setDifficulty(name);
      try { localStorage.setItem('valo_botdiff', name); } catch (_) { /* ignore */ }
      document.querySelectorAll('#v-botdiff .v-team-b').forEach(
        (b) => b.classList.toggle('v-team-on', b.dataset.diff === name));
      return label;
    };
    this._commands.botez = setDiff('easy', 'BOTS: EASY');
    this._commands.botmid = setDiff('normal', 'BOTS: NORMAL');
    this._commands.bothard = setDiff('hard', 'BOTS: HARD');
    // "selfbot" — AI takes over and plays your character.
    this._commands.selfbot = () => { this.selfbot = !this.selfbot; return this.selfbot ? 'SELF-BOT ON' : 'SELF-BOT OFF'; };
    // "muscle" — cosmetic bulked-up character model, shared with other players.
    this._commands.muscle = () => {
      this.muscle = !this.muscle;
      this.playerModel.setMuscle(this.muscle);
      return this.muscle ? 'MUSCLE ON' : 'MUSCLE OFF';
    };
    // "rainbow" — cycle the current gun's gold accents through rainbow colors.
    this._commands.rainbow = () => {
      this.rainbow = !this.rainbow;
      this.viewModel.setRainbow(this.rainbow);
      this.hitSystem.setRainbow(this.rainbow);
      return this.rainbow ? 'RAINBOW ON' : 'RAINBOW OFF';
    };
    // "health" — restore the current life bar without changing shields or reviving.
    this._commands.health = () => {
      if (this._dead) return 'RESPAWN TO HEAL';
      this.health = 150;
      this.hud.setHealth(this.health);
      return 'HEALTH FULL';
    };
    // "boton" — spawn the enemy bots; "botoff" — remove them.
    this._commands.boton = () => {
      if (this.bots.list.length) return 'BOTS ALREADY ON';
      this._botSpawns.forEach((p, i) => this.bots.spawn(p.clone(), 'BOT ' + (i + 1)));
      return 'BOTS ON';
    };
    this._commands.botoff = () => { this.bots.clear(); return 'BOTS REMOVED'; };
    // "nuke" — drop a missile from the sky that explodes and wipes out all enemies.
    this._commands.nuke = () => { this._launchNuke(); return 'NUKE INBOUND'; };
    this._commands.range = () => { this._setActiveMap('range'); return 'TRAINING RANGE'; };
    this._commands.home = () => { this._setActiveMap('home'); return 'HOME MAP'; };

    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || (e.key !== 'p' && e.key !== 'P')) return;
      if (document.activeElement === document.getElementById('v-cmd')) return;
      e.preventDefault();
      const on = !this._allCheatsOn();
      this._setAllCheats(on);
      const m = document.getElementById('v-cmd-msg');
      if (m) { m.textContent = on ? 'ALL CHEATS ON' : 'ALL CHEATS OFF'; m.className = on ? 'ok' : ''; }
    });

    // Teleport to crosshair (T), only while the "tp" cheat is armed.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 't' && e.key !== 'T') return;
      if (!this._tpArmed || this._dead) return;
      if (document.activeElement === document.getElementById('v-cmd')) return;
      if (!this.input.engaged || this.buyMenu?.isOpen) return;
      this._teleportToCrosshair();
    });

    const cmdEl = document.getElementById('v-cmd');
    const cmdMsg = document.getElementById('v-cmd-msg');
    const consoleEl = document.getElementById('v-console');
    const codeListEl = document.getElementById('v-code-list');
    const codeOptionsEl = document.getElementById('v-code-options');
    const codeApplyEl = document.getElementById('v-code-apply');
    const codeCancelEl = document.getElementById('v-code-cancel');
    const selectedListedCodes = new Set();
    let showCheatsInList = false;
    const codeLabels = {
      botez: 'BOTS · EASY', botmid: 'BOTS · NORMAL', bothard: 'BOTS · HARD',
      selfbot: 'SELF-BOT', muscle: 'MUSCLE', rainbow: 'RAINBOW', health: 'HEALTH',
      boton: 'BOTS ON', botoff: 'BOTS OFF', nuke: 'NUKE', range: 'TRAINING RANGE', home: 'HOME MAP',
      infammo: 'INFINITE AMMO', nmi: 'NO MOVE INACCURACY', norecoil: 'NO RECOIL', esp: 'ESP',
      aimlock: 'AIMLOCK', trigger: 'TRIGGERBOT', mapesp: 'MAP ESP', hitbox: 'HITBOX VIEW',
      bhitbox: 'BIG HITBOX', god: 'GOD MODE', spin: 'SPINBOT', fly: 'FLY', speed: 'SPEED',
      rapid: 'RAPID FIRE', tp: 'TELEPORT', flick: 'FLICK',
    };
    const paintCodeList = () => {
      if (!codeOptionsEl) return;
      codeOptionsEl.replaceChildren();
      const cheats = this._cheatDefs();
      const availableCodes = Object.keys(this._commands).filter((name) =>
        name !== 'list' && name !== 'cheat' && !name.startsWith('bot') &&
        (showCheatsInList || (!cheats[name] && name !== 'selfbot')));
      const groups = showCheatsInList
        ? [
          { title: 'AIM', codes: ['nmi', 'norecoil', 'aimlock', 'trigger', 'flick'] },
          { title: 'MOVEMENT', codes: ['fly', 'speed', 'tp'] },
          { title: 'MISC', codes: ['esp', 'mapesp', 'hitbox', 'bhitbox', 'infammo', 'god', 'rapid', 'spin', 'selfbot'] },
        ]
        : [
          { title: 'COSMETIC', codes: ['muscle', 'rainbow'] },
          { title: 'GAME', codes: ['health'] },
          { title: 'TOOL', codes: ['nuke', 'range', 'home'] },
        ];

      for (const group of groups) {
        const codes = group.codes.filter((code) => availableCodes.includes(code));
        if (!codes.length) continue;
        const section = document.createElement('section');
        section.className = 'v-code-group';
        const heading = document.createElement('div');
        heading.className = 'v-code-group-title';
        heading.textContent = group.title;
        const options = document.createElement('div');
        options.className = 'v-code-group-options';
        for (const code of codes) {
          const option = document.createElement('button');
          option.type = 'button'; option.className = 'v-code-option'; option.dataset.code = code;
          option.textContent = codeLabels[code] || code.toUpperCase();
          option.classList.toggle('v-code-selected', selectedListedCodes.has(code));
          option.addEventListener('click', () => {
            if (selectedListedCodes.has(code)) selectedListedCodes.delete(code);
            else selectedListedCodes.add(code);
            paintCodeList();
            if (codeApplyEl) codeApplyEl.disabled = selectedListedCodes.size === 0;
          });
          options.appendChild(option);
        }
        section.append(heading, options);
        codeOptionsEl.appendChild(section);
      }
    };
    const closeCodeList = () => {
      if (codeListEl) codeListEl.hidden = true;
      selectedListedCodes.clear();
      if (codeApplyEl) codeApplyEl.disabled = true;
    };
    const openCodeList = (includeCheats = false) => {
      showCheatsInList = includeCheats;
      selectedListedCodes.clear();
      if (codeApplyEl) codeApplyEl.disabled = true;
      paintCodeList();
      if (codeListEl) codeListEl.hidden = false;
    };
    this._commands.list = () => { openCodeList(false); return 'CODE LIST OPEN'; };
    this._commands.cheat = () => { openCodeList(true); return 'CHEAT LIST OPEN'; };
    codeCancelEl?.addEventListener('click', closeCodeList);
    codeApplyEl?.addEventListener('click', () => {
      const results = [];
      for (const code of selectedListedCodes) {
        const fn = this._commands[code];
        if (typeof fn !== 'function') continue;
        try { results.push(fn.call(this) || code.toUpperCase()); } catch (_) { /* continue with other choices */ }
      }
      if (!results.length) return;
      this.hud?._toast(results.length === 1 ? results[0] : `${results.length} CODES APPLIED`);
      closeCodeList();
    });
    const closeConsole = () => {
      if (consoleEl) consoleEl.hidden = true;
      if (cmdEl) { cmdEl.value = ''; cmdEl.blur(); }
    };
    this._closeConsole = closeConsole;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && codeListEl && !codeListEl.hidden) {
        e.preventDefault();
        closeCodeList();
        return;
      }
      if (e.key !== '/' || e.repeat) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;
      e.preventDefault();
      closeCodeList();
      if (consoleEl) consoleEl.hidden = false;
      cmdEl?.focus();
    });
    if (cmdEl) {

      cmdEl.addEventListener('click', (e) => e.stopPropagation());
      cmdEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); closeConsole(); return; }
        if (e.key !== 'Enter') return;
        const code = cmdEl.value.trim();
        if (!code) { closeConsole(); return; }
        const fn = this._commands[code] || this._commands[code.toLowerCase()];
        if (typeof fn === 'function') {
          let out;
          try { out = fn.call(this); } catch (_) { out = null; }
          if (cmdMsg) { cmdMsg.textContent = out || 'OK'; cmdMsg.className = 'ok'; }
        } else if (cmdMsg) {
          cmdMsg.textContent = 'UNAUTHORIZED';
          cmdMsg.className = 'err';
        }
        cmdEl.value = '';
        closeConsole();
      });
    }

    this._dead = false;
    this._netAccum = 0;
    this._netSeq = 0;
    this._lastSentState = null;
    this._lastStateKeyframeAt = 0;
    this._ping = null;
    this._pingAccum = 0;
    this._pingSeq = 0;
    this._pingPending = new Map();
    this._pingSamples = [];
    this._pingOutcomes = [];
    this._lastPongAt = 0;
    this._jitter = null;
    this._lastPingSample = null;
    this._stateSeqByPlayer = new Map();
    this._stateGaps = 0;
    this._interpolationDelay = 0.12;
    this._lastNetworkPanelAt = 0;
    this._fps = 0;
    this._scores = new Map();
    this._lastAttacker = null;

    const _origKill = this.hud.onKill.bind(this.hud);
    this.hud.onKill = (info) => {
      _origKill(info);
      this._registerLocalKill();
      // Broadcast the kill so it shows in everyone's kill feed (live).
      if (this.net) this.net.send({
        t: 'kill',
        killer: (this.nickname || 'PLAYER').toUpperCase(),
        victim: info?.victim || 'PLAYER',
        weapon: info?.weapon || '',
        head: !!info?.headshot,
      });
    };
    this.remotePlayers = new RemotePlayers(
      this.scene, this.hitSystem.colliders,

      (id, dmg, head) => {
        if (this._isFriendly(this.remotePlayers.players.get(id))) return;
        if (this.net) this.net.send({ t: 'hit', target: id, dmg, head });
      },
      this.modelLoader
    );
    this.remotePlayers.myTeam = this._team;
    // Relay URL resolution, in priority order:
    //   ?solo            → dummy address, no networking (map capture/testing)
    //   ?relay=wss://…   → explicit override, handy for quick testing
    //   window.HUNTLO_RELAY_URL → production relay (set once in index.html after
    //                             deploying relay_server.py to a wss:// host)
    //   otherwise same host, protocol-matched: wss:// on an https page (no port,
    //   assumes TLS on 443), ws://…:8080 for local http development.
    const qs = new URLSearchParams(location.search);
    let wsUrl;
    if (qs.has('solo')) {
      wsUrl = 'ws://127.0.0.1:0';
    } else if (qs.get('relay')) {
      wsUrl = qs.get('relay');
    } else if (typeof window !== 'undefined' && window.HUNTLO_RELAY_URL) {
      wsUrl = window.HUNTLO_RELAY_URL;
    } else {
      const secure = location.protocol === 'https:';
      wsUrl = `${secure ? 'wss' : 'ws'}://${location.hostname || 'localhost'}${secure ? '' : ':8080'}`;
    }
    this.net = new Net(wsUrl)
      .on('up', () => {
        this._lastPongAt = 0;
        this._pingPending.clear();
        // A new socket has no delta baseline at the relay, so its next update
        // must be a complete state.
        this._lastSentState = null;
        this._lastStateKeyframeAt = 0;
      })
      .on('welcome', (m) => {
        // The relay may provide a suggested team, but local team selection is
        // never locked by the network host.
        if (m.team === 'attacker' || m.team === 'defender') {
          this.setTeam(m.team);
        }
        if (Number.isFinite(m.credits)) this.credits = m.credits;
        if (Number.isFinite(m.shield)) this.shield = m.shield;
        this.hud?.setCredits(this._displayCredits());
        this.hud?.setShield(this.shield);
      })
      .on('snapshot', (m) => {
        // A late join immediately receives the latest accepted state instead
        // of waiting for every player to send their next movement packet.
        for (const state of m.players || []) {
          if (state.id !== this.net.id) {
            this.remotePlayers.setState(state);
            this._score(state.id, state.name);
          }
        }
      })
      .on('economy', (m) => {
        if (m.id !== this.net.id) return;
        if (Number.isFinite(m.credits)) this.credits = m.credits;
        if (Number.isFinite(m.shield)) this.shield = m.shield;
        this.hud.setCredits(this._displayCredits());
        this.hud.setShield(this.shield);
      })
      .on('leave', (m) => { this.remotePlayers.remove(m.id); this._scores.delete(m.id); this._stateSeqByPlayer.delete(m.id); })
      .on('state', (m) => {
        if (m.id !== this.net.id) {
          this._recordRemoteState(m);
          this.remotePlayers.setState(m.id, m);
          this._score(m.id, m.name);
        }
      })
      .on('hit', (m) => {
        if (m.target === this.net.id) this._takeDamage(m.dmg, m.head, m.id);
      })
      .on('respawn', (m) => {
        if (m.id === this.net.id) return;
        const p = this.remotePlayers.players.get(m.id);
        if (p) { p.hp = m.hp; p.setDead(false); }
      })
      .on('death', (m) => {
        // Our own death was already applied from the authoritative damage
        // packet.  Other clients only update their local scoreboard view.
        if (m.id === this.net.id) return;
        this._score(m.id).deaths++;
        if (m.by != null && m.by !== this.net.id) this._score(m.by).kills++;
      })
      .on('kill', (m) => {
        // Someone else got a kill — show it live in our kill feed.
        if (m.id === this.net.id) return;
        this.hud.onRemoteKill({ killer: m.killer, victim: m.victim, weapon: m.weapon, headshot: m.head });
      })
      .on('nuke', (m) => {
        // Someone else launched a nuke — play the incoming warning + visuals.
        if (m.id === this.net.id) return;
        this._spawnNuke(m.cx, m.cz, false);
      })
      .on('shot', (m) => {

        if (m.id === this.net.id || !m.o || !m.e) return;
        this.hitSystem.spawnTracer(
          new THREE.Vector3(m.o[0], m.o[1], m.o[2]),
          new THREE.Vector3(m.e[0], m.e[1], m.e[2])
        );
        if (m.wid) this.audio?.playFire(m.wid);
      })
      .on('flashThrow', (m) => {
        if (m.id === this.net.id || m.x == null || m.dx == null) return;
        this.abilities._curveball(m.sign < 0 ? -1 : 1, true, m);
      })
      .on('flash', (m) => {
        // Another player's flash popped — blind ourselves if we can see it.
        if (m.id === this.net.id || m.x == null) return;
        this.abilities._applyFlashAt(new THREE.Vector3(m.x, m.y, m.z), false);
      })
      .on('smoke', (m) => {
        if (m.id === this.net.id || m.x == null || m.z == null) return;
        this.abilities._skyDeploySmoke(m.x, m.z, true);
      })
      .on('pong', (m) => { this._recordPong(m); })
      .on('down', () => {
        this._ping = null;
        this._jitter = null;
        this._pingPending.clear();
        this._pingSamples.length = 0;
        this._stateSeqByPlayer.clear();
        this._interpolationDelay = 0.12;
        this.remotePlayers.setInterpolationDelay(this._interpolationDelay);
        for (const id of [...this.remotePlayers.players.keys()]) this.remotePlayers.remove(id);
      });

    this._bindPointerLock(canvas);
    this._bindResize();

    this._accum = 0;
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    this._overlay = document.getElementById('overlay');
    if (new URLSearchParams(location.search).has('headshot-preview')) this._setupHeadshotPreview();
  }

  // A query-only presentation lane used to capture the live headshot effect.
  // It is deliberately isolated from the map and never runs during a normal match.
  _setupHeadshotPreview() {
    this._overlay.style.display = 'none';
    this.movement.position.set(50, 0, 0);
    this.movement.velocity.set(0, 0, 0);
    this.movement.fly = true;
    this.camera.yaw = 0;
    this.camera.pitch = 0;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 22),
      new THREE.MeshStandardMaterial({ color: 0x152331, roughness: 0.82, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(50, -0.02, -8);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 8),
      new THREE.MeshStandardMaterial({ color: 0x0b1524, roughness: 0.7, metalness: 0.15 })
    );
    backdrop.position.set(50, 4, -10);
    this.scene.add(backdrop);

    // Extra health keeps the showcase target upright while each repeated
    // headshot still travels through the normal hit-detection path.
    const target = new Target(this.scene, new THREE.Vector3(50, 0, -5), { label: 'HEADSHOT', health: 999 });
    this.targets.push(target);
    this.hitSystem.colliders.push(target.mesh);
    this._headshotPreview = { target, cooldown: 0.05 };
  }

  _updateHeadshotPreview(dt) {
    const preview = this._headshotPreview;
    if (!preview) return;
    preview.cooldown -= dt;
    if (preview.cooldown > 0) return;

    // Reset the showcase target then perform the same raycast used by a real shot.
    preview.target.health = preview.target.maxHealth;
    preview.target._downTimer = 0;
    preview.target.mesh.rotation.z = 0;
    const origin = new THREE.Vector3(50, preview.target.headMinY + 0.05, 0);
    this.hitSystem.fireRay(origin, new THREE.Vector3(0, 0, -1), 0, Weapons.vantage, origin);
    preview.cooldown = 0.42;
  }

  _displayCredits() { return this.infiniteMoney ? Infinity : this.credits; }

  _toggleInfinite() {
    this.infiniteMoney = !this.infiniteMoney;
    this.hud.setCredits(this._displayCredits());
    return this.infiniteMoney;
  }

  _buyWeapon(id) {
    const def = Weapons[id];
    if (!def) return false;

    if (this.weapons.weapons[def.slot].def.id === id) { this.weapons.switchTo(def.slot); return true; }

    if (this._boughtSlot[def.slot]) return false;
    if (!this.infiniteMoney) {
      if (this.credits < def.price) return false;
      this.credits -= def.price;
    }
    this.weapons.swapSlotWeapon(id);
    this._boughtSlot[def.slot] = true;
    this.hud.setCredits(this._displayCredits());
    if (this.net?.connected && !this.infiniteMoney) this.net.send({ t: 'buy', kind: 'weapon', item: id });
    return true;
  }

  _buyArmor(id) {
    const a = Armor[id];
    if (!a) return false;
    if (this.shield >= a.shield) return false;
    if (!this.infiniteMoney) {
      if (this.credits < a.price) return false;
      this.credits -= a.price;
    }
    this.shield = a.shield;
    this.hud.setCredits(this._displayCredits());
    this.hud.setShield(this.shield);
    if (this.net?.connected && !this.infiniteMoney) this.net.send({ t: 'buy', kind: 'armor', item: id });
    return true;
  }

  _onBuyMenuToggle(open) {
    if (open) {

      this._boughtSlot = { primary: false, secondary: false };
      this.audio.resume();

      try { document.exitPointerLock?.(); } catch (_) {  }
      this.input.pointerLocked = false;
    } else {

      this.input.requestPointerLock(this.renderer.domElement);
    }
  }

  _bindPointerLock(canvas) {
    const lock = () => {
      if (this._dead) return;
      if (this.buyMenu?.isOpen) return;
      if (this.controlMode === 'mobile' && this.touch) {
        if (!this.touch.engaged) {
          this.touch.engaged = true;
          this.touch.setVisible(true);
          this.audio.resume();
          this._closeConsole?.();
          if (this._overlay) this._overlay.style.display = 'none';
        }
        return;
      }
      if (!this.input.pointerLocked) {
        this.input.requestPointerLock(canvas);
        this.audio.resume();
      }
    };

    document.getElementById('v-play')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeConsole?.();
      this.health = 150; this.hud.setHealth(this.health);
      const ci = document.getElementById('v-cmd'); if (ci) ci.value = '';
      lock();
    });
    document.getElementById('overlay')?.addEventListener('click', lock);
    canvas.addEventListener('click', lock);
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (locked) this._closeConsole?.();

      if (this._overlay) this._overlay.style.display = (locked || this.buyMenu?.isOpen || this._dead) ? 'none' : '';
    });
  }

  // Toggle RTX post-processing. Builds the composer lazily the first time it's
  // enabled; boosts exposure while on for a punchier, brighter look.
  _setRtx(on) {
    if (on && !this._rtx) {
      try { this._rtx = buildRTX(this.renderer, this.scene, this.camera.camera); }
      catch (e) { this._rtx = null; on = false; }
    }
    this.rtxOn = !!(on && this._rtx);
    this.renderer.toneMappingExposure = this.rtxOn ? 1.28 : 1.05;
    // Glossy, reflective floor when RTX is on (uses the existing environment map
    // for cheap ray-traced-looking reflections); matte again when off.
    const f = this._surfMats.floor;
    if (f && f.isMeshStandardMaterial) {
      f.roughness = this.rtxOn ? 0.45 : 1.0;
      f.metalness = this.rtxOn ? 0.22 : 0.0;
      f.envMapIntensity = this.rtxOn ? 1.3 : 1.0;
      f.needsUpdate = true;
    }
    const w = this._surfMats.wall;
    if (w && w.isMeshStandardMaterial) {
      w.roughness = this.rtxOn ? 0.72 : 1.0;
      w.envMapIntensity = this.rtxOn ? 1.3 : 1.0;
      w.needsUpdate = true;
    }
    // Boost environment reflections on every other surface for consistent realism.
    this.scene.traverse((o) => {
      const m = o.material;
      if (!m || !m.isMeshStandardMaterial || m === f || m === w) return;
      if (m.userData._baseEnv == null) m.userData._baseEnv = m.envMapIntensity ?? 1;
      m.envMapIntensity = this.rtxOn ? m.userData._baseEnv * 1.4 : m.userData._baseEnv;
    });
    // Softer, sharper sun shadows in RTX; back to default otherwise.
    const sun = this.env && this.env.sun;
    if (sun && sun.shadow) {
      const px = this.rtxOn ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== px) {
        sun.shadow.mapSize.set(px, px);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      sun.shadow.radius = this.rtxOn ? 3 : 1;
    }
    try { localStorage.setItem('valo_rtx', this.rtxOn ? '1' : '0'); } catch (_) { /* ignore */ }
    return this.rtxOn;
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.setAspect(window.innerWidth / window.innerHeight);
      if (this._rtx) this._rtx.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _adaptResolution(frameTime) {
    this._fpsAccum += frameTime; this._fpsFrames++;
    if (this._fpsAccum < 0.5) return;
    const fps = this._fpsFrames / this._fpsAccum;
    this._fpsAccum = 0; this._fpsFrames = 0;
    this._fps = Math.round(fps);
    this.hud.setNetStats(this._fps, this.net && this.net.connected ? this._ping : null, this._jitter);
    let s = this._renderScale;
    if (fps < 50) s = Math.max(0.6, s - 0.1);
    else if (fps > 75) s = Math.min(1, s + 0.1);
    if (Math.abs(s - this._renderScale) > 0.001) {
      this._renderScale = s;
      this.renderer.setPixelRatio(this._basePR * s);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (this._rtx) this._rtx.setSize(window.innerWidth, window.innerHeight);
    }

    if (fps < 45 && this._renderScale <= 0.61 && this.renderer.shadowMap.enabled) this._setShadows(false);
    else if (fps > 82 && !this.renderer.shadowMap.enabled && this._shadowsAllowed) this._setShadows(true);
  }

  _recordPong(m) {
    const sent = this._pingPending.get(m.seq);
    if (!sent || !Number.isFinite(sent.at)) return;
    this._pingPending.delete(m.seq);
    const sample = performance.now() - sent.at;
    // Ignore impossible/stale replies so a dropped relay shows -- instead of
    // holding a misleading old latency value.
    if (sample < 0 || sample > 4000) return;
    this._recordPingOutcome(true);
    this._pingSamples.push(sample);
    if (this._pingSamples.length > 5) this._pingSamples.shift();
    const sorted = [...this._pingSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this._ping = Math.round(this._ping == null ? median : this._ping * 0.65 + median * 0.35);
    const delta = this._lastPingSample == null ? 0 : Math.abs(sample - this._lastPingSample);
    this._jitter = Math.round(this._jitter == null ? delta : this._jitter * 0.75 + delta * 0.25);
    this._lastPingSample = sample;
    this._lastPongAt = performance.now();
    // State is sent at 30 Hz, so a stable connection only needs a tiny buffer.
    // Jitter expands that buffer rather than making every player feel delayed.
    const loss = this._packetLoss() || 0;
    this._interpolationDelay = Math.min(0.20, 0.065 + this._jitter / 500 + loss / 400);
    this.remotePlayers.setInterpolationDelay(this._interpolationDelay);
    this.hud.setNetStats(this._fps, this._ping, this._jitter);
  }

  _recordPingOutcome(ok) {
    this._pingOutcomes.push(ok ? 0 : 1);
    if (this._pingOutcomes.length > 20) this._pingOutcomes.shift();
  }

  _packetLoss() {
    // Wait for a few probes before presenting a percentage as meaningful.
    if (this._pingOutcomes.length < 4) return null;
    return this._pingOutcomes.reduce((sum, lost) => sum + lost, 0) * 100 / this._pingOutcomes.length;
  }

  _recordRemoteState(state) {
    if (!Number.isInteger(state.seq)) return;
    const last = this._stateSeqByPlayer.get(state.id);
    if (Number.isInteger(last) && state.seq > last + 1) this._stateGaps += state.seq - last - 1;
    if (!Number.isInteger(last) || state.seq > last) this._stateSeqByPlayer.set(state.id, state.seq);
  }

  _networkPanelTick() {
    const now = performance.now();
    if (now - this._lastNetworkPanelAt < 250) return;
    this._lastNetworkPanelAt = now;
    const net = this.net?.stats() || {};
    this.hud.setNetworkDetails({
      connected: !!net.connected,
      reconnecting: !!net.reconnecting,
      ping: this._ping,
      jitter: this._jitter,
      loss: this._packetLoss(),
      stateGaps: this._stateGaps,
      txRate: net.txRate || 0,
      rxRate: net.rxRate || 0,
      buffered: net.buffered || 0,
      reconnects: net.reconnects || 0,
      interpolation: this._interpolationDelay,
    });
  }

  _setShadows(on) {
    if (this.renderer.shadowMap.enabled === on) return;
    this.renderer.shadowMap.enabled = on;
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.traverse((o) => {
      if (o.isMesh && o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
      }
    });
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    let frameTime = (now - this._last) / 1000;
    this._last = now;
    frameTime = Math.min(frameTime, 0.1);

    this._adaptResolution(frameTime);

    if (this.input.engaged && !this.buyMenu?.isOpen && !this._dead && !this.abilities.tablet) {
      const { dx, dy } = this.input.consumeMouseDelta();
      this.camera.applyLook(dx, dy, this.weapons.aiming);
    }

    if (this.aimlock) this._applyAimlock();

    this._accum += frameTime;
    let steps = 0;
    while (this._accum >= FIXED_DT && steps < MAX_STEPS) {
      this._fixedUpdate(FIXED_DT);
      this._accum -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this._accum = 0;

    this.camera.update(frameTime, this.movement.eyePosition);

    this.env.sky.position.copy(this.camera.camera.position);
    this.hitSystem.update(frameTime);
    for (const t of this.targets) t.update(frameTime);
    this._updateHeadshotPreview(frameTime);
    this.bots.update(frameTime, {
      playerEye: this.movement.eyePosition,
      playerAlive: !this._dead,
      world: this.movement.world,
      occluders: this.occluders,
      ray: this._enemyRay,
      hitSystem: this.hitSystem,
      dealDamage: (dmg, head) => this._takeDamage(dmg, head, 'bot'),
    });
    this._updateNuke(frameTime);
    this.abilities.update(frameTime);
    this.hud.setSpread(this.weapons.getCurrentSpread());
    this.hud.update(frameTime);
    if (this._flashedT > 0) this._flashedT = Math.max(0, this._flashedT - frameTime);

    this._netAccum += frameTime;
    // Send enough states for responsive movement, then step down slightly on
    // unstable links to reduce queueing and let interpolation absorb jitter.
    const loss = this._packetLoss() || 0;
    const stateInterval = (loss >= 5 || (this._jitter || 0) > 35) ? 1 / 20 : 1 / 30;
    if (this.net.connected && this._netAccum >= stateInterval) {
      this._netAccum = 0;
      const eye = this.movement.eyePosition, ms = this.movement.getAccuracyState();
      const state = {
        x: eye.x, y: eye.y, z: eye.z, yaw: this._bodyYaw(), pitch: this.camera.pitch,
        moving: ms.grounded && ms.speed > 0.6, wid: this.weapons.current.def.id,
        hp: Math.round(this.health), dead: this._dead, team: this._team,
        flashed: this._flashedT > 0, stance: ms.crouching ? 'crouch' : 'stand',
        muscle: this.muscle,
        grounded: ms.grounded, seq: ++this._netSeq,
        name: this.nickname || ('Player ' + (this.net.id || '')),
      };
      const now = performance.now();
      const full = !this._lastSentState || now - this._lastStateKeyframeAt >= 1000;
      const packet = { t: 'state', seq: state.seq };
      for (const [key, value] of Object.entries(state)) {
        if (key !== 'seq' && (full || this._lastSentState[key] !== value)) packet[key] = value;
      }
      if (this.net.send(packet)) {
        this._lastSentState = state;
        if (full) this._lastStateKeyframeAt = now;
      }
    }

    this._pingAccum += frameTime;
    if (this.net.connected && this._pingAccum >= 0.5) {
      this._pingAccum = 0;
      const seq = ++this._pingSeq;
      const at = performance.now();
      if (this.net.send({ t: 'ping', seq })) this._pingPending.set(seq, { at });
    }
    const nowPing = performance.now();
    for (const [seq, sent] of this._pingPending) {
      if (nowPing - sent.at > 4000) {
        this._pingPending.delete(seq);
        this._recordPingOutcome(false);
      }
    }
    if (this._lastPongAt && nowPing - this._lastPongAt > 4000) {
      this._ping = null;
      this._jitter = null;
      this._interpolationDelay = 0.12;
      this.remotePlayers.setInterpolationDelay(this._interpolationDelay);
    }
    this._networkPanelTick();
    this.remotePlayers.update(frameTime);
    this._updateSmokeEnemyVisibility();

    this.playerModel.update(this.movement.eyePosition, this._bodyYaw(), this.movement.getAccuracyState(), frameTime);

    this.viewModel.update(frameTime, this.weapons, this.movement.getAccuracyState());

    const cam = this.camera.camera;
    const vHalf = (cam.fov * Math.PI / 180) / 2;
    const hFovHalf = Math.atan(Math.tan(vHalf) * cam.aspect);

    const mmRemotes = this.mapEsp ? this.remotePlayers.positions() : this._visibleRemotes();
    this.minimap.update(this.movement.position, this.camera.yaw, this._visibleEnemies(), hFovHalf,
      mmRemotes.concat(this.bots.positions()));

    const sb = this.input.isDown('scoreboard');
    if (sb) this.hud.setScoreboard(this._scoreRows());
    this.hud.showScoreboard(sb);

    if (this.rtxOn && this._rtx) this._rtx.render();
    else this.renderer.render(this.scene, this.camera.camera);
    this.viewModel.render(this.renderer);
    if (this.esp.enabled) this.esp.render(this._espEntities());
    this.input.endFrame();
  }

  _applyAimlock() {
    if (!this.input.engaged || this.buyMenu?.isOpen || this._dead) return;
    const cam = this.camera.camera;
    cam.updateMatrixWorld();
    const eye = this.movement.eyePosition;
    const W = window.innerWidth, H = window.innerHeight;
    const ccx = W / 2, ccy = H / 2;
    const R = this._aimRadius;
    const v = this._aimDir || (this._aimDir = new THREE.Vector3());
    const fwd = this._aimFwd || (this._aimFwd = new THREE.Vector3());
    fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);

    const ray = this._enemyRay;
    const rdir = this._aimRayDir || (this._aimRayDir = new THREE.Vector3());
    let best = null, bestD = R;
    for (const e of this._enemyTargets()) {
      const tx = e.x, ty = e.chestY, tz = e.z;
      const dx = tx - eye.x, dy = ty - eye.y, dz = tz - eye.z;
      if (dx * fwd.x + dy * fwd.y + dz * fwd.z <= 0) continue;
      v.set(tx, ty, tz).project(cam);
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const d = Math.hypot(sx - ccx, sy - ccy);
      if (d >= bestD) continue;

      const dist = Math.hypot(dx, dy, dz);
      rdir.set(dx / dist, dy / dist, dz / dist);
      ray.set(eye, rdir); ray.far = dist - 0.5;
      if (ray.intersectObjects(this.occluders, true).length > 0) continue;
      bestD = d; best = { x: tx, y: ty, z: tz };
    }
    if (!best) return;

    const dx = best.x - eye.x, dy = best.y - eye.y, dz = best.z - eye.z;
    const len = Math.hypot(dx, dy, dz);
    const ux = dx / len, uy = dy / len, uz = dz / len;

    this.camera.yaw = Math.atan2(-ux, -uz) - this.camera.recoilYaw;
    this.camera.pitch = Math.asin(Math.max(-1, Math.min(1, uy))) - this.camera.recoilPitch;
  }

  _isFriendly(rp) { return !!(rp && rp._team && this._team && rp._team === this._team); }

  // Unified list of live ENEMIES for the aim cheats — non-teammate remote players
  // plus AI bots — with world positions for chest/head/feet.
  _enemyTargets() {
    const out = [];
    for (const p of this.remotePlayers.players.values()) {
      if (p.dead || this._isFriendly(p)) continue;
      const g = p.group.position;
      out.push({ x: g.x, z: g.z, feetY: g.y, chestY: g.y + 1.5, headY: g.y + 1.55, obj: p });
    }
    if (this.bots) for (const b of this.bots.list) {
      if (b._downTimer > 0) continue;
      const m = b.mesh.position; // torso center (~chest)
      out.push({ x: m.x, z: m.z, feetY: m.y - 1.11, chestY: m.y, headY: m.y + 0.47, obj: b });
    }
    return out;
  }

  // Yaw used for the broadcast state + first-person body. Spinbot makes it whirl
  // rapidly (so other players see us spinning) while our real aim is unaffected.
  _bodyYaw() {
    return this._spinbot ? (performance.now() * 0.06) % (Math.PI * 2) : this.camera.yaw;
  }

  // Launch a nuke: a missile drops from the sky onto the middle of the map and
  // detonates. Ignored if one is already in progress.
  _launchNuke() {
    if (this._nuke) return;
    const a = this._spawns.attacker.pos, d = this._spawns.defender.pos;
    const cx = (a.x + d.x) / 2, cz = (a.z + d.z) / 2;
    // We launched it: run the kill logic locally AND tell everyone else to play
    // the whole sequence (banner + falling bomb + explosion) on their screens.
    this._spawnNuke(cx, cz, true);
    if (this.net) this.net.send({ t: 'nuke', cx, cz });
  }

  // Build the falling-bomb visual + warning banner. `owner` is true only on the
  // client that launched it (that client owns the damage/kill logic); remote
  // clients replay the visuals only.
  _spawnNuke(cx, cz, owner) {
    if (this._nuke) return;
    const bomb = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.7, roughness: 0.4 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1f1f, metalness: 0.5, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.4, 18), dark);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 18), red);
    nose.position.y = -2.4; nose.rotation.x = Math.PI;
    bomb.add(body, nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.9), dark);
      fin.position.set(0, 1.6, 0); fin.rotation.y = i * Math.PI / 2;
      fin.translateZ(0.6);
      bomb.add(fin);
    }
    bomb.position.set(cx, 140, cz);
    this.scene.add(bomb);
    this._nuke = { phase: 'fall', bomb, cx, cz, groundY: 0, t: 0, fx: null, owner: !!owner };
    this._nukeBanner(true);
  }

  // Big flashing "NUKE INCOMING" warning banner.
  _nukeBanner(show) {
    let el = document.getElementById('v-nukebanner');
    if (!el) {
      if (!document.getElementById('v-nukebanner-css')) {
        const st = document.createElement('style'); st.id = 'v-nukebanner-css';
        st.textContent = '@keyframes nukeblink{50%{opacity:0.2}}';
        document.head.appendChild(st);
      }
      el = document.createElement('div');
      el.id = 'v-nukebanner';
      el.textContent = '☢ NUKE INCOMING ☢';
      el.style.cssText = 'position:fixed;top:16%;left:50%;transform:translateX(-50%);z-index:61;' +
        'pointer-events:none;font-family:inherit;font-weight:800;letter-spacing:5px;font-size:34px;' +
        'white-space:nowrap;color:#ff3b3b;text-shadow:0 0 14px rgba(255,40,40,0.85),0 2px 6px #000;' +
        'animation:nukeblink 0.55s steps(2) infinite;';
      document.body.appendChild(el);
    }
    el.style.display = show ? 'block' : 'none';
  }

  _nukeKill() {
    for (const b of this.bots.list) {
      if (b._downTimer > 0) continue;
      b.applyDamage(999999, 'body');
      this.hud.onKill({ victim: (b.label || 'BOT').toUpperCase(), weapon: 'NUKE', headshot: false });
    }
    for (const p of this.remotePlayers.players.values()) {
      if (p.dead || this._isFriendly(p)) continue;
      if (this.net) this.net.send({ t: 'hit', target: p.id, dmg: 999999, head: false });
      this.hud.onKill({ victim: (p._name || 'PLAYER').toUpperCase(), weapon: 'NUKE', headshot: false });
    }
  }

  _updateNuke(dt) {
    const n = this._nuke;
    if (!n) return;
    if (n.phase === 'fall') {
      n.bomb.position.y -= 70 * dt;
      n.bomb.rotation.y += dt * 2.5;
      if (n.bomb.position.y <= n.groundY + 1.6) {
        this.scene.remove(n.bomb);
        this._nukeBanner(false);
        if (n.owner) this._nukeKill();   // only the launcher deals the damage
        this._nukeFlash();
        this.audio?.playExplosion();
        // Explosion: fireball + rising mushroom stem & cap + ground shockwave.
        const mat = () => new THREE.MeshBasicMaterial({ color: 0xffa733, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
        const fx = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mat());
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, 1, 16), mat());
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mat());
        const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.5, 32), new THREE.MeshBasicMaterial({ color: 0xffd089, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2;
        fx.add(ball, stem, cap, ring);
        fx.position.set(n.cx, n.groundY, n.cz);
        this.scene.add(fx);
        n.fx = { group: fx, ball, stem, cap, ring };
        n.phase = 'boom'; n.t = 0;
      }
    } else if (n.phase === 'boom') {
      n.t += dt; const t = n.t, fx = n.fx;
      const br = Math.min(1, t / 0.35);
      fx.ball.scale.setScalar(2 + br * 11);
      fx.ball.material.opacity = Math.max(0, 0.95 * (1 - t / 1.3));
      const rise = Math.min(1, t / 1.7);
      fx.stem.scale.set(1 + rise * 2.5, 1 + rise * 20, 1 + rise * 2.5);
      fx.stem.position.y = rise * 10;
      fx.stem.material.opacity = Math.max(0, 0.75 * (1 - t / 2.4));
      fx.cap.scale.setScalar(3 + rise * 8);
      fx.cap.position.y = 7 + rise * 15;
      fx.cap.material.opacity = Math.max(0, 0.85 * (1 - t / 2.6));
      fx.ring.scale.setScalar(1 + t * 30);
      fx.ring.material.opacity = Math.max(0, 0.8 * (1 - t / 1.1));
      if (t > 2.8) { this.scene.remove(fx.group); this._nuke = null; }
    }
  }

  // Bright fireball flash that fades — the nuke detonation screen flash.
  _nukeFlash() {
    let el = document.getElementById('v-nuke');
    if (!el) {
      el = document.createElement('div');
      el.id = 'v-nuke';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0;' +
        'background:radial-gradient(circle at 50% 55%, #fff 0%, #ffe08a 30%, #ff7a2a 55%, rgba(120,20,0,0.6) 75%, transparent 90%);';
      document.body.appendChild(el);
    }
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 1.1s ease-out';
      el.style.opacity = '0';
    });
  }

  // Teleport the player to whatever the crosshair is pointing at (backed off a bit
  // so we don't land inside the surface), snapping onto the ground there.
  _teleportToCrosshair() {
    const eye = this.movement.eyePosition;
    const dir = this.camera.getAimDirection(new THREE.Vector3());
    let dist = Infinity, pt = null;
    // Nearest wall/crate hit.
    const rc = new THREE.Raycaster(eye, dir); rc.far = 500;
    const hits = rc.intersectObjects(this.hitSystem.colliders, true);
    if (hits.length) { dist = hits[0].distance; pt = hits[0].point.clone(); }
    // Floor plane (y=0) — the ground isn't a raycast collider, so intersect it.
    if (dir.y < -1e-3) {
      const t = -eye.y / dir.y;
      if (t > 0 && t < dist) { dist = t; pt = eye.clone().addScaledVector(dir, t); }
    }
    if (!pt || !isFinite(dist)) return;
    const nx = pt.x - dir.x * 0.6, nz = pt.z - dir.z * 0.6;
    let y = pt.y;
    const gy = this.movement.world.groundHeight(nx, nz, pt.y + 1, 3);
    if (gy != null) y = gy;
    this.movement.position.set(nx, y, nz);
    this.movement.velocity.set(0, 0, 0);
  }

  // Single source of truth for every cheat: how to read it and how to set it.
  _cheatDefs() {
    return {
      infammo:  { get: () => this.weapons.infiniteAmmo, set: (v) => { this.weapons.infiniteAmmo = v; }, on: 'INFINITE AMMO ON', off: 'INFINITE AMMO OFF' },
      nmi:      { get: () => this.weapons.noSpread, set: (v) => { this.weapons.noSpread = v; }, on: 'NO MOVEMENT INACCURACY ON', off: 'NO MOVEMENT INACCURACY OFF' },
      norecoil: { get: () => this.camera.noRecoil, set: (v) => { this.camera.noRecoil = v; if (!v) { this.camera.recoilPitch = 0; this.camera.recoilYaw = 0; } }, on: 'NO RECOIL ON', off: 'NO RECOIL OFF' },
      esp:      { get: () => this.esp.enabled, set: (v) => this.esp.setEnabled(v), on: 'ESP ON', off: 'ESP OFF' },
      aimlock:  { get: () => this.aimlock, set: (v) => { this.aimlock = v; }, on: 'AIMLOCK ON', off: 'AIMLOCK OFF' },
      trigger:  { get: () => this.triggerbot, set: (v) => { this.triggerbot = v; }, on: 'TRIGGERBOT ON', off: 'TRIGGERBOT OFF' },
      mapesp:   { get: () => this.mapEsp, set: (v) => { this.mapEsp = v; }, on: 'MAP ESP ON', off: 'MAP ESP OFF' },
      hitbox:   { get: () => this.remotePlayers.showHit, set: (v) => this.remotePlayers.setShowHitboxes(v), on: 'HITBOX VIEW ON', off: 'HITBOX VIEW OFF' },
      bhitbox:  { get: () => this.remotePlayers.bigHit, set: (v) => this.remotePlayers.setBigHitboxes(v), on: 'BIG HITBOX ON', off: 'BIG HITBOX OFF' },
      god:      { get: () => this._god, set: (v) => { this._god = v; this.hitSystem.damageMul = v ? 1e305 : 1; if (v) { this.health = 150; this.hud.setHealth(this.health); } }, on: 'GOD MODE ON', off: 'GOD MODE OFF' },
      spin:     { get: () => this._spinbot, set: (v) => { this._spinbot = v; }, on: 'SPINBOT ON', off: 'SPINBOT OFF' },
      fly:      { get: () => this.movement.fly, set: (v) => { this.movement.fly = v; this.movement.velocity.set(0, 0, 0); }, on: 'FLY ON', off: 'FLY OFF' },
      speed:    { get: () => this.movement.speedMul > 1, set: (v) => { this.movement.speedMul = v ? 2.2 : 1; }, on: 'SPEED ON', off: 'SPEED OFF' },
      rapid:    { get: () => this.weapons.rapidFire, set: (v) => { this.weapons.rapidFire = v; }, on: 'RAPID FIRE ON', off: 'RAPID FIRE OFF' },
      tp:       { get: () => !!this._tpArmed, set: (v) => { this._tpArmed = v; }, on: 'TELEPORT ARMED (press T)', off: 'TELEPORT OFF' },
      flick:    { get: () => this.flick, set: (v) => { this.flick = v; }, on: 'FLICK ON', off: 'FLICK OFF' },
    };
  }

  // Toggle a development cheat through the console code / Ctrl+P.
  _toggleCheat(name) {
    const d = this._cheatDefs()[name];
    if (!d) return null;
    const on = !d.get();
    d.set(on);
    return on ? d.on : d.off;
  }

  _allCheatsOn() {
    const defs = this._cheatDefs();
    return Object.keys(defs).every((n) => defs[n].get());
  }

  _setAllCheats(on) {
    const defs = this._cheatDefs();
    for (const name of Object.keys(defs)) {
      defs[name].set(on);
    }
  }

  _crosshairOnEnemy() {
    const eye = this.movement.eyePosition;
    const dir = this.camera.getAimDirection(this._trigDir || (this._trigDir = new THREE.Vector3()));
    const rc = this._trigRay || (this._trigRay = new THREE.Raycaster());
    rc.set(eye, dir);
    rc.far = 250;
    const hits = rc.intersectObjects(this.hitSystem.colliders, true);
    if (!hits.length) return false;
    let o = hits[0].object;
    while (o && !(o.userData && o.userData.target)) o = o.parent;
    const target = o && o.userData ? o.userData.target : null;
    if (!target) return false;
    // Live enemy remote player...
    if (target.id != null && this.remotePlayers.players.get(target.id) === target)
      return !target.dead && !this._isFriendly(target);
    // ...or a live bot.
    if (this.bots && this.bots.list.includes(target)) return target._downTimer <= 0;
    return false;
  }

  // Flick: snap aim to the nearest visible enemy head (within a wide cone of the
  // current aim), recoil-compensated, and refresh the camera so the shot fired
  // this tick lands on the head. Returns true if it locked onto someone.
  _flickToHead() {
    const eye = this.movement.eyePosition;
    const ray = this._enemyRay;
    const rdir = this._flickRay || (this._flickRay = new THREE.Vector3());
    // 360°: pick the nearest visible enemy in any direction (no aim cone).
    let best = null, bestDist = Infinity;
    for (const e of this._enemyTargets()) {
      const hx = e.x, hy = e.headY, hz = e.z;
      const dx = hx - eye.x, dy = hy - eye.y, dz = hz - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-3 || dist >= bestDist) continue;
      rdir.set(dx / dist, dy / dist, dz / dist);
      ray.set(eye, rdir); ray.far = dist - 0.5;
      if (ray.intersectObjects(this.occluders, true).length > 0) continue;
      bestDist = dist; best = { x: hx, y: hy, z: hz };
    }
    if (!best) return false;
    const dx = best.x - eye.x, dy = best.y - eye.y, dz = best.z - eye.z;
    const len = Math.hypot(dx, dy, dz);
    this.camera.yaw = Math.atan2(-dx / len, -dz / len) - this.camera.recoilYaw;
    this.camera.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len))) - this.camera.recoilPitch;
    this.camera.update(0, eye);
    return true;
  }

  // Self-bot: an AI plays the player's character. Aims at the nearest visible
  // enemy's head, moves to engage (approach / strafe / back off), fires, reloads
  // when empty, and wanders when there's nobody around. Fills `moveInput` and sets
  // `this._sbFire` / `this._sbReload` for the caller to apply to the weapon.
  _selfBotControl(dt, moveInput) {
    this._sbFire = false; this._sbReload = false;
    const eye = this.movement.eyePosition;
    const dir = this._sbDir || (this._sbDir = new THREE.Vector3());
    const ray = this._enemyRay;
    let best = null, bestDist = Infinity;
    for (const e of this._enemyTargets()) {
      const dx = e.x - eye.x, dy = e.chestY - eye.y, dz = e.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= bestDist) continue;
      ray.set(eye, dir.set(dx, dy, dz).normalize()); ray.far = dist - 0.5;
      if (ray.intersectObjects(this.occluders, true).length > 0) continue;
      bestDist = dist; best = e;
    }

    if (best) {
      const hx = best.x - eye.x, hy = best.headY - eye.y, hz = best.z - eye.z;
      const l = Math.hypot(hx, hy, hz) || 1;
      this.camera.yaw = Math.atan2(-hx / l, -hz / l) - this.camera.recoilYaw;
      this.camera.pitch = Math.max(-1.4, Math.min(1.4, Math.asin(hy / l))) - this.camera.recoilPitch;
      // Fire (pulsed so semi-autos re-fire); reload when the mag is empty.
      this._sbFireT = !this._sbFireT; this._sbFire = this._sbFireT;
      const w = this.weapons.current;
      if (!w.def.melee && w.magazine <= 0) this._sbReload = true;
      // Stand still while shooting (accurate fire) — no movement when it has a target.
    } else {
      // Nobody in sight: wander, turning occasionally.
      if (this._sbTurn == null || Math.random() < 0.01) this._sbTurn = (Math.random() - 0.5) * 1.6;
      this.camera.yaw += this._sbTurn * dt;
      moveInput.forward = true;
    }
    this.camera.update(0, eye);
  }

  _espEntities() {
    const out = [];
    for (const p of this.remotePlayers.players.values()) {
      if (p.dead) continue;
      const g = p.group.position;
      const col = this._isFriendly(p) ? '#4fc3f7' : '#ff3b3b';
      out.push({ feet: { x: g.x, y: g.y, z: g.z },
        height: 1.85, halfW: 0.34, name: (p._name || 'PLAYER').toUpperCase(), color: col });
    }
    if (this.bots) for (const b of this.bots.list) {
      if (b._downTimer > 0) continue;
      const m = b.mesh.position;
      out.push({ feet: { x: m.x, y: m.y - 1.11, z: m.z },
        height: 1.85, halfW: 0.34, name: (b.label || 'BOT').toUpperCase(), color: '#ff3b3b' });
    }
    return out;
  }

  _updateSmokeEnemyVisibility() {
    const eye = this.movement.eyePosition;
    const smoke = this.abilities;
    const reveal = this.esp.enabled;
    const chest = this._smokeChest || (this._smokeChest = new THREE.Vector3());
    // A smoke has a readable interior: enemies sharing the player's smoke
    // remain visible, while the shell continues to hide enemies outside it.
    const obscured = (target) => !smoke.sharesSmoke(eye, target, 0.55)
      && (smoke.isInsideSmoke(target, 0.55) || smoke.blocksSmokeVision(eye, target));
    // Map targets are the white training enemies shown in the screenshot.
    for (const t of this.targets) {
      if (t._downTimer > 0) continue;
      chest.set(t.mesh.position.x, t.mesh.position.y + 0.35, t.mesh.position.z);
      t.mesh.visible = reveal || !obscured(chest);
    }
    for (const p of this.remotePlayers.players.values()) {
      chest.set(p.group.position.x, p.group.position.y + 1.1, p.group.position.z);
      const hidden = !reveal && !this._isFriendly(p) && obscured(chest);
      p.setSmokeHidden(hidden);
    }
    // Local bots are enemies too. Their collision meshes stay active, so shots
    // can still travel through smoke even though the model is obscured.
    for (const b of this.bots.list) {
      if (b._downTimer > 0) continue;
      chest.set(b.mesh.position.x, b.mesh.position.y + 0.35, b.mesh.position.z);
      b.mesh.visible = reveal || !obscured(chest);
    }
  }

  _visibleEnemies() {
    const cam = this.camera.camera;
    cam.updateMatrixWorld();
    const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(m);
    const eye = this.movement.eyePosition;
    const ray = this._enemyRay;
    const out = [];
    for (const t of this.targets) {
      if (t._downTimer > 0) continue;
      const p = t.mesh.position;
      if (!frustum.containsPoint(p)) continue;
      const dir = p.clone().sub(eye);
      const dist = dir.length();
      dir.normalize();
      ray.set(eye, dir);
      ray.far = dist - 0.5;
      if (ray.intersectObjects(this.occluders, true).length === 0) out.push({ x: p.x, z: p.z });
    }
    return out;
  }

  _visibleRemotes() {
    const cam = this.camera.camera;
    cam.updateMatrixWorld();
    const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(m);
    const eye = this.movement.eyePosition;
    const ray = this._enemyRay;
    const p = new THREE.Vector3();
    const out = [];
    for (const rp of this.remotePlayers.players.values()) {
      if (rp.dead) continue;
      p.set(rp.group.position.x, rp.group.position.y + 1.1, rp.group.position.z);
      if (!frustum.containsPoint(p)) continue;
      const dir = p.clone().sub(eye);
      const dist = dir.length();
      dir.normalize();
      ray.set(eye, dir);
      ray.far = dist - 0.5;
      if (ray.intersectObjects(this.occluders, true).length === 0) {
        out.push({ x: rp.group.position.x, z: rp.group.position.z, yaw: rp.group.rotation.y });
      }
    }
    return out;
  }

  _score(id, name) {
    let s = this._scores.get(id);
    if (!s) { s = { id, name: name || ('Player ' + id), kills: 0, deaths: 0 }; this._scores.set(id, s); }
    if (name) s.name = name;
    return s;
  }
  _registerLocalKill() { this._score(this.net.id ?? 'me', this.nickname).kills++; }
  _scoreRows() {
    this._score(this.net.id ?? 'me', this.nickname);
    const myId = this.net.id ?? 'me';
    const rows = [...this._scores.values()].map((s) => ({ name: s.name, kills: s.kills, deaths: s.deaths, me: s.id === myId }));
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return rows;
  }

  setTeam(team) {
    if (team !== 'attacker' && team !== 'defender') return;
    this._team = team;
    try { localStorage.setItem('valo_team', team); } catch (_) {  }
    const sp = this._spawns[team];
    this.movement.position.copy(sp.pos);
    this.movement.velocity.set(0, 0, 0);
    this.camera.yaw = sp.yaw; this.camera.pitch = 0;

    this.remotePlayers?.setMyTeam(team);
  }

  _refreshActiveMapColliders() {
    const map = this._activeMap;
    if (!map) return;
    this.hitSystem.setColliders(map.colliders);
    this.occluders = map.colliders.filter((c) => !(c.userData && c.userData.target));
  }

  _setActiveMap(mode) {
    const map = this._maps?.[mode];
    if (!map || this._mapMode === mode) return;
    this._mapMode = mode;
    this._activeMap = map;
    this._arena = { areas: map.areas, walls: map.walls, covers: map.covers, bounds: map.bounds };
    this._surfMats = map.materials || {};
    this.targets = map.targets || [];
    this._spawns = map.spawns;
    this.bots = mode === 'range' ? this.rangeBots : this.homeBots;
    this.movement.world = map.world;
    this.movement.velocity.set(0, 0, 0);
    this.movement.position.copy(map.spawns[this._team]?.pos || map.spawns.attacker.pos);
    this.camera.yaw = map.spawns[this._team]?.yaw ?? map.spawns.attacker.yaw;
    this.camera.pitch = 0;
    this._refreshActiveMapColliders();
    this.minimap?.setMap({
      ...map,
      walls: map._minimapWalls || map.walls,
      covers: map._minimapCovers || map.covers,
    });
    this.weapons.refillAll();
    this.health = 150;
    this.hud.setHealth(this.health);
    this.hud.setTrainingVisible(mode === 'range');
    if (mode === 'range') this._resetTrainingStats();
  }

  _resetTrainingStats() {
    this._trainingStats = { shots: 0, hits: 0, headshots: 0 };
    this.hud?.setTrainingStats(this._trainingStats);
  }

  _registerTrainingShot(result) {
    if (this._mapMode !== 'range' || !result) return;
    this._trainingStats.shots++;
    if (result.hit) this._trainingStats.hits++;
    if (result.headshot) this._trainingStats.headshots++;
    this.hud?.setTrainingStats(this._trainingStats);
  }

  _setControlMode(mode) {
    if (mode !== 'mobile' && mode !== 'desktop') return;
    this.controlMode = mode;
    this._isMobile = mode === 'mobile';
    if (this.touch) {
      this.touch.engaged = false;
      this.touch.setVisible(false);
    }
    try { localStorage.setItem('valo_control_mode', mode); } catch (_) { /* ignore */ }
  }

  _takeDamage(dmg, head, byId) {
    if (this._god) return;
    if (this._dead || !dmg) return;
    if (byId != null) this._lastAttacker = byId;
    let d = dmg;
    if (this.shield > 0) { const a = Math.min(this.shield, d); this.shield -= a; d -= a; this.hud.setShield(this.shield); }
    this.health = Math.max(0, this.health - d);
    this.hud.setHealth(this.health);
    this.hud.showDamage(Math.min(1.4, dmg / 45));
    if (this.health <= 0) this._die(true);
  }

  _die(report) {
    if (this._dead) return;
    this._dead = true;
    this._score(this.net.id ?? 'me', this.nickname).deaths++;
    // Bots are local-only; their damage still follows the old local path.
    // Multiplayer deaths are emitted by the relay after it updates HP.
    if (report && this.net?.connected) this.net.send({ t: 'death', by: this._lastAttacker });

    try { document.exitPointerLock?.(); } catch (_) {  }
    this.input.pointerLocked = false;

    if (this._overlay) this._overlay.style.display = 'none';
    this.hud.showDeath(() => this._respawn());
  }

  _respawn() {
    this.health = 150; this._dead = false;
    const sp = this._spawns[this._team];
    this.movement.position.copy(sp.pos);
    this.movement.velocity.set(0, 0, 0);
    this.camera.yaw = sp.yaw; this.camera.pitch = 0;
    this.weapons.refillAll();
    this.hud.setHealth(this.health);
    this.hud.hideDeath();

    if (this.net?.connected) this.net.send({ t: 'respawn' });

    this.input.requestPointerLock(this.renderer.domElement);
  }

  _fixedUpdate(dt) {
    const locked = this.input.engaged && !this.buyMenu?.isOpen && !this._dead;

    const moveInput = locked ? {
      forward: this.input.isDown('moveForward'),
      back: this.input.isDown('moveBack'),
      left: this.input.isDown('moveLeft'),
      right: this.input.isDown('moveRight'),
      jump: this.input.wasPressed('jump'),
      jumpHeld: this.input.isDown('jump'),
      crouchHeld: this.input.isDown('crouch'),
      silentHeld: this.input.isDown('silentWalk'),
    } : { forward: false, back: false, left: false, right: false, jump: false, jumpHeld: false, crouchHeld: false, silentHeld: false };

    // Self-bot drives movement + aim before the movement/basis are read.
    if (this.selfbot && locked) this._selfBotControl(dt, moveInput);

    // Stand still while the smoke tablet is open.
    if (this.abilities.tablet) { moveInput.forward = moveInput.back = moveInput.left = moveInput.right = false; moveInput.jump = false; }

    const basis = this.camera.getMoveBasis();
    this.movement.update(dt, moveInput, basis);

    const weaponActions = locked ? {
      fireDown: this.input.isDown('fire'),
      altDown: this.input.isDown('altAction'),
      reloadPressed: this.input.wasPressed('reload'),
      slotPrimary: this.input.wasPressed('slotPrimary'),
      slotSecondary: this.input.wasPressed('slotSecondary'),
      slotMelee: this.input.wasPressed('slotMelee'),
    } : { fireDown: false, altDown: false, reloadPressed: false, slotPrimary: false, slotSecondary: false, slotMelee: false };

    if (this.selfbot && locked) {
      weaponActions.fireDown = this._sbFire;
      if (this._sbReload) weaponActions.reloadPressed = true;
    }

    if (this.triggerbot && locked) {
      if (this._crosshairOnEnemy()) {
        if (this._trigRelease) this._trigRelease = false;
        else { weaponActions.fireDown = true; this._trigRelease = true; }
      } else this._trigRelease = false;
    }

    // Flick: while firing, snap aim to the nearest enemy head before the shot.
    if (this.flick && locked && weaponActions.fireDown && !this.weapons.current.def.melee) {
      this._flickToHead();
    }

    // While the curveball is equipped, clicks throw the flash — not shots/ADS.
    if (this.abilities.armed || this.abilities.tablet) { weaponActions.fireDown = false; weaponActions.altDown = false; }

    this.weapons.update(dt, weaponActions);

    if (locked && this.input.wasPressed('inspect')) this.viewModel.startInspect();

    this.audio.updateFootsteps(dt, this.movement.getAccuracyState());
  }
}

window.addEventListener('DOMContentLoaded', () => { window.__valo = new Game(); });
