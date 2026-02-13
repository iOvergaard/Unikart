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
}
