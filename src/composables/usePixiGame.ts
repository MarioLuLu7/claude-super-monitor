import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as PIXI from 'pixi.js';
import type { StatusLevel } from '../types';
import {
  type GameRoomConfig,
  type Position,
  type EmoteType,
  type CharacterState,
  type GameSceneObjects,
  ROOM_LAYOUT,
  EMOTE_CONFIG,
  getStateActionMapping,
} from '../types/game';

// Pixel art color palettes
const COLORS = {
  // Wood tones
  woodDark: 0x3d2817,
  woodMedium: 0x5c3a1e,
  woodLight: 0x8b5a2b,
  woodHighlight: 0xa67b5b,
  // Metal tones
  metalDark: 0x2a2a3a,
  metalMedium: 0x4a4a5a,
  metalLight: 0x6a6a7a,
  // Fabric
  fabricRed: 0x8b3a3a,
  fabricRedLight: 0xab5a5a,
  // Screen glow
  screenGlow: 0x00ff88,
  screenDark: 0x00aa55,
  // Books
  bookColors: [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c],
};

export function usePixiGame(
  canvasRef: { value: HTMLCanvasElement | null },
  containerSize: { value: { width: number; height: number } },
  initialConfig: GameRoomConfig
) {
  const app = ref<PIXI.Application | null>(null);
  const isReady = ref(false);
  const currentState = ref<CharacterState>('idle');
  const currentEmote = ref<EmoteType>(null);

  const sceneObjects: GameSceneObjects = {
    character: null,
    emote: null,
    powerMeter: null,
    doorSign: null,
    furniture: new Map(),
  };

  const animations = new Map<string, PIXI.Texture[]>();
  let moveTarget: Position | null = null;
  let onArriveCallback: (() => void) | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  // 计算等比例缩放
  function calculateScale(): number {
    const availableWidth = containerSize.value.width;
    const availableHeight = containerSize.value.height;

    const scaleX = availableWidth / ROOM_LAYOUT.width;
    const scaleY = availableHeight / ROOM_LAYOUT.height;

    // 取较小值保持等比例，留一些边距
    return Math.min(scaleX, scaleY) * 0.95;
  }

  // 应用缩放
  function applyScale() {
    if (!app.value) return;

    const scale = calculateScale();
    const scaledWidth = Math.floor(ROOM_LAYOUT.width * scale);
    const scaledHeight = Math.floor(ROOM_LAYOUT.height * scale);

    // 调整画布大小
    app.value.renderer.resize(scaledWidth, scaledHeight);

    // 缩放整个场景
    if (app.value.stage) {
      app.value.stage.scale.set(scale);
    }

    // 更新 canvas 样式确保居中
    if (canvasRef.value) {
      canvasRef.value.style.width = `${scaledWidth}px`;
      canvasRef.value.style.height = `${scaledHeight}px`;
    }
  }

  async function init() {
    if (!canvasRef.value) return;

    // 初始使用容器大小或默认大小
    const initialScale = calculateScale();
    const initialWidth = Math.floor(ROOM_LAYOUT.width * initialScale) || ROOM_LAYOUT.width;
    const initialHeight = Math.floor(ROOM_LAYOUT.height * initialScale) || ROOM_LAYOUT.height;

    app.value = new PIXI.Application({
      view: canvasRef.value,
      width: initialWidth,
      height: initialHeight,
      backgroundColor: ROOM_LAYOUT.colors.wall,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;

    await createScene();

    // 应用初始缩放
    applyScale();

    isReady.value = true;
    updateState(initialConfig.statusLevel, initialConfig.statusKey, initialConfig.statusDetail);
    app.value.ticker.add(gameLoop);

    // 监听容器大小变化
    watch(() => containerSize.value, () => {
      applyScale();
    }, { immediate: false });
  }

  async function createScene() {
    if (!app.value) return;
    const container = new PIXI.Container();
    app.value.stage.addChild(container);

    createRoomBackground(container);
    createFurniture(container);
    createCharacter(container);
    createDoorSign(container, initialConfig.projectName);
    createPowerMeter(container, initialConfig.tokens);
    createEmote(container);
  }

  function createRoomBackground(container: PIXI.Container) {
    const graphics = new PIXI.Graphics();

    // Wall with subtle gradient effect
    graphics.beginFill(ROOM_LAYOUT.colors.wall);
    graphics.drawRect(0, 0, ROOM_LAYOUT.width, ROOM_LAYOUT.height);
    graphics.endFill();

    // Baseboard
    graphics.beginFill(0x2a2a35);
    graphics.drawRect(0, 70, ROOM_LAYOUT.width, 10);
    graphics.endFill();

    // Baseboard highlight
    graphics.beginFill(0x3a3a45);
    graphics.drawRect(0, 70, ROOM_LAYOUT.width, 2);
    graphics.endFill();

    // Floor with better texture
    graphics.beginFill(ROOM_LAYOUT.colors.floor);
    graphics.drawRect(10, 80, ROOM_LAYOUT.width - 20, ROOM_LAYOUT.height - 90);
    graphics.endFill();

    // Floor planks
    graphics.lineStyle(1, 0x333344, 0.3);
    for (let x = 10; x < ROOM_LAYOUT.width - 10; x += 40) {
      graphics.moveTo(x, 80);
      graphics.lineTo(x, ROOM_LAYOUT.height - 10);
    }
    // Horizontal planks
    for (let y = 80; y < ROOM_LAYOUT.height - 10; y += 15) {
      graphics.moveTo(10, y);
      graphics.lineTo(ROOM_LAYOUT.width - 10, y);
    }

    // Floor shadow (corners)
    graphics.beginFill(0x000000, 0.2);
    graphics.drawRect(10, 80, ROOM_LAYOUT.width - 20, 5);
    graphics.drawRect(10, 80, 5, ROOM_LAYOUT.height - 90);
    graphics.drawRect(ROOM_LAYOUT.width - 15, 80, 5, ROOM_LAYOUT.height - 90);
    graphics.endFill();

    container.addChild(graphics);
  }

  function createFurniture(container: PIXI.Container) {
    createSofa(container);
    createMachine(container);
    createBookshelf(container);
    createDesk(container);
    createDoor(container);
  }

  function createSofa(container: PIXI.Container) {
    const sofa = new PIXI.Graphics();
    const { x, y, width, height } = ROOM_LAYOUT.furniture.sofa;

    // Shadow
    sofa.beginFill(0x000000, 0.3);
    sofa.drawRect(x + 3, y + height - 5, width, 8);
    sofa.endFill();

    // Backrest
    sofa.beginFill(COLORS.woodDark);
    sofa.drawRect(x + 2, y - 15, width - 4, 20);
    sofa.endFill();

    // Backrest cushion
    sofa.beginFill(COLORS.fabricRed);
    sofa.drawRect(x + 5, y - 12, width - 10, 15);
    sofa.endFill();

    // Main body (wood frame)
    sofa.beginFill(COLORS.woodMedium);
    sofa.drawRect(x, y, width, height);
    sofa.endFill();

    // Seat cushion
    sofa.beginFill(COLORS.fabricRed);
    sofa.drawRect(x + 3, y + 3, width - 6, height - 10);
    sofa.endFill();

    // Cushion highlight
    sofa.beginFill(COLORS.fabricRedLight);
    sofa.drawRect(x + 3, y + 3, width - 6, 5);
    sofa.endFill();

    // Left armrest
    sofa.beginFill(COLORS.woodMedium);
    sofa.drawRect(x - 5, y + 5, 8, height - 8);
    sofa.endFill();
    sofa.beginFill(COLORS.woodLight);
    sofa.drawRect(x - 5, y + 5, 8, 4);
    sofa.endFill();

    // Right armrest
    sofa.beginFill(COLORS.woodMedium);
    sofa.drawRect(x + width - 3, y + 5, 8, height - 8);
    sofa.endFill();
    sofa.beginFill(COLORS.woodLight);
    sofa.drawRect(x + width - 3, y + 5, 8, 4);
    sofa.endFill();

    // Legs
    sofa.beginFill(COLORS.woodDark);
    sofa.drawRect(x + 3, y + height - 3, 4, 6);
    sofa.drawRect(x + width - 7, y + height - 3, 4, 6);
    sofa.endFill();

    container.addChild(sofa);
    sceneObjects.furniture.set('sofa', sofa as unknown as PIXI.Sprite);
  }

  function createMachine(container: PIXI.Container) {
    const machine = new PIXI.Graphics();
    const { x, y, width, height } = ROOM_LAYOUT.furniture.machine;

    // Shadow
    machine.beginFill(0x000000, 0.3);
    machine.drawRect(x + 5, y + height - 3, width - 10, 6);
    machine.endFill();

    // Main body
    machine.beginFill(COLORS.metalDark);
    machine.drawRect(x, y, width, height);
    machine.endFill();

    // Top panel
    machine.beginFill(COLORS.metalMedium);
    machine.drawRect(x + 3, y + 3, width - 6, 25);
    machine.endFill();

    // Screen
    machine.beginFill(0x001100);
    machine.drawRect(x + 8, y + 6, width - 16, 18);
    machine.endFill();

    // Screen glow
    machine.beginFill(COLORS.screenGlow);
    machine.drawRect(x + 10, y + 8, width - 20, 14);
    machine.endFill();

    // Screen scanlines
    machine.beginFill(0x000000, 0.3);
    for (let i = 0; i < 3; i++) {
      machine.drawRect(x + 10, y + 10 + i * 4, width - 20, 1);
    }
    machine.endFill();

    // Control panel below screen
    machine.beginFill(COLORS.metalLight);
    machine.drawRect(x + 5, y + 32, width - 10, 20);
    machine.endFill();

    // Buttons
    const buttonColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44];
    for (let i = 0; i < 4; i++) {
      machine.beginFill(buttonColors[i]);
      machine.drawCircle(x + 12 + i * 12, y + 42, 3);
      machine.endFill();
      // Button highlight
      machine.beginFill(0xffffff, 0.5);
      machine.drawCircle(x + 11 + i * 12, y + 41, 1);
      machine.endFill();
    }

    // Vents
    machine.beginFill(0x1a1a2a);
    for (let i = 0; i < 4; i++) {
      machine.drawRect(x + 8, y + 58 + i * 6, width - 16, 3);
    }
    machine.endFill();

    // Side panels
    machine.beginFill(COLORS.metalMedium);
    machine.drawRect(x - 2, y + 10, 4, height - 20);
    machine.drawRect(x + width - 2, y + 10, 4, height - 20);
    machine.endFill();

    // Power LED (animated later)
    machine.beginFill(COLORS.screenGlow);
    machine.drawCircle(x + width - 8, y + height - 8, 3);
    machine.endFill();

    container.addChild(machine);
    sceneObjects.furniture.set('machine', machine as unknown as PIXI.Sprite);
  }

  function createBookshelf(container: PIXI.Container) {
    const shelf = new PIXI.Graphics();
    const { x, y, width, height } = ROOM_LAYOUT.furniture.bookshelf;

    // Shadow
    shelf.beginFill(0x000000, 0.3);
    shelf.drawRect(x + 3, y + height - 3, width, 6);
    shelf.endFill();

    // Frame
    shelf.beginFill(COLORS.woodDark);
    shelf.drawRect(x, y, width, height);
    shelf.endFill();

    // Shelves
    const shelfCount = 4;
    const shelfHeight = (height - 10) / shelfCount;

    for (let i = 0; i <= shelfCount; i++) {
      shelf.beginFill(COLORS.woodMedium);
      shelf.drawRect(x + 2, y + 5 + i * shelfHeight, width - 4, 3);
      shelf.endFill();
      shelf.beginFill(COLORS.woodLight);
      shelf.drawRect(x + 2, y + 5 + i * shelfHeight, width - 4, 1);
      shelf.endFill();
    }

    // Books on each shelf
    for (let s = 0; s < shelfCount; s++) {
      let bookX = x + 4;
      const shelfY = y + 8 + s * shelfHeight;

      while (bookX < x + width - 10) {
        const bookWidth = 4 + Math.random() * 4;
        const bookHeight = shelfHeight - 12 + Math.random() * 8;
        const color = COLORS.bookColors[Math.floor(Math.random() * COLORS.bookColors.length)];

        if (bookX + bookWidth > x + width - 4) break;

        // Book body
        shelf.beginFill(color);
        shelf.drawRect(bookX, shelfY + (shelfHeight - 10) - bookHeight, bookWidth, bookHeight);
        shelf.endFill();

        // Book spine highlight
        shelf.beginFill(0xffffff, 0.3);
        shelf.drawRect(bookX, shelfY + (shelfHeight - 10) - bookHeight, 1, bookHeight);
        shelf.endFill();

        bookX += bookWidth + 1;
      }
    }

    container.addChild(shelf);
    sceneObjects.furniture.set('bookshelf', shelf as unknown as PIXI.Sprite);
  }

  function createDesk(container: PIXI.Container) {
    const desk = new PIXI.Graphics();
    const { x, y, width, height } = ROOM_LAYOUT.furniture.desk;

    // Shadow
    desk.beginFill(0x000000, 0.3);
    desk.drawRect(x + 3, y + height - 3, width, 6);
    desk.endFill();

    // Desk legs
    desk.beginFill(COLORS.metalDark);
    desk.drawRect(x + 3, y + 15, 4, height - 15);
    desk.drawRect(x + width - 7, y + 15, 4, height - 15);
    desk.endFill();

    // Desk top
    desk.beginFill(COLORS.woodLight);
    desk.drawRect(x, y, width, 15);
    desk.endFill();

    // Desk edge
    desk.beginFill(COLORS.woodMedium);
    desk.drawRect(x, y + 12, width, 3);
    desk.endFill();

    // Computer monitor base
    desk.beginFill(COLORS.metalMedium);
    desk.drawRect(x + width/2 - 8, y - 5, 16, 8);
    desk.endFill();

    // Monitor stand
    desk.beginFill(COLORS.metalDark);
    desk.drawRect(x + width/2 - 3, y - 12, 6, 8);
    desk.endFill();

    // Monitor screen (bezel)
    desk.beginFill(0x1a1a2a);
    desk.drawRect(x + width/2 - 18, y - 32, 36, 22);
    desk.endFill();

    // Screen
    desk.beginFill(0x001133);
    desk.drawRect(x + width/2 - 16, y - 30, 32, 18);
    desk.endFill();

    // Code lines on screen
    desk.beginFill(0x00ff88);
    for (let i = 0; i < 3; i++) {
      const lineWidth = 20 + Math.random() * 8;
      desk.drawRect(x + width/2 - 14, y - 27 + i * 5, lineWidth, 2);
    }
    desk.endFill();

    // Keyboard
    desk.beginFill(COLORS.metalMedium);
    desk.drawRect(x + 5, y + 5, 20, 8);
    desk.endFill();

    // Keys
    desk.beginFill(COLORS.metalLight);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 5; j++) {
        desk.drawRect(x + 6 + j * 4, y + 6 + i * 2.5, 2, 2);
      }
    }
    desk.endFill();

    // Mouse
    desk.beginFill(COLORS.metalMedium);
    desk.drawCircle(x + width - 10, y + 10, 3);
    desk.endFill();
    desk.beginFill(COLORS.metalLight);
    desk.drawRect(x + width - 11, y + 6, 2, 4);
    desk.endFill();

    container.addChild(desk);
    sceneObjects.furniture.set('desk', desk as unknown as PIXI.Sprite);
  }

  function createDoor(container: PIXI.Container) {
    const door = new PIXI.Graphics();
    const { x, y, width, height } = ROOM_LAYOUT.furniture.door;

    // Door frame
    door.beginFill(COLORS.woodDark);
    door.drawRect(x - 3, y - 3, width + 6, height + 6);
    door.endFill();

    // Door panel
    door.beginFill(COLORS.woodMedium);
    door.drawRect(x, y, width, height);
    door.endFill();

    // Door panels (decorative rectangles)
    door.beginFill(COLORS.woodLight);
    door.drawRect(x + 3, y + 5, width - 6, 20);
    door.drawRect(x + 3, y + 30, width - 6, 25);
    door.endFill();

    // Door highlight
    door.beginFill(0xffffff, 0.1);
    door.drawRect(x, y, 3, height);
    door.endFill();

    // Doorknob
    door.beginFill(0xaaaaaa);
    door.drawCircle(x + width - 6, y + height / 2, 3);
    door.endFill();
    door.beginFill(0xdddddd);
    door.drawCircle(x + width - 7, y + height / 2 - 1, 1);
    door.endFill();

    container.addChild(door);
    sceneObjects.furniture.set('door', door as unknown as PIXI.Sprite);
  }

  function createCharacter(container: PIXI.Container) {
    const textures: PIXI.Texture[] = [];

    // Create 4-frame walking animation
    for (let frame = 0; frame < 4; frame++) {
      const graphics = new PIXI.Graphics();

      // Body
      graphics.beginFill(0x3498db);
      graphics.drawRect(6, 12, 20, 16);
      graphics.endFill();

      // Body highlight
      graphics.beginFill(0x5dade2);
      graphics.drawRect(6, 12, 20, 3);
      graphics.endFill();

      // Head
      graphics.beginFill(0xffdbac);
      graphics.drawRect(9, 2, 14, 12);
      graphics.endFill();

      // Hair
      graphics.beginFill(0x2c3e50);
      graphics.drawRect(9, 2, 14, 4);
      graphics.drawRect(9, 2, 3, 8);
      graphics.drawRect(20, 2, 3, 8);
      graphics.endFill();

      // Eyes
      graphics.beginFill(0x000000);
      const eyeOffset = frame % 2 === 0 ? 0 : 1;
      graphics.drawRect(11 + eyeOffset, 7, 3, 3);
      graphics.drawRect(18 + eyeOffset, 7, 3, 3);
      graphics.endFill();

      // Eye shine
      graphics.beginFill(0xffffff);
      graphics.drawRect(12 + eyeOffset, 8, 1, 1);
      graphics.drawRect(19 + eyeOffset, 8, 1, 1);
      graphics.endFill();

      // Legs with animation
      graphics.beginFill(0x2c3e50);
      if (frame === 0) {
        // Standing
        graphics.drawRect(8, 28, 6, 12);
        graphics.drawRect(18, 28, 6, 12);
      } else if (frame === 1) {
        // Left leg forward
        graphics.drawRect(5, 26, 5, 12);
        graphics.drawRect(20, 30, 5, 12);
      } else if (frame === 2) {
        // Standing again
        graphics.drawRect(8, 28, 6, 12);
        graphics.drawRect(18, 28, 6, 12);
      } else {
        // Right leg forward
        graphics.drawRect(6, 30, 5, 12);
        graphics.drawRect(19, 26, 5, 12);
      }
      graphics.endFill();

      // Shoes
      graphics.beginFill(0x8b4513);
      if (frame === 0 || frame === 2) {
        graphics.drawRect(7, 38, 8, 4);
        graphics.drawRect(17, 38, 8, 4);
      } else if (frame === 1) {
        graphics.drawRect(4, 36, 7, 4);
        graphics.drawRect(19, 40, 7, 4);
      } else {
        graphics.drawRect(5, 40, 7, 4);
        graphics.drawRect(18, 36, 7, 4);
      }
      graphics.endFill();

      textures.push(app.value!.renderer.generateTexture(graphics));
      graphics.destroy();
    }

    animations.set('idle', [textures[0]]);
    animations.set('walk', textures);

    const character = new PIXI.AnimatedSprite(textures);
    character.x = ROOM_LAYOUT.character.startX;
    character.y = ROOM_LAYOUT.character.startY;
    character.anchor.set(0.5, 1);
    character.scale.set(1.5);
    character.animationSpeed = 0.15;
    character.loop = true;
    character.play();
    container.addChild(character);
    sceneObjects.character = character;
  }

  function createDoorSign(container: PIXI.Container, projectName: string) {
    // Sign background with border
    const bg = new PIXI.Graphics();

    // Outer border
    bg.beginFill(0x1a1a2a);
    bg.lineStyle(2, 0x00ff65);
    bg.drawRect(10, 10, 200, 32);
    bg.endFill();

    // Inner glow
    bg.beginFill(0x00ff65, 0.1);
    bg.drawRect(12, 12, 196, 28);
    bg.endFill();

    container.addChild(bg);

    const style = new PIXI.TextStyle({
      fontFamily: 'Press Start 2P, monospace',
      fontSize: 10,
      fill: '#00ff65',
      dropShadow: true,
      dropShadowColor: '#004400',
      dropShadowBlur: 2,
      dropShadowDistance: 1,
    });

    const text = new PIXI.Text(formatProjectName(projectName), style);
    text.x = 18;
    text.y = 20;
    container.addChild(text);
    sceneObjects.doorSign = text;
  }

  function createPowerMeter(container: PIXI.Container, tokens: number) {
    const layout = ROOM_LAYOUT.furniture.powerMeter;

    // Background panel
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a1a2a);
    bg.lineStyle(2, 0x444455);
    bg.drawRect(layout.x, layout.y, layout.width, layout.height);
    bg.endFill();

    // Panel inner
    bg.beginFill(0x0a0a15);
    bg.drawRect(layout.x + 2, layout.y + 2, layout.width - 4, layout.height - 4);
    bg.endFill();
    container.addChild(bg);

    // Label background
    bg.beginFill(0x222233);
    bg.drawRect(layout.x + 5, layout.y + 5, layout.width - 10, 14);
    bg.endFill();

    // Fill bar background
    const fillBg = new PIXI.Graphics();
    fillBg.beginFill(0x0a0a1a);
    fillBg.lineStyle(1, 0x333344);
    fillBg.drawRect(layout.x + 5, layout.y + 22, layout.width - 10, 12);
    fillBg.endFill();
    container.addChild(fillBg);

    // Fill bar
    const fill = new PIXI.Graphics();
    fill.beginFill(getTokenColor(tokens));
    const fillWidth = Math.min(layout.width - 12, (tokens / 200000) * (layout.width - 12));
    fill.drawRect(layout.x + 6, layout.y + 23, Math.max(0, fillWidth), 10);
    fill.endFill();
    container.addChild(fill);

    // Text
    const style = new PIXI.TextStyle({
      fontFamily: 'VT323, monospace',
      fontSize: 12,
      fill: '#ffff00',
      dropShadow: true,
      dropShadowColor: '#444400',
      dropShadowDistance: 1,
    });

    const text = new PIXI.Text('⚡' + formatTokens(tokens), style);
    text.x = layout.x + 8;
    text.y = layout.y + 5;
    container.addChild(text);

    sceneObjects.powerMeter = { bg: fillBg, fill, text };
  }

  function createEmote(container: PIXI.Container) {
    const style = new PIXI.TextStyle({
      fontFamily: 'Segoe UI Emoji, Apple Color Emoji, sans-serif',
      fontSize: 20,
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      dropShadow: true,
      dropShadowColor: '#000000',
      dropShadowBlur: 2,
      dropShadowDistance: 2,
    });

    const emote = new PIXI.Text('', style);
    emote.anchor.set(0.5);
    emote.visible = false;
    container.addChild(emote);
    sceneObjects.emote = emote;
  }

  function gameLoop(delta: number) {
    if (!sceneObjects.character) return;
    const char = sceneObjects.character;

    if (moveTarget) {
      const dx = moveTarget.x - char.x;
      const dy = moveTarget.y - char.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 2) {
        const speed = ROOM_LAYOUT.character.speed * delta;
        char.x += (dx / distance) * speed;
        char.y += (dy / distance) * speed;
        if (currentState.value !== 'walking') {
          currentState.value = 'walking';
          playAnimation('walk');
        }
      } else {
        char.x = moveTarget.x;
        char.y = moveTarget.y;
        moveTarget = null;
        if (onArriveCallback) {
          onArriveCallback();
          onArriveCallback = null;
        }
      }
    } else if (currentState.value === 'walking') {
      currentState.value = 'idle';
      playAnimation('idle');
    }

    if (sceneObjects.emote && sceneObjects.emote.visible) {
      sceneObjects.emote.x = char.x;
      sceneObjects.emote.y = char.y - 55 + Math.sin(Date.now() / 200) * 3;
    }

    if (currentState.value === 'idle' && !moveTarget && !idleTimer) {
      idleTimer = setTimeout(() => {
        if (currentState.value === 'idle' && !moveTarget) {
          const randomX = 60 + Math.random() * 200;
          const randomY = 100 + Math.random() * 120;
          moveTo({ x: randomX, y: randomY });
        }
        idleTimer = null;
      }, 3000 + Math.random() * 5000);
    }
  }

  function moveTo(target: Position, onArrive?: () => void) {
    moveTarget = target;
    onArriveCallback = onArrive || null;
  }

  function playAnimation(name: string) {
    const textures = animations.get(name);
    if (textures && sceneObjects.character) {
      sceneObjects.character.textures = textures;
      sceneObjects.character.play();
    }
  }

  function showEmote(emote: EmoteType) {
    if (!sceneObjects.emote) return;
    currentEmote.value = emote;

    if (emote && EMOTE_CONFIG[emote]) {
      sceneObjects.emote.text = EMOTE_CONFIG[emote].emoji;
      sceneObjects.emote.style.fill = EMOTE_CONFIG[emote].color;
      sceneObjects.emote.visible = true;
      sceneObjects.emote.alpha = 0;
      sceneObjects.emote.scale.set(0.5);

      // Pop-in animation
      let progress = 0;
      const fadeTicker = (delta: number) => {
        progress += 0.1 * delta;
        if (sceneObjects.emote) {
          sceneObjects.emote.alpha = Math.min(1, progress);
          sceneObjects.emote.scale.set(Math.min(1, 0.5 + progress * 0.5));
        }
        if (progress >= 1) {
          app.value?.ticker.remove(fadeTicker);
        }
      };
      app.value?.ticker.add(fadeTicker);
    } else {
      sceneObjects.emote.visible = false;
    }
  }

  function updateState(level: StatusLevel, key: string, detail?: string) {
    const mapping = getStateActionMapping(level, key, detail);
    moveTarget = null;

    if (mapping.targetPosition) {
      moveTo(mapping.targetPosition, () => {
        currentState.value = mapping.state;
        playAnimation(mapping.animation);
      });
    } else {
      currentState.value = mapping.state;
      playAnimation(mapping.animation);
    }
    showEmote(mapping.emote);
  }

  function updateTokens(tokens: number) {
    if (!sceneObjects.powerMeter) return;
    const layout = ROOM_LAYOUT.furniture.powerMeter;
    sceneObjects.powerMeter.text.text = '⚡' + formatTokens(tokens);
    sceneObjects.powerMeter.fill.clear();
    sceneObjects.powerMeter.fill.beginFill(getTokenColor(tokens));
    const fillWidth = Math.min(layout.width - 12, (tokens / 200000) * (layout.width - 12));
    sceneObjects.powerMeter.fill.drawRect(layout.x + 6, layout.y + 23, Math.max(0, fillWidth), 10);
    sceneObjects.powerMeter.fill.endFill();
  }

  function updateProjectName(name: string) {
    if (sceneObjects.doorSign) {
      sceneObjects.doorSign.text = formatProjectName(name);
    }
  }

  function destroy() {
    if (idleTimer) clearTimeout(idleTimer);
    app.value?.destroy(true);
    app.value = null;
    isReady.value = false;
  }

  function formatProjectName(name: string): string {
    const maxLength = 20;
    if (name.length > maxLength) {
      return name.slice(0, maxLength - 3) + '...';
    }
    return name;
  }

  function formatTokens(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  }

  function getTokenColor(tokens: number): number {
    if (tokens > 150000) return 0xff2244;
    if (tokens > 100000) return 0xffaa00;
    return 0x00ff65;
  }

  onMounted(init);
  onUnmounted(destroy);

  return {
    app,
    isReady,
    currentState,
    currentEmote,
    updateState,
    updateTokens,
    updateProjectName,
  };
}
