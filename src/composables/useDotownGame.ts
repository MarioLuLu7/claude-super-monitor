import { ref, watch, onMounted, onUnmounted } from 'vue';
import * as PIXI from 'pixi.js';
import type { StatusLevel } from '../types';

// ============================================================
// 勇者克劳德大冒险 - 使用 DOTOWN 真实素材
// 每个工具状态都有独特的视觉表现
// ============================================================

const ASSET_BASE = '/game-assets/dotown/';

const ASSETS = {
  hero:         ASSET_BASE + 'hero.png',
  alien_green:  ASSET_BASE + 'alien_green.png',
  alien_blue:   ASSET_BASE + 'alien_blue.png',
  alien_pink:   ASSET_BASE + 'alien_pink.png',
  king_flying:  ASSET_BASE + 'king_flying.png',
  pegasus:      ASSET_BASE + 'pegasus.png',
  centaur:      ASSET_BASE + 'centaur.png',
  // DOTOWN 素材扩展
  cat:          ASSET_BASE + 'thing_cats_13.png',
  snail:        ASSET_BASE + 'thing_snails_01.png',
  pumpkin:      ASSET_BASE + 'person_pumpkin_man_01.png',
  tengu:        ASSET_BASE + 'person_tengu_02.png',
  damon_03:     ASSET_BASE + 'person_damon_03.png',
  damon_04:     ASSET_BASE + 'person_damon_04.png',
  damon_06:     ASSET_BASE + 'person_damon_06.png',
  daruma:       ASSET_BASE + 'other_darumaotoshi_01.png',
  moon:         ASSET_BASE + 'other_moon_01.png',
  light_bulb:   ASSET_BASE + 'other_light_bulb_01.png',
  book_03:      ASSET_BASE + 'other_book_03.png',
  book_06:      ASSET_BASE + 'other_book_06.png',
  magnifying:   ASSET_BASE + 'other_magnifyingglass_01.png',
  map:          ASSET_BASE + 'other_map_01.png',
  cloud:        ASSET_BASE + 'town_cloud_01.png',
  thunder:      ASSET_BASE + 'other_thunder_01.png',
  sushi:        ASSET_BASE + 'food_spamsushi_02.png',
  pine_tree:    ASSET_BASE + 'plant_matu_01.png',
  needle_tree:  ASSET_BASE + 'plant_needle_leaved_tree_01.png',
  morning_glory: ASSET_BASE + 'plant_morning_glory_01.png',
  green_tree:   ASSET_BASE + 'plant_tree_green_04.png',
};

// 工具状态颜色映射
const STATUS_COLORS: Record<string, number> = {
  thinking:   0xffd93d,
  working:    0x4ecdc4,
  done:       0x6bcb77,
  auth:       0xff6b6b,
  error:      0xff4757,
  idle:       0xa29bfe,
  reading:    0xaa66ff,
  writing:    0x66ffaa,
  searching:  0x00ccff,
  planning:   0xffaa00,
  agent:      0xff66dd,
  web:        0x6699ff,
  ask:        0xff9966,
  notebook:   0x99ff66,
  bash:       0x66ffff,
};

// 状态图标
const STATUS_ICONS: Record<string, string> = {
  thinking:   '💭',
  working:    '🔧',
  done:       '✓',
  auth:       '?',
  error:      '✗',
  idle:       '💤',
  reading:    '📖',
  writing:    '✎',
  searching:  '🔍',
  planning:   '📋',
  agent:      '👥',
  web:        '🌐',
  ask:        '❓',
  notebook:   '📓',
  bash:       '⚡',
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// 工具状态分类器
function classifyStatusKey(key: string): StatusLevel {
  const k = key.toLowerCase();
  if (k.includes('read')) return 'reading';
  if (k.includes('write') || k.includes('edit') || k.includes('multiedit')) return 'writing';
  if (k.includes('glob') || k.includes('grep') || k.includes('search')) return 'searching';
  if (k.includes('plan') || k.includes('exit_plan') || k.includes('enter_plan')) return 'planning';
  if (k.includes('agent')) return 'agent';
  if (k.includes('web') || k.includes('fetch')) return 'web';
  if (k.includes('ask') || k.includes('ask_user')) return 'ask';
  if (k.includes('notebook')) return 'notebook';
  if (k.includes('bash')) return 'bash';
  if (k.includes('thinking')) return 'thinking';
  if (k.includes('done')) return 'done';
  if (k.includes('auth_req') || k.includes('auth_deny')) return 'auth';
  if (k.includes('error') || k.includes('interrupted')) return 'error';
  if (k.includes('idle') || k.includes('user_input')) return 'idle';
  return 'working';
}

export function useDotownGame(
  canvasRef: { value: HTMLCanvasElement | null },
  containerSize: { value: { width: number; height: number } },
  initialConfig: {
    projectName: string;
    tokens: number;
    statusLevel: StatusLevel;
    statusKey: string;
    statusDetail?: string;
  }
) {
  const isReady = ref(false);
  let app: PIXI.Application | null = null;

  // 初始化时对状态进行分类（根据 key 确定真实 level）
  let currentLevel: StatusLevel = initialConfig.statusKey
    ? classifyStatusKey(initialConfig.statusKey)
    : initialConfig.statusLevel;
  let currentKey: string = initialConfig.statusKey;
  let currentTokens: number = initialConfig.tokens;
  let currentProjectName: string = initialConfig.projectName;

  let bgLayer: PIXI.Container;
  let worldLayer: PIXI.Container;
  let fxLayer: PIXI.Container;
  let hudLayer: PIXI.Container;

  let heroSprite: PIXI.Sprite | null = null;
  let enemySprite: PIXI.Sprite | null = null;
  let bossSprite: PIXI.Sprite | null = null;
  let mountSprite: PIXI.Sprite | null = null;
  let miniSprites: PIXI.Sprite[] = [];
  let propGraphics: PIXI.Graphics | null = null;

  let questLabel: PIXI.Text | null = null;
  let statusLabel: PIXI.Text | null = null;
  let tokenLabel: PIXI.Text | null = null;
  let expBar: PIXI.Graphics | null = null;
  let hpBar: PIXI.Graphics | null = null;
  let dialogBubble: PIXI.Container | null = null;
  let bgGraphics: PIXI.Graphics | null = null;
  let groundGraphics: PIXI.Graphics | null = null;

  let heroTargetX = 0;
  let heroBounce = 0;
  let heroFlip = false;
  let enemyTargetX = 0;
  let enemyShakeX = 0;
  let enemyBounce = 0;
  let tick = 0;
  let particles: Array<{ g: PIXI.Graphics; vx: number; vy: number; life: number; maxLife: number; color: number }> = [];

  // 场景过渡动画状态
  interface TransitionState {
    active: boolean;
    progress: number;
    fromLevel: StatusLevel | null;
    toLevel: StatusLevel;
    oldSprites: PIXI.Sprite[];
    oldBgColor: number;
  }
  let transitionState: TransitionState = {
    active: false,
    progress: 0,
    fromLevel: null,
    toLevel: 'idle',
    oldSprites: [],
    oldBgColor: 0x1a1a2e,
  };
  // 背景颜色缓存用于过渡
  const BG_COLOR_CACHE: Record<string, number> = {
    thinking: 0x1a1a5e,
    working: 0x0d1b2a,
    done: 0x1a472a,
    auth: 0x4a0e0e,
    error: 0x3d0000,
    idle: 0x0f0f23,
    reading: 0x2a1a5e,
    writing: 0x1a5e3a,
    searching: 0x0d3b5a,
    planning: 0x5e4a1a,
    agent: 0x5e1a4a,
    web: 0x1a3a6e,
    ask: 0x6e3a1a,
    notebook: 0x3a5e1a,
    bash: 0x1a5e5e,
  };

  const HERO_SCALE = 0.1;
  const ENEMY_SCALE = 0.08;
  const W = 400;
  const H = 280;
  const GROUND_Y = 200;
  const SKY_H = GROUND_Y;

  const FONT_STYLE = new PIXI.TextStyle({
    fontFamily: '"Press Start 2P", "Zpix", monospace',
    fontSize: 8,
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 2,
  });

  const FONT_SMALL = new PIXI.TextStyle({ ...FONT_STYLE, fontSize: 7, fill: 0xdddddd });
  const FONT_TITLE = new PIXI.TextStyle({ fontFamily: '"Press Start 2P", monospace', fontSize: 7, fill: 0xffff00, stroke: 0x000000, strokeThickness: 3 });

  // ─── 初始化 ───────────────────────────────────────────────

  async function init() {
    const canvas = canvasRef.value;
    if (!canvas) {
      console.error('[DOTOWN] Canvas is null!');
      return;
    }
    console.log('[DOTOWN] Starting init...');

    app = new PIXI.Application({
      view: canvas,
      width: W,
      height: H,
      backgroundColor: 0x1a1a2e,
      antialias: false,
      resolution: 1,
    });
    console.log('[DOTOWN] Pixi app created');

    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

    bgLayer = new PIXI.Container();
    worldLayer = new PIXI.Container();
    fxLayer = new PIXI.Container();
    hudLayer = new PIXI.Container();
    app.stage.addChild(bgLayer, worldLayer, fxLayer, hudLayer);
    console.log('[DOTOWN] Layers created, worldLayer children:', worldLayer.children.length);

    // 先加载所有图片资源
    console.log('[DOTOWN] Loading textures...');
    await loadAllTextures();
    console.log('[DOTOWN] Textures loaded, cache size:', textureCache.size);
    console.log('[DOTOWN] Cached URLs:', Array.from(textureCache.keys()));

    buildBackground();
    buildHUD();
    console.log('[DOTOWN] Building characters...');
    buildCharacters();
    console.log('[DOTOWN] Characters built, hero:', heroSprite);
    console.log('[DOTOWN] worldLayer children after buildCharacters:', worldLayer.children.length);
    updateScene(currentLevel, currentKey);

    app.ticker.add(gameLoop);
    resizeCanvas();
    isReady.value = true;
    console.log('[DOTOWN] Init complete!');
  }

  // 纹理缓存
  const textureCache = new Map<string, PIXI.Texture>();

  async function loadAllTextures() {
    const promises = Object.values(ASSETS).map(url => loadTexture(url));
    await Promise.all(promises);
  }

  function loadTexture(url: string): Promise<void> {
    return new Promise((resolve) => {
      // 添加超时保护，确保即使事件不触发也能继续
      const timeout = setTimeout(() => {
        console.warn('[DOTOWN] Texture load timeout:', url);
        resolve();
      }, 5000);

      console.log('[DOTOWN] loadTexture:', url);
      // 检查缓存中的纹理是否仍然有效
      const cached = textureCache.get(url);
      if (cached && cached.baseTexture && cached.baseTexture.valid) {
        console.log('[DOTOWN] Already cached and valid:', url);
        clearTimeout(timeout);
        resolve();
        return;
      }
      // 如果缓存无效，移除它
      if (cached) {
        console.log('[DOTOWN] Removing invalid cached texture:', url);
        textureCache.delete(url);
      }

      const texture = PIXI.Texture.from(url);
      console.log('[DOTOWN] Created texture, valid:', texture.baseTexture.valid);

      if (texture.baseTexture.valid) {
        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        textureCache.set(url, texture);
        console.log('[DOTOWN] Texture cached:', url, 'size:', texture.width, 'x', texture.height);
        clearTimeout(timeout);
        resolve();
      } else {
        texture.baseTexture.on('loaded', () => {
          texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
          textureCache.set(url, texture);
          console.log('[DOTOWN] Texture loaded async:', url, 'size:', texture.width, 'x', texture.height);
          clearTimeout(timeout);
          resolve();
        });
        texture.baseTexture.on('error', () => {
          console.error('[DOTOWN] Failed to load:', url);
          clearTimeout(timeout);
          resolve(); // 继续，使用占位符
        });
      }
    });
  }

  function getTexture(url: string): PIXI.Texture {
    console.log('[DOTOWN] getTexture called:', url);
    const cached = textureCache.get(url);
    // 检查纹理是否存在且仍然有效
    if (cached && cached.baseTexture && cached.baseTexture.valid) {
      console.log('[DOTOWN] Found cached texture:', url, 'size:', cached.width, 'x', cached.height);
      return cached;
    }

    // 如果纹理无效或不存在，从缓存中移除并重新创建
    if (cached) {
      console.log('[DOTOWN] Cached texture invalid, removing:', url);
      textureCache.delete(url);
    }

    console.error('[DOTOWN] Texture NOT found in cache:', url);
    console.log('[DOTOWN] Cache contents:', Array.from(textureCache.keys()));
    // 创建粉色占位符
    const g = new PIXI.Graphics();
    g.beginFill(0xff00ff);
    g.drawRect(0, 0, 16, 16);
    g.endFill();
    return app!.renderer.generateTexture(g);
  }

  function makeSprite(url: string, scale = 3): PIXI.Sprite {
    console.log('[DOTOWN] makeSprite:', url, 'scale:', scale);
    const texture = getTexture(url);
    console.log('[DOTOWN] Got texture:', texture ? 'yes' : 'no', 'valid:', texture?.baseTexture?.valid);
    const s = new PIXI.Sprite(texture);
    s.scale.set(scale);
    s.anchor.set(0.5, 1);
    console.log('[DOTOWN] Sprite created, size:', s.width, 'x', s.height, 'position:', s.x, s.y);
    return s;
  }

  // ─── 背景 ─────────────────────────────────────────────────

  function buildBackground() {
    bgGraphics = new PIXI.Graphics();
    bgLayer.addChild(bgGraphics);

    const cloudContainer = new PIXI.Container();
    bgLayer.addChild(cloudContainer);
    (bgLayer as any).__clouds = cloudContainer;

    for (let i = 0; i < 4; i++) {
      const cloud = makeCloud();
      cloud.x = Math.random() * W;
      cloud.y = 20 + Math.random() * 60;
      cloudContainer.addChild(cloud);
    }

    groundGraphics = new PIXI.Graphics();
    bgLayer.addChild(groundGraphics);
    drawBackground(currentLevel);
  }

  function makeCloud(): PIXI.Graphics {
    const g = new PIXI.Graphics();
    g.beginFill(0xffffff, 0.85);
    const blocks = [[2,1],[1,1],[3,1],[0,0],[1,0],[2,0],[3,0],[4,0],[1,-1],[2,-1],[3,-1]];
    for (const [bx, by] of blocks) {
      g.drawRect(bx * 6, by * 6, 6, 6);
    }
    g.endFill();
    (g as any).__speed = 0.2 + Math.random() * 0.3;
    return g;
  }

  function drawBackground(level: StatusLevel) {
    if (!bgGraphics || !groundGraphics) return;

    bgGraphics.clear();

    // 根据状态和级别定制天空颜色
    const skyColors: Record<string, [number, number]> = {
      thinking:   [0x1a1a5e, 0x3a3aaa],
      working:    [0x0d1b2a, 0x1b4f72],
      done:       [0x1a472a, 0x2d8653],
      auth:       [0x4a0e0e, 0x8b1a1a],
      error:      [0x3d0000, 0x660000],
      idle:       [0x0f0f23, 0x1a1a3e],
      reading:    [0x2a1a5e, 0x5a3aaa],
      writing:    [0x1a5e3a, 0x3aaa6a],
      searching:  [0x0d3b5a, 0x1a7fb4],
      planning:   [0x5e4a1a, 0xaa8a3a],
      agent:      [0x5e1a4a, 0xaa3a8a],
      web:        [0x1a3a6e, 0x3a7acc],
      ask:        [0x6e3a1a, 0xcc7a3a],
      notebook:   [0x3a5e1a, 0x6aaa3a],
      bash:       [0x1a5e5e, 0x3aaaaa],
    };

    const [c1, c2] = skyColors[level] ?? skyColors.idle;
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
      const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
      const r = Math.round(lerp(r1, r2, t));
      const g = Math.round(lerp(g1, g2, t));
      const b = Math.round(lerp(b1, b2, t));
      bgGraphics.beginFill((r << 16) | (g << 8) | b);
      bgGraphics.drawRect(0, i * (SKY_H / steps), W, SKY_H / steps + 1);
      bgGraphics.endFill();
    }

    // 山丘
    bgGraphics.beginFill(0x000000, 0.3);
    const hills = [[0,160,60,40],[50,155,70,45],[110,158,55,42],[155,153,80,47],[225,157,65,43],[280,150,90,50],[360,155,70,45]];
    for (const [hx, hy, hw, hh] of hills) {
      for (let row = 0; row < hh; row++) {
        const w = hw * Math.sqrt(1 - (row / hh) ** 2);
        bgGraphics.drawRect(hx + (hw - w) / 2, hy + row, w, 1);
      }
    }
    bgGraphics.endFill();

    // 星星/粒子效果
    if (level === 'idle' || level === 'thinking' || level === 'planning') {
      bgGraphics.beginFill(0xffffff);
      for (let i = 0; i < 30; i++) {
        const sx = (i * 137.5) % W;
        const sy = (i * 83.7) % (SKY_H * 0.8);
        bgGraphics.drawRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
      }
      bgGraphics.endFill();
    }

    // 地面
    groundGraphics.clear();
    const groundColors: Record<string, [number, number]> = {
      thinking:   [0x2d5a1b, 0x1b3d0f],
      working:    [0x2d5a1b, 0x1b3d0f],
      done:       [0x4caf50, 0x388e3c],
      auth:       [0x8b3a3a, 0x6b2020],
      error:      [0x5d2e0c, 0x3e1f08],
      idle:       [0x2d5a1b, 0x1b3d0f],
      reading:    [0x4a2d8b, 0x3a1d6b],
      writing:    [0x2d8b5a, 0x1d6b3a],
      searching:  [0x1d6b9b, 0x0d4b7b],
      planning:   [0x8b6d2d, 0x6b4d1d],
      agent:      [0x8b2d6d, 0x6b1d4d],
      web:        [0x2d4d9b, 0x1d3d7b],
      ask:        [0x9b5d2d, 0x7b3d1d],
      notebook:   [0x4d9b2d, 0x3d7b1d],
      bash:       [0x2d8b8b, 0x1d6b6b],
    };
    const [groundColor, groundDark] = groundColors[level] ?? groundColors.idle;

    groundGraphics.beginFill(groundColor);
    groundGraphics.drawRect(0, GROUND_Y, W, H - GROUND_Y);
    groundGraphics.endFill();

    groundGraphics.beginFill(groundDark, 0.5);
    for (let gx = 0; gx < W; gx += 16) groundGraphics.drawRect(gx, GROUND_Y, 1, H - GROUND_Y);
    for (let gy = GROUND_Y; gy < H; gy += 8) groundGraphics.drawRect(0, gy, W, 1);
    groundGraphics.endFill();

    groundGraphics.beginFill(0xffffff, 0.2);
    groundGraphics.drawRect(0, GROUND_Y, W, 2);
    groundGraphics.endFill();
  }

  // ─── HUD ──────────────────────────────────────────────────

  function buildHUD() {
    const hudBg = new PIXI.Graphics();
    hudBg.beginFill(0x000000, 0.7);
    hudBg.drawRect(0, 0, W, 28);
    hudBg.endFill();
    hudLayer.addChild(hudBg);

    questLabel = new PIXI.Text('', FONT_TITLE);
    questLabel.x = 8;
    questLabel.y = 5;
    hudLayer.addChild(questLabel);

    tokenLabel = new PIXI.Text('', FONT_SMALL);
    tokenLabel.anchor.set(1, 0);
    tokenLabel.x = W - 6;
    tokenLabel.y = 5;
    hudLayer.addChild(tokenLabel);

    const expBg = new PIXI.Graphics();
    expBg.beginFill(0x333333);
    expBg.drawRect(6, 18, W - 12, 6);
    expBg.endFill();
    hudLayer.addChild(expBg);

    expBar = new PIXI.Graphics();
    hudLayer.addChild(expBar);

    const statusBg = new PIXI.Graphics();
    statusBg.beginFill(0x000000, 0.75);
    statusBg.drawRect(0, H - 24, W, 24);
    statusBg.endFill();
    hudLayer.addChild(statusBg);

    const hpBg = new PIXI.Graphics();
    hpBg.beginFill(0x444444);
    hpBg.drawRect(6, H - 18, 80, 6);
    hpBg.endFill();
    hudLayer.addChild(hpBg);

    hpBar = new PIXI.Graphics();
    hudLayer.addChild(hpBar);

    const hpLabel = new PIXI.Text('HP', FONT_SMALL);
    hpLabel.x = 8;
    hpLabel.y = H - 18;
    hudLayer.addChild(hpLabel);

    statusLabel = new PIXI.Text('', FONT_STYLE);
    statusLabel.x = 100;
    statusLabel.y = H - 19;
    hudLayer.addChild(statusLabel);

    dialogBubble = new PIXI.Container();
    dialogBubble.visible = false;
    hudLayer.addChild(dialogBubble);

    updateHUD();
  }

  function updateHUD() {
    if (!questLabel || !tokenLabel || !expBar || !hpBar || !statusLabel) return;

    const color = STATUS_COLORS[currentLevel] ?? STATUS_COLORS.idle;
    const name = currentProjectName.slice(0, 16).toUpperCase();
    questLabel.text = `⚔ ${name}`;

    const expK = currentTokens >= 1000 ? `${(currentTokens / 1000).toFixed(1)}K` : `${currentTokens}`;
    tokenLabel.text = `EXP:${expK}`;

    expBar.clear();
    const expPct = Math.min(1, currentTokens / 200000);
    expBar.beginFill(color);
    expBar.drawRect(6, 18, Math.floor((W - 12) * expPct), 6);
    expBar.endFill();

    hpBar.clear();
    const hpPct = Math.max(0, 1 - currentTokens / 200000);
    const hpColor = hpPct > 0.6 ? 0x4caf50 : hpPct > 0.3 ? 0xffc107 : 0xf44336;
    hpBar.beginFill(hpColor);
    hpBar.drawRect(6, H - 18, Math.floor(80 * hpPct), 6);
    hpBar.endFill();

    const icon = STATUS_ICONS[currentLevel] ?? STATUS_ICONS.working;
    statusLabel.text = `${icon} ${getStatusText(currentLevel, currentKey)}`;
    statusLabel.style.fill = color;
  }

  function getStatusText(level: StatusLevel, key: string): string {
    const keyMap: Record<string, string> = {
      tool_bash: '执行脚本',
      tool_write: '写入文件',
      tool_read: '读取文件',
      tool_edit: '更新文件',
      tool_multiedit: '多处编辑',
      tool_glob: '搜索文件',
      tool_grep: '搜索内容',
      tool_todo: '任务列表',
      tool_agent: '子代理',
      tool_webfetch: '请求网页',
      tool_websearch: '搜索网络',
      tool_exit_plan: '生成计划',
      tool_enter_plan: '规划模式',
      tool_ask_user: '等待选择',
      tool_notebook: '编辑笔记',
      tool_call: '调用工具',
      status_thinking: '思考中',
      status_done: '已完成',
      status_user_input: '等待输入',
      status_auth_req: '需要确认',
      status_auth_deny: '需要授权',
      status_interrupted: '已中断',
    };
    return keyMap[key] ?? level.toUpperCase();
  }

  function showDialogBubble(text: string, heroX: number, heroY: number) {
    if (!dialogBubble) return;
    dialogBubble.removeChildren();
    dialogBubble.visible = true;

    const padding = 6;
    const textObj = new PIXI.Text(text, { fontFamily: '"Zpix", monospace', fontSize: 10, fill: 0x000000, wordWrap: true, wordWrapWidth: 100 });
    const bw = textObj.width + padding * 2;
    const bh = textObj.height + padding * 2;

    const bg = new PIXI.Graphics();
    bg.beginFill(0xffffff);
    bg.lineStyle(2, 0x000000);
    bg.drawRect(0, 0, bw, bh);
    bg.endFill();
    bg.beginFill(0xffffff);
    bg.moveTo(8, bh);
    bg.lineTo(16, bh + 8);
    bg.lineTo(20, bh);
    bg.closePath();
    bg.endFill();

    textObj.x = padding;
    textObj.y = padding;
    dialogBubble.addChild(bg, textObj);
    dialogBubble.x = Math.max(4, Math.min(W - bw - 4, heroX - bw / 2));
    dialogBubble.y = Math.max(32, heroY - bh - 20);
  }

  function hideDialogBubble() {
    if (dialogBubble) dialogBubble.visible = false;
  }

  // ─── 角色 ─────────────────────────────────────────────────

  function buildCharacters() {
    heroSprite = makeSprite(ASSETS.hero, HERO_SCALE);
    heroSprite.x = 80;
    heroSprite.y = GROUND_Y;
    worldLayer.addChild(heroSprite);
    heroTargetX = heroSprite.x;
  }

  function setEnemy(url: string, scale = ENEMY_SCALE, x = 300) {
    if (enemySprite) {
      worldLayer.removeChild(enemySprite);
      enemySprite.destroy();
    }
    enemySprite = makeSprite(url, scale);
    enemySprite.x = x;
    enemySprite.y = GROUND_Y;
    enemySprite.scale.x = scale;
    worldLayer.addChild(enemySprite);
    enemyTargetX = x;
  }

  function setBoss(url: string, scale = 0.1, x = 280) {
    if (bossSprite) {
      worldLayer.removeChild(bossSprite);
      bossSprite.destroy();
    }
    bossSprite = makeSprite(url, scale);
    bossSprite.x = x;
    bossSprite.y = GROUND_Y - 40;
    bossSprite.alpha = 0;
    worldLayer.addChild(bossSprite);
  }

  function setMount(url: string, scale = HERO_SCALE, x = 200) {
    if (mountSprite) {
      worldLayer.removeChild(mountSprite);
      mountSprite.destroy();
    }
    mountSprite = makeSprite(url, scale);
    mountSprite.x = x;
    mountSprite.y = GROUND_Y - 30;
    mountSprite.alpha = 0;
    worldLayer.addChild(mountSprite);
  }

  function addMiniSprite(url: string, scale = 0.04, x = 200, y = GROUND_Y) {
    const s = makeSprite(url, scale);
    s.x = x;
    s.y = y;
    worldLayer.addChild(s);
    miniSprites.push(s);
    return s;
  }

  // ─── 场景逻辑 ─────────────────────────────────────────────

  // 获取所有当前场景精灵（用于过渡）
  function getCurrentSprites(): PIXI.Sprite[] {
    const sprites: PIXI.Sprite[] = [];
    if (enemySprite) sprites.push(enemySprite);
    if (bossSprite) sprites.push(bossSprite);
    if (mountSprite) sprites.push(mountSprite);
    sprites.push(...miniSprites);
    return sprites;
  }

  function updateScene(level: StatusLevel, key: string = currentKey) {
    // 如果正在过渡中，立即完成之前的过渡
    if (transitionState.active) {
      finishTransition();
    }

    // 保存当前状态用于过渡
    const oldSprites = getCurrentSprites();
    const fromLevel = currentLevel;
    const fromColor = BG_COLOR_CACHE[fromLevel] ?? BG_COLOR_CACHE.idle;

    // 开始新的过渡 - 直接修改对象属性，不要重新赋值，避免闭包引用问题
    transitionState.active = true;
    transitionState.progress = 0;
    transitionState.fromLevel = fromLevel;
    transitionState.toLevel = level;
    transitionState.oldSprites = oldSprites;
    transitionState.oldBgColor = fromColor;

    // 旧精灵淡出
    for (const sprite of oldSprites) {
      (sprite as any).__transitionOut = true;
      (sprite as any).__transitionSpeed = 0.05 + Math.random() * 0.03;
    }

    // 清空管理数组，但保留精灵在场景中用于过渡动画
    // 旧精灵现在只由 transitionState.oldSprites 管理
    miniSprites = [];
    if (enemySprite) { enemySprite = null; }
    if (bossSprite)  { bossSprite = null; }
    if (mountSprite) { mountSprite = null; }
    if (propGraphics) { worldLayer.removeChild(propGraphics); propGraphics.destroy(); propGraphics = null; }
    clearParticles();
    hideDialogBubble();

    // 新场景设置（精灵初始透明）
    setupNewScene(level, key);

    // 新精灵淡入
    const newSprites = getCurrentSprites();
    for (const sprite of newSprites) {
      sprite.alpha = 0;
      (sprite as any).__transitionIn = true;
      (sprite as any).__transitionSpeed = 0.08 + Math.random() * 0.04;
    }

    updateHUD();
  }

  function setupNewScene(level: StatusLevel, key: string = currentKey) {
    drawBackground(level);

    switch (level) {
      case 'idle': setupIdle(); break;
      case 'thinking': setupThinking(); break;
      case 'working': setupWorking(key); break;
      case 'done': setupDone(); break;
      case 'auth': setupAuth(); break;
      case 'error': setupError(); break;
      case 'reading': setupReading(); break;
      case 'writing': setupWriting(key); break;
      case 'searching': setupSearching(key); break;
      case 'planning': setupPlanning(); break;
      case 'agent': setupAgent(); break;
      case 'web': setupWeb(); break;
      case 'ask': setupAsk(); break;
      case 'notebook': setupNotebook(); break;
      case 'bash': setupBash(); break;
      default: setupIdle();
    }
  }

  function finishTransition() {
    // 确保所有新精灵完全可见
    const newSprites = getCurrentSprites();
    for (const sprite of newSprites) {
      sprite.alpha = 1;
      (sprite as any).__transitionIn = false;
    }

    // 清理旧精灵
    for (const sprite of transitionState.oldSprites) {
      if (sprite) {
        if (sprite.parent) {
          sprite.parent.removeChild(sprite);
        }
        sprite.destroy();
      }
    }
    transitionState.active = false;
    transitionState.oldSprites = [];
  }

  // ─── 各状态场景设置 ────────────────────────────────────────

  // 💤 闲置 - 夜晚休息，月亮高挂，猫咪陪伴
  function setupIdle() {
    heroTargetX = 100;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 月亮挂在天空
    const moonSprite = makeSprite(ASSETS.moon, 0.08);
    moonSprite.x = 320;
    moonSprite.y = 60;
    worldLayer.addChild(moonSprite);
    miniSprites.push(moonSprite);

    // 猫咪陪伴在旁
    const cat = makeSprite(ASSETS.cat, 0.06);
    cat.x = 140;
    cat.y = GROUND_Y;
    worldLayer.addChild(cat);
    miniSprites.push(cat);

    // 蜗牛慢慢爬
    const snail = makeSprite(ASSETS.snail, 0.05);
    snail.x = 200;
    snail.y = GROUND_Y;
    worldLayer.addChild(snail);
    miniSprites.push(snail);

    showDialogBubble('Zzz...', 100, GROUND_Y - 50);
  }

  // 💭 思考 - 天狗在云端，灯泡闪烁
  function setupThinking() {
    heroTargetX = 90;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 云朵背景
    const cloud1 = makeSprite(ASSETS.cloud, 0.08);
    cloud1.x = 280;
    cloud1.y = 80;
    worldLayer.addChild(cloud1);
    miniSprites.push(cloud1);

    // 天狗在云端思考
    setEnemy(ASSETS.tengu, 0.08, 280);
    if (enemySprite) {
      enemySprite.y = 70;
      enemySprite.alpha = 0.9;
    }

    // 灯泡闪烁（思考的火花）
    const bulb = makeSprite(ASSETS.light_bulb, 0.06);
    bulb.x = 130;
    bulb.y = GROUND_Y - 50;
    worldLayer.addChild(bulb);
    miniSprites.push(bulb);

    showDialogBubble('💡', 90, GROUND_Y - 60);
  }

  // 🔧 工作中 - 对抗外星人
  function setupWorking(key: string) {
    heroTargetX = 100;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 根据工具类型显示不同敌人
    if (key.includes('todo')) {
      setEnemy(ASSETS.alien_green, ENEMY_SCALE * 0.8, 270);
      // 任务列表 = 多个小目标
      addMiniSprite(ASSETS.damon_03, 0.04, 240, GROUND_Y - 10);
      addMiniSprite(ASSETS.damon_04, 0.04, 300, GROUND_Y);
    } else if (key.includes('call')) {
      // 调用工具 = 半人马强者
      setEnemy(ASSETS.centaur, ENEMY_SCALE * 1.2, 270);
    } else {
      // 普通工作 = 蓝色外星人
      setEnemy(ASSETS.alien_blue, ENEMY_SCALE, 270);
      // 绿树装饰
      const tree = makeSprite(ASSETS.green_tree, 0.06);
      tree.x = 340;
      tree.y = GROUND_Y;
      worldLayer.addChild(tree);
      miniSprites.push(tree);
    }
    hideDialogBubble();
  }

  // ✓ 完成 - 飞马庆祝，代码生成烟花
  function setupDone() {
    heroTargetX = 200;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 飞马出现（方向已修正为面向左）
    setMount(ASSETS.pegasus, HERO_SCALE, 250);
    if (mountSprite) {
      // 翻转飞马让它面向左边（勇者骑上去的方向）
      mountSprite.scale.x = -HERO_SCALE;
      mountSprite.scale.y = HERO_SCALE;
    }

    // 达摩庆祝
    const daruma = makeSprite(ASSETS.daruma, 0.06);
    daruma.x = 320;
    daruma.y = GROUND_Y;
    worldLayer.addChild(daruma);
    miniSprites.push(daruma);

    // 猫咪也在庆祝
    const cat = makeSprite(ASSETS.cat, 0.06);
    cat.x = 60;
    cat.y = GROUND_Y;
    worldLayer.addChild(cat);
    miniSprites.push(cat);

    hideDialogBubble();
    spawnCelebrationParticles();
    if (mountSprite) {
      (mountSprite as any).__fadeIn = true;
      (mountSprite as any).__celebrating = true;
    }
  }

  // 🔐 授权 - 针叶树守卫，达摩守门
  function setupAuth() {
    heroTargetX = 80;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 针叶树守卫
    const guardTree = makeSprite(ASSETS.needle_tree, 0.08);
    guardTree.x = 260;
    guardTree.y = GROUND_Y;
    worldLayer.addChild(guardTree);
    miniSprites.push(guardTree);

    // 达摩作为守门人
    setBoss(ASSETS.daruma, 0.08, 290);
    if (bossSprite) {
      bossSprite.y = GROUND_Y - 10;
      bossSprite.alpha = 0;
      (bossSprite as any).__descend = true;
    }

    // 南瓜人在旁警戒
    const pumpkin = makeSprite(ASSETS.pumpkin, 0.06);
    pumpkin.x = 330;
    pumpkin.y = GROUND_Y;
    worldLayer.addChild(pumpkin);
    miniSprites.push(pumpkin);

    showDialogBubble('需要许可！', 85, GROUND_Y - 50);
  }

  // ✗ 错误 - 小恶魔捣乱，南瓜人嘲笑
  function setupError() {
    heroTargetX = 120;
    if (heroSprite) {
      heroSprite.alpha = 0.8;
      heroSprite.scale.set(HERO_SCALE);
    }
    // 小恶魔们在捣乱
    setEnemy(ASSETS.damon_06, ENEMY_SCALE, 250);
    addMiniSprite(ASSETS.damon_03, 0.05, 290, GROUND_Y - 5);
    addMiniSprite(ASSETS.damon_04, 0.05, 310, GROUND_Y);

    // 南瓜人在旁"嘲笑"
    const pumpkin = makeSprite(ASSETS.pumpkin, 0.07);
    pumpkin.x = 340;
    pumpkin.y = GROUND_Y;
    worldLayer.addChild(pumpkin);
    miniSprites.push(pumpkin);

    // 雷电特效
    const thunder = makeSprite(ASSETS.thunder, 0.06);
    thunder.x = 180;
    thunder.y = 60;
    worldLayer.addChild(thunder);
    miniSprites.push(thunder);

    if (heroSprite) {
      heroSprite.angle = 90;
      heroSprite.y = GROUND_Y - 10;
    }
    showDialogBubble('💥 出错了！', 120, GROUND_Y - 30);
    spawnHitParticles(heroTargetX, GROUND_Y - 30);
  }

  // 📖 读取文件 - 勇者在书本前阅读，蜗牛慢慢学习
  function setupReading() {
    heroTargetX = 120;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 书本道具
    const book = makeSprite(ASSETS.book_06, 0.07);
    book.x = 170;
    book.y = GROUND_Y - 10;
    worldLayer.addChild(book);
    miniSprites.push(book);

    // 蜗牛也在"阅读"（慢慢学习）
    const snail = makeSprite(ASSETS.snail, 0.05);
    snail.x = 200;
    snail.y = GROUND_Y;
    worldLayer.addChild(snail);
    miniSprites.push(snail);

    // 牵牛花装饰
    const flower = makeSprite(ASSETS.morning_glory, 0.05);
    flower.x = 320;
    flower.y = GROUND_Y - 5;
    worldLayer.addChild(flower);
    miniSprites.push(flower);

    showDialogBubble('📖 读取中...', 120, GROUND_Y - 50);
  }

  // ✎ 写入/编辑文件 - 勇者记录，达摩见证
  function setupWriting(key: string) {
    heroTargetX = 130;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 书本记录
    const book = makeSprite(ASSETS.book_03, 0.07);
    book.x = 160;
    book.y = GROUND_Y - 15;
    worldLayer.addChild(book);
    miniSprites.push(book);

    // 达摩见证
    const daruma = makeSprite(ASSETS.daruma, 0.06);
    daruma.x = 200;
    daruma.y = GROUND_Y;
    worldLayer.addChild(daruma);
    miniSprites.push(daruma);

    // 多处编辑 = 多个小恶魔要对付
    if (key.includes('multiedit')) {
      setEnemy(ASSETS.damon_03, ENEMY_SCALE, 260);
      addMiniSprite(ASSETS.damon_04, 0.04, 280, GROUND_Y - 5);
      addMiniSprite(ASSETS.damon_06, 0.04, 300, GROUND_Y);
      addMiniSprite(ASSETS.alien_green, 0.04, 320, GROUND_Y - 10);
    } else {
      setEnemy(ASSETS.alien_blue, ENEMY_SCALE * 1.1, 270);
    }
    showDialogBubble('✎ 写入中...', 130, GROUND_Y - 50);
  }

  // 🔍 搜索 - 放大镜探索，猫咪好奇
  function setupSearching(key: string) {
    heroTargetX = 110;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 放大镜道具
    const glass = makeSprite(ASSETS.magnifying, 0.07);
    glass.x = 160;
    glass.y = GROUND_Y - 20;
    worldLayer.addChild(glass);
    miniSprites.push(glass);

    // 猫咪好奇地观察
    const cat = makeSprite(ASSETS.cat, 0.06);
    cat.x = 190;
    cat.y = GROUND_Y;
    worldLayer.addChild(cat);
    miniSprites.push(cat);

    // grep = 精准打击一个目标，glob = 范围搜索多个
    if (key.includes('grep')) {
      setEnemy(ASSETS.alien_pink, 0.07, 260);
    } else {
      setEnemy(ASSETS.alien_blue, ENEMY_SCALE, 270);
      addMiniSprite(ASSETS.alien_green, 0.04, 290, GROUND_Y);
      addMiniSprite(ASSETS.alien_pink, 0.04, 310, GROUND_Y);
    }
    showDialogBubble('🔍 搜索中...', 110, GROUND_Y - 50);
  }

  // 📋 规划模式 - 查看地图，绿色外星人向导
  function setupPlanning() {
    heroTargetX = 100;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 地图道具
    const map = makeSprite(ASSETS.map, 0.08);
    map.x = 160;
    map.y = GROUND_Y - 20;
    worldLayer.addChild(map);
    miniSprites.push(map);

    // 绿色外星人作为向导
    setEnemy(ASSETS.alien_green, 0.07, 270);

    // 松树装饰（在野外规划）
    const pine = makeSprite(ASSETS.pine_tree, 0.07);
    pine.x = 330;
    pine.y = GROUND_Y;
    worldLayer.addChild(pine);
    miniSprites.push(pine);

    showDialogBubble('📋 规划中...', 100, GROUND_Y - 50);
  }

  // 👥 子代理 - 召唤小恶魔军团协助
  function setupAgent() {
    heroTargetX = 100;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 召唤小伙伴（小恶魔军团）
    addMiniSprite(ASSETS.damon_03, 0.05, 140, GROUND_Y);
    addMiniSprite(ASSETS.damon_04, 0.05, 160, GROUND_Y - 5);
    addMiniSprite(ASSETS.damon_06, 0.05, 180, GROUND_Y);
    addMiniSprite(ASSETS.alien_green, 0.04, 200, GROUND_Y - 8);

    // 强大的敌人需要 teamwork
    setEnemy(ASSETS.centaur, ENEMY_SCALE * 1.3, 280);

    showDialogBubble('👥 召唤伙伴！', 100, GROUND_Y - 50);
  }

  // 🌐 网页相关 - 云端之上，飞行国王掌控网络
  function setupWeb() {
    heroTargetX = 120;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 云朵平台
    const cloud1 = makeSprite(ASSETS.cloud, 0.1);
    cloud1.x = 100;
    cloud1.y = GROUND_Y - 20;
    worldLayer.addChild(cloud1);
    miniSprites.push(cloud1);

    const cloud2 = makeSprite(ASSETS.cloud, 0.08);
    cloud2.x = 260;
    cloud2.y = 90;
    worldLayer.addChild(cloud2);
    miniSprites.push(cloud2);

    // 飞行国王在云端
    setBoss(ASSETS.king_flying, 0.09, 260);
    if (bossSprite) {
      bossSprite.y = 70;
      bossSprite.alpha = 0.9;
    }

    // 月亮在远处
    const moon = makeSprite(ASSETS.moon, 0.05);
    moon.x = 340;
    moon.y = 50;
    worldLayer.addChild(moon);
    miniSprites.push(moon);

    showDialogBubble('🌐 网络请求...', 120, GROUND_Y - 50);
  }

  // ❓ 询问用户 - 等待回应，宝箱在前
  function setupAsk() {
    heroTargetX = 100;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 寿司作为"诱饵"等待选择
    const sushi = makeSprite(ASSETS.sushi, 0.06);
    sushi.x = 170;
    sushi.y = GROUND_Y - 15;
    worldLayer.addChild(sushi);
    miniSprites.push(sushi);

    // 猫咪等待投喂
    const cat = makeSprite(ASSETS.cat, 0.06);
    cat.x = 200;
    cat.y = GROUND_Y;
    worldLayer.addChild(cat);
    miniSprites.push(cat);

    // 蜗牛也在等待
    const snail = makeSprite(ASSETS.snail, 0.05);
    snail.x = 230;
    snail.y = GROUND_Y;
    worldLayer.addChild(snail);
    miniSprites.push(snail);

    setEnemy(ASSETS.alien_pink, ENEMY_SCALE, 280);
    showDialogBubble('❓ 请做出选择...', 100, GROUND_Y - 50);
  }

  // 📓 Notebook - 魔法书记录
  function setupNotebook() {
    heroTargetX = 110;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 魔法书（大书本）
    const book = makeSprite(ASSETS.book_06, 0.09);
    book.x = 170;
    book.y = GROUND_Y - 20;
    worldLayer.addChild(book);
    miniSprites.push(book);

    // 小书本陪伴
    const smallBook = makeSprite(ASSETS.book_03, 0.05);
    smallBook.x = 210;
    smallBook.y = GROUND_Y - 5;
    worldLayer.addChild(smallBook);
    miniSprites.push(smallBook);

    // 蜗牛记录员
    const snail = makeSprite(ASSETS.snail, 0.05);
    snail.x = 240;
    snail.y = GROUND_Y;
    worldLayer.addChild(snail);
    miniSprites.push(snail);

    setEnemy(ASSETS.alien_pink, 0.07, 280);
    showDialogBubble('📓 记录笔记...', 110, GROUND_Y - 50);
  }

  // ⚡ Bash - 雷电攻击，南瓜人受击
  function setupBash() {
    heroTargetX = 120;
    if (heroSprite) {
      heroSprite.scale.set(HERO_SCALE);
      heroSprite.alpha = 1;
      heroSprite.angle = 0;
    }
    // 雷电道具
    const thunder = makeSprite(ASSETS.thunder, 0.08);
    thunder.x = 150;
    thunder.y = GROUND_Y - 40;
    worldLayer.addChild(thunder);
    miniSprites.push(thunder);

    // 南瓜人作为执行目标
    setEnemy(ASSETS.pumpkin, ENEMY_SCALE * 1.3, 270);

    // 绿色外星人作为助手
    addMiniSprite(ASSETS.alien_green, 0.05, 200, GROUND_Y - 10);

    showDialogBubble('⚡ 执行命令！', 120, GROUND_Y - 50);

    // 连续闪电效果
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        spawnLightning(160 + i * 20, GROUND_Y - 30);
      }, i * 100);
    }
  }

  // ─── 粒子特效 ─────────────────────────────────────────────

  function spawnCelebrationParticles() {
    const colors = [0xffd93d, 0x6bcb77, 0x4ecdc4, 0xff6b6b, 0xa29bfe, 0xffffff];
    for (let i = 0; i < 30; i++) {
      const g = new PIXI.Graphics();
      g.beginFill(colors[i % colors.length]);
      g.drawRect(0, 0, 4, 4);
      g.endFill();
      g.x = 100 + Math.random() * 200;
      g.y = GROUND_Y;
      fxLayer.addChild(g);
      particles.push({ g, vx: (Math.random() - 0.5) * 4, vy: -(3 + Math.random() * 5), life: 60 + Math.random() * 60, maxLife: 120, color: colors[i % colors.length] });
    }
  }

  function spawnFirework() {
    const fx = 50 + Math.random() * 300;
    const fy = 40 + Math.random() * 80;
    const colors = [0xff0044, 0x00ff88, 0x0088ff, 0xffaa00, 0xff00ff, 0x00ffff, 0xffff00];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const trail = new PIXI.Graphics();
    trail.beginFill(color, 0.7);
    trail.drawRect(0, 0, 2, 2);
    trail.endFill();
    trail.x = fx;
    trail.y = GROUND_Y;
    fxLayer.addChild(trail);
    particles.push({ g: trail, vx: 0, vy: -(3 + Math.random()), life: 50, maxLife: 50, color });

    setTimeout(() => {
      for (let i = 0; i < 10; i++) {
        const g = new PIXI.Graphics();
        g.beginFill(color, 0.8);
        g.drawRect(0, 0, 2, 2);
        g.endFill();
        g.x = fx;
        g.y = fy;
        fxLayer.addChild(g);
        const angle = (i / 10) * Math.PI * 2;
        const speed = 1.5 + Math.random() * 2;
        particles.push({ g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 40 + Math.random() * 20, maxLife: 60, color });
      }
      const flash = new PIXI.Graphics();
      flash.beginFill(0xffffff, 0.3);
      flash.drawCircle(0, 0, 12);
      flash.endFill();
      flash.x = fx;
      flash.y = fy;
      fxLayer.addChild(flash);
      particles.push({ g: flash, vx: 0, vy: 0, life: 8, maxLife: 8, color: 0xffffff });
    }, 500);
  }

  function spawnHitParticles(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const g = new PIXI.Graphics();
      g.beginFill(0xff4444);
      g.drawRect(0, 0, 6, 6);
      g.endFill();
      g.x = x;
      g.y = y;
      fxLayer.addChild(g);
      particles.push({ g, vx: (Math.random() - 0.5) * 6, vy: -(2 + Math.random() * 4), life: 40, maxLife: 40, color: 0xff4444 });
    }
  }

  function spawnDustParticle(x: number, y: number, dir: number) {
    const g = new PIXI.Graphics();
    g.beginFill(0xaaaaaa, 0.6);
    g.drawCircle(0, 0, 2 + Math.random() * 3);
    g.endFill();
    g.x = x - dir * 10;
    g.y = y - 5;
    fxLayer.addChild(g);
    particles.push({ g, vx: -dir * (0.5 + Math.random()), vy: -(0.5 + Math.random() * 1), life: 20, maxLife: 20, color: 0xaaaaaa });
  }

  function spawnLightning(x: number, y: number) {
    const g = new PIXI.Graphics();
    g.lineStyle(2, 0xffff00);
    g.moveTo(x, y);
    g.lineTo(x + 10, y - 20);
    g.lineTo(x - 5, y - 35);
    g.lineTo(x + 15, y - 50);
    fxLayer.addChild(g);
    particles.push({ g, vx: 0, vy: 0, life: 10, maxLife: 10, color: 0xffff00 });
  }

  function clearParticles() {
    for (const p of particles) {
      fxLayer.removeChild(p.g);
      p.g.destroy();
    }
    particles = [];
  }

  // ─── 游戏循环 ─────────────────────────────────────────────

  function gameLoop() {
    tick++;

    // 处理场景过渡动画
    if (transitionState.active) {
      transitionState.progress = Math.min(1, transitionState.progress + 0.05);

      // 旧精灵淡出
      let allOldFaded = true;
      for (const sprite of transitionState.oldSprites) {
        if (sprite && sprite.parent) {
          const speed = (sprite as any).__transitionSpeed ?? 0.05;
          sprite.alpha = Math.max(0, sprite.alpha - speed);
          if (sprite.alpha > 0) allOldFaded = false;
        }
      }

      // 新精灵淡入
      const newSprites = getCurrentSprites();
      for (const sprite of newSprites) {
        if ((sprite as any).__transitionIn) {
          const speed = (sprite as any).__transitionSpeed ?? 0.08;
          sprite.alpha = Math.min(1, sprite.alpha + speed);
          if (sprite.alpha >= 1) {
            (sprite as any).__transitionIn = false;
          }
        }
      }

      // 背景颜色过渡
      if (bgGraphics) {
        // 重新绘制渐变背景
        drawBackground(transitionState.toLevel);
      }

      // 过渡完成
      if (allOldFaded || transitionState.progress >= 1) {
        finishTransition();
      }
    }

    const clouds = (bgLayer as any).__clouds as PIXI.Container;
    if (clouds) {
      for (const child of clouds.children) {
        const c = child as any;
        c.x += c.__speed;
        if (c.x > W + 50) c.x = -80;
        c.y += Math.sin(tick * 0.01 + c.__speed * 10) * 0.1;
      }
    }

    if (heroSprite) {
      // 平滑移动到目标位置（缓动系数）
      const dx = heroTargetX - heroSprite.x;
      heroSprite.x += dx * 0.08;

      // 判断是否正在移动
      const isMoving = Math.abs(dx) > 2;

      if (isMoving) {
        // 行走时的弹跳动画
        heroBounce = Math.abs(Math.sin(tick * 0.3)) * 6;
      } else if (currentLevel === 'idle' || currentLevel === 'thinking' || currentLevel === 'planning') {
        heroBounce = Math.sin(tick * 0.08) * 3;
      } else if (currentLevel === 'working' || currentLevel === 'writing' || currentLevel === 'bash') {
        heroBounce = Math.sin(tick * 0.2) * 4;
      } else if (currentLevel === 'reading' || currentLevel === 'notebook') {
        heroBounce = Math.sin(tick * 0.05) * 2;
      } else if (currentLevel === 'searching') {
        heroBounce = Math.sin(tick * 0.15) * 3;
      } else if (currentLevel === 'agent') {
        heroBounce = Math.sin(tick * 0.1) * 2;
      } else {
        heroBounce = lerp(heroBounce, 0, 0.1);
      }

      if (currentLevel !== 'error') {
        heroSprite.y = GROUND_Y + heroBounce;
      }

      // 行走时添加倾斜和灰尘效果
      if (isMoving) {
        // 朝向目标倾斜
        heroSprite.angle = Math.max(-15, Math.min(15, dx * 0.5));
        // 产生灰尘粒子
        if (tick % 8 === 0) {
          spawnDustParticle(heroSprite.x, GROUND_Y, dx > 0 ? 1 : -1);
        }
      } else {
        heroSprite.angle = lerp(heroSprite.angle, 0, 0.2);
      }

      heroSprite.scale.x = heroFlip ? HERO_SCALE : -HERO_SCALE;
    }

    if (enemySprite) {
      if (currentLevel === 'working' || currentLevel === 'writing' || currentLevel === 'bash') {
        const phase = Math.sin(tick * 0.04);
        enemyTargetX = 270 + phase * 30;
        enemyShakeX = Math.sin(tick * 0.3) * 2;
        enemySprite.x = lerp(enemySprite.x, enemyTargetX + enemyShakeX, 0.1);
        enemyBounce = Math.sin(tick * 0.15) * 5;
        enemySprite.y = GROUND_Y + enemyBounce;
      } else if (currentLevel === 'idle') {
        enemyTargetX = 320 + Math.sin(tick * 0.01) * 20;
        enemySprite.x = lerp(enemySprite.x, enemyTargetX, 0.02);
      } else if (currentLevel === 'reading' || currentLevel === 'notebook') {
        enemyTargetX = 280 + Math.sin(tick * 0.03) * 10;
        enemySprite.x = lerp(enemySprite.x, enemyTargetX, 0.02);
        enemySprite.alpha = 0.5 + Math.sin(tick * 0.05) * 0.2;
      } else if (currentLevel === 'searching') {
        enemyTargetX = 260 + Math.sin(tick * 0.08) * 40;
        enemySprite.x = lerp(enemySprite.x, enemyTargetX, 0.05);
      } else if (currentLevel === 'agent') {
        enemyTargetX = 280 + Math.sin(tick * 0.02) * 20;
        enemySprite.x = lerp(enemySprite.x, enemyTargetX, 0.03);
        enemySprite.scale.y = ENEMY_SCALE + Math.sin(tick * 0.1) * 0.01;
      } else {
        enemySprite.x = lerp(enemySprite.x, enemyTargetX, 0.05);
        enemySprite.y = GROUND_Y + Math.sin(tick * 0.06) * 2;
      }
    }

    // Boss 动画
    if (bossSprite && (bossSprite as any).__descend) {
      bossSprite.alpha = Math.min(1, bossSprite.alpha + 0.02);
      bossSprite.y = lerp(bossSprite.y, GROUND_Y - 40, 0.04);
      bossSprite.y += Math.sin(tick * 0.05) * 2;
      if (bossSprite.alpha >= 1 && heroSprite) {
        heroSprite.angle = lerp(heroSprite.angle, -10, 0.05);
      }
    }

    // 飞行坐骑动画
    if (mountSprite && (mountSprite as any).__fadeIn) {
      mountSprite.alpha = Math.min(1, mountSprite.alpha + 0.015);
      if ((mountSprite as any).__celebrating) {
        mountSprite.x = lerp(mountSprite.x, 200 + Math.sin(tick * 0.02) * 50, 0.02);
        mountSprite.y = (GROUND_Y - 40) + Math.sin(tick * 0.05) * 15;
      } else {
        mountSprite.y = (GROUND_Y - 30) + Math.sin(tick * 0.04) * 8;
        mountSprite.x = lerp(mountSprite.x, 230, 0.02);
      }
    }

    // 完成状态 - 骑乘飞马
    if (currentLevel === 'done' && heroSprite && mountSprite) {
      heroSprite.x = mountSprite.x - 5;
      heroSprite.y = mountSprite.y - 35;
      heroSprite.angle = Math.sin(tick * 0.1) * 5;
      if (tick % 90 === 0) {
        spawnFirework();
      }
    }

    // 思考状态 - 左右摇摆
    if (currentLevel === 'thinking' && heroSprite) {
      heroTargetX = 90 + Math.sin(tick * 0.02) * 10;
    }

    // 错误状态 - 震动
    if (currentLevel === 'error' && heroSprite) {
      heroSprite.x = heroTargetX + Math.sin(tick * 0.5) * 2;
    }

    // 闲置状态 - 猫咪和蜗牛动画
    if (currentLevel === 'idle') {
      miniSprites.forEach((s, i) => {
        if (i < 3) { // 月亮不跳动，只浮动
          s.y += Math.sin(tick * 0.03 + i) * 0.3;
        }
      });
    }

    // 思考状态 - 灯泡闪烁，天狗浮动
    if (currentLevel === 'thinking') {
      miniSprites.forEach((s, i) => {
        if (i === 1) { // 灯泡
          s.alpha = 0.6 + Math.sin(tick * 0.1) * 0.4;
          s.angle = Math.sin(tick * 0.05) * 10;
        }
      });
      if (enemySprite) {
        enemySprite.y = 70 + Math.sin(tick * 0.04) * 5;
      }
    }

    // 读取状态 - 书本浮动，蜗牛缓慢移动
    if (currentLevel === 'reading') {
      miniSprites.forEach((s, i) => {
        s.y += Math.sin(tick * 0.02 + i * 0.5) * 0.2;
      });
    }

    // 写入状态 - 书本和达摩动画
    if (currentLevel === 'writing') {
      miniSprites.forEach((s, i) => {
        s.y = (GROUND_Y - (i === 0 ? 15 : 0)) + Math.sin(tick * 0.08 + i) * 2;
      });
    }

    // 搜索状态 - 放大镜旋转，猫咪好奇摆动
    if (currentLevel === 'searching') {
      miniSprites.forEach((s, i) => {
        if (i === 0) { // 放大镜
          s.angle = Math.sin(tick * 0.05) * 15;
          s.y = (GROUND_Y - 20) + Math.sin(tick * 0.1) * 3;
        } else {
          s.y = GROUND_Y + Math.sin(tick * 0.08 + i) * 2;
        }
      });
    }

    // 规划状态 - 地图展开效果
    if (currentLevel === 'planning') {
      miniSprites.forEach((s, i) => {
        if (i === 0) { // 地图
          s.scale.set(0.08 + Math.sin(tick * 0.03) * 0.005);
        }
        s.y += Math.sin(tick * 0.02 + i) * 0.2;
      });
    }

    // 子代理 - 小伙伴跳动
    if (currentLevel === 'agent') {
      miniSprites.forEach((s, i) => {
        s.y = GROUND_Y + Math.sin(tick * 0.15 + i * 0.8) * 4;
        s.x += Math.sin(tick * 0.05 + i) * 0.3;
      });
    }

    // 网络状态 - 云朵飘动，飞行国王悬浮
    if (currentLevel === 'web') {
      miniSprites.forEach((s, i) => {
        s.x += Math.sin(tick * 0.01 + i) * 0.2;
      });
      if (bossSprite) {
        bossSprite.y = 70 + Math.sin(tick * 0.03) * 8;
      }
    }

    // 询问状态 - 寿司和猫咪等待动画
    if (currentLevel === 'ask') {
      miniSprites.forEach((s, i) => {
        s.y += Math.sin(tick * 0.04 + i * 0.5) * 0.5;
      });
    }

    // Notebook - 魔法书浮动
    if (currentLevel === 'notebook') {
      miniSprites.forEach((s, i) => {
        s.y = (GROUND_Y - (i === 0 ? 20 : i === 1 ? 5 : 0)) + Math.sin(tick * 0.06 + i * 0.5) * 3;
      });
    }

    // Bash - 雷电闪烁
    if (currentLevel === 'bash') {
      miniSprites.forEach((s, i) => {
        if (i === 0) { // 雷电
          s.alpha = 0.7 + Math.sin(tick * 0.2) * 0.3;
          s.angle = Math.sin(tick * 0.1) * 5;
        }
      });
    }

    // 完成状态 - 达摩和猫咪庆祝动画
    if (currentLevel === 'done') {
      miniSprites.forEach((s, i) => {
        s.y = GROUND_Y + Math.sin(tick * 0.06 + i) * 3;
      });
    }

    // 授权状态 - 守卫树摇摆，达摩浮动
    if (currentLevel === 'auth') {
      miniSprites.forEach((s, i) => {
        if (i === 0) { // 针叶树
          s.angle = Math.sin(tick * 0.02) * 3;
        }
      });
    }

    // 错误状态 - 小恶魔跳动，南瓜人摇摆
    if (currentLevel === 'error') {
      miniSprites.forEach((s, i) => {
        if (i >= 2) { // 南瓜人和雷电
          s.y = (i === 3 ? 60 : GROUND_Y) + Math.sin(tick * 0.1 + i) * 2;
        } else {
          s.y = GROUND_Y + Math.sin(tick * 0.2 + i * 0.5) * 3;
        }
      });
    }

    // 粒子更新
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.g.x += p.vx;
      p.g.y += p.vy;
      p.vy += 0.2;
      p.life--;
      p.g.alpha = p.life / p.maxLife;
      if (p.life <= 0) {
        fxLayer.removeChild(p.g);
        p.g.destroy();
        particles.splice(i, 1);
      }
    }

    // 闲置状态 - 飘落星星
    if (currentLevel === 'idle' && tick % 90 === 0) {
      const g = new PIXI.Graphics();
      g.beginFill(0xffd93d);
      g.drawRect(0, 0, 3, 3);
      g.endFill();
      g.x = Math.random() * W;
      g.y = Math.random() * SKY_H;
      fxLayer.addChild(g);
      particles.push({ g, vx: 0, vy: -0.5, life: 120, maxLife: 120, color: 0xffd93d });
    }

    // 战斗状态 - 攻击特效
    if ((currentLevel === 'working' || currentLevel === 'writing' || currentLevel === 'bash') && tick % 40 === 0) {
      spawnHitParticles(185, GROUND_Y - 30);
    }
  }

  // ─── 响应式缩放 ───────────────────────────────────────────

  function resizeCanvas() {
    if (!app || !canvasRef.value) return;
    const container = containerSize.value;
    const scaleX = container.width / W;
    const scaleY = container.height / H;
    const scale = Math.min(scaleX, scaleY);
    const canvas = canvasRef.value;
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.style.imageRendering = 'pixelated';
  }

  // ─── 公开 API ─────────────────────────────────────────────

  function updateState(level: StatusLevel, key?: string) {
    // 如果提供了 key，使用 key 重新分类；否则直接使用传入的 level
    // 这样测试模式和真实状态的行为一致
    const newLevel = key ? classifyStatusKey(key) : level;
    if (newLevel === currentLevel && key === currentKey) return;
    currentLevel = newLevel;
    // 保存原始 key 用于显示
    if (key) currentKey = key;
    // 使用分类后的 level 更新场景
    updateScene(newLevel, key ?? currentKey);
  }

  function updateTokens(tokens: number) {
    currentTokens = tokens;
    updateHUD();
  }

  function updateProjectName(name: string) {
    currentProjectName = name;
    updateHUD();
  }

  function destroy() {
    clearParticles();
    if (app) {
      app.ticker.remove(gameLoop);
      app.destroy(false, { children: true });
      app = null;
    }
    // 清空纹理缓存，因为 app.destroy() 会销毁所有纹理
    textureCache.clear();
    // 同时清理 Pixi 的全局纹理缓存，避免残留无效引用
    for (const key of Object.keys(PIXI.utils.TextureCache)) {
      delete PIXI.utils.TextureCache[key];
    }
    for (const key of Object.keys(PIXI.utils.BaseTextureCache)) {
      delete PIXI.utils.BaseTextureCache[key];
    }
    isReady.value = false;
  }

  let resizeRaf: number | null = null;
  function onResize() {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => resizeCanvas());
  }

  onMounted(async () => {
    await init();
    window.addEventListener('resize', onResize);
  });

  watch(() => containerSize.value, () => onResize(), { deep: true });

  onUnmounted(() => {
    destroy();
    window.removeEventListener('resize', onResize);
  });

  return {
    isReady,
    updateState,
    updateTokens,
    updateProjectName,
  };
}
