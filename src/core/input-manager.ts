export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  item: boolean;
  pause: boolean;
  confirm: boolean;
}

/** Polls keyboard & gamepad each frame, exposes unified InputState */
export class InputManager {
  private keys = new Set<string>();
  private prevPause = false;
  private prevConfirm = false;

  /** Current frame's input */
  state: InputState = {
    forward: false, backward: false, left: false, right: false,
    drift: false, item: false, pause: false, confirm: false,
  };

  /** True only on the frame the button was pressed */
  pausePressed = false;
  confirmPressed = false;
  itemPressed = false;
  private prevItem = false;

  /** Touch controls */
  readonly isTouchDevice: boolean;
  private touchControls: HTMLElement | null = null;
  private touchState = { left: false, right: false, drift: false, item: false };
  private autoAccelerate = false;

  constructor() {
    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      e.preventDefault();
    });
    // Prevent context menu on right-click
    window.addEventListener('contextmenu', e => e.preventDefault());

    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (this.isTouchDevice) {
      this.createTouchControls();
    }
  }

  setTouchControlsVisible(visible: boolean): void {
    if (!this.touchControls) return;
    this.touchControls.style.display = visible ? 'flex' : 'none';
    this.autoAccelerate = visible;
    if (!visible) {
      this.touchState.left = false;
      this.touchState.right = false;
      this.touchState.drift = false;
      this.touchState.item = false;
    }
  }

  update(): void {
    const k = this.keys;

    this.state.forward = k.has('ArrowUp') || k.has('KeyW');
    this.state.backward = k.has('ArrowDown') || k.has('KeyS');
    this.state.left = k.has('ArrowLeft') || k.has('KeyA');
    this.state.right = k.has('ArrowRight') || k.has('KeyD');
    this.state.drift = k.has('Space');
    this.state.item = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyX');
    this.state.pause = k.has('Escape') || k.has('KeyP');
    this.state.confirm = k.has('Enter') || k.has('Space');

    // Merge touch input
    if (this.autoAccelerate) this.state.forward = true;
    if (this.touchState.left) this.state.left = true;
    if (this.touchState.right) this.state.right = true;
    if (this.touchState.drift) this.state.drift = true;
    if (this.touchState.item) this.state.item = true;

    // Edge detection (pressed this frame only)
    this.pausePressed = this.state.pause && !this.prevPause;
    this.confirmPressed = this.state.confirm && !this.prevConfirm;
    this.itemPressed = this.state.item && !this.prevItem;

    this.prevPause = this.state.pause;
    this.prevConfirm = this.state.confirm;
    this.prevItem = this.state.item;

    // Gamepad support
    this.pollGamepad();
  }

  private pollGamepad(): void {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0];
    if (!gp) return;

    const deadzone = 0.15;
    const lx = Math.abs(gp.axes[0]) > deadzone ? gp.axes[0] : 0;

    if (lx < -deadzone) this.state.left = true;
    if (lx > deadzone) this.state.right = true;
    if (gp.buttons[0]?.pressed) this.state.forward = true;    // A
    if (gp.buttons[1]?.pressed) this.state.backward = true;   // B
    if (gp.buttons[5]?.pressed || gp.buttons[7]?.pressed) this.state.drift = true; // RB/RT
    if (gp.buttons[4]?.pressed || gp.buttons[6]?.pressed) {   // LB/LT
      this.state.item = true;
      if (!this.prevItem) this.itemPressed = true;
    }
    if (gp.buttons[9]?.pressed) {                              // Start
      this.state.pause = true;
      if (!this.prevPause) this.pausePressed = true;
    }
  }

  private createTouchControls(): void {
    const overlay = document.createElement('div');
    overlay.id = 'touch-controls';
    overlay.style.cssText = `
      display: none;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: 140px;
      justify-content: space-between;
      align-items: flex-end;
      padding: 0 12px 12px;
      pointer-events: none;
      z-index: 1000;
      user-select: none;
      -webkit-user-select: none;
    `;

    // Left side: steer buttons
    const leftGroup = document.createElement('div');
    leftGroup.style.cssText = `
      display: flex; gap: 8px;
      pointer-events: auto;
    `;

    const btnLeft = this.makeTouchButton('◀', 'left');
    const btnRight = this.makeTouchButton('▶', 'right');
    leftGroup.appendChild(btnLeft);
    leftGroup.appendChild(btnRight);

    // Right side: drift + item
    const rightGroup = document.createElement('div');
    rightGroup.style.cssText = `
      display: flex; gap: 8px;
      pointer-events: auto;
    `;

    const btnItem = this.makeTouchButton('🎁', 'item', 60, '#ffaa00');
    const btnDrift = this.makeTouchButton('💨', 'drift', 76, '#ff55aa');
    rightGroup.appendChild(btnItem);
    rightGroup.appendChild(btnDrift);

    overlay.appendChild(leftGroup);
    overlay.appendChild(rightGroup);
    document.body.appendChild(overlay);
    this.touchControls = overlay;
  }

  private makeTouchButton(
    label: string,
    key: 'left' | 'right' | 'drift' | 'item',
    size = 70,
    color = '#ffffff33',
  ): HTMLElement {
    const btn = document.createElement('div');
    btn.textContent = label;
    btn.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      border-radius: ${size / 2}px;
      background: ${color}44;
      border: 3px solid ${color};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${size * 0.45}px;
      color: #fff;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    `;

    const onDown = (e: Event) => {
      e.preventDefault();
      this.touchState[key] = true;
      btn.style.background = `${color}aa`;
    };
    const onUp = (e: Event) => {
      e.preventDefault();
      this.touchState[key] = false;
      btn.style.background = `${color}44`;
    };

    btn.addEventListener('touchstart', onDown, { passive: false });
    btn.addEventListener('touchend', onUp, { passive: false });
    btn.addEventListener('touchcancel', onUp, { passive: false });

    return btn;
  }
}
