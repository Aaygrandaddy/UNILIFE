/** Keyboard, mouse, pointer-lock and touch input in one place. */
export class Input {
  private keys = new Set<string>();
  private virtual = new Set<string>();
  private pressed = new Set<string>();
  lookDX = 0;
  lookDY = 0;
  lastLookAt = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private touchId: number | null = null;

  constructor(private el: HTMLElement) {
    const typing = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    addEventListener('keydown', (e) => {
      if (e.repeat || typing(e)) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.virtual.clear();
    });

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === el) this.look(e.movementX, e.movementY);
      else if (this.dragging) {
        this.look(e.clientX - this.lastX, e.clientY - this.lastY);
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    el.addEventListener('dblclick', () => el.requestPointerLock?.());

    el.addEventListener(
      'touchstart',
      (e) => {
        if (this.touchId !== null) return;
        const t = e.changedTouches[0];
        this.touchId = t.identifier;
        this.lastX = t.clientX;
        this.lastY = t.clientY;
      },
      { passive: true },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== this.touchId) continue;
          this.look((t.clientX - this.lastX) * 1.4, (t.clientY - this.lastY) * 1.4);
          this.lastX = t.clientX;
          this.lastY = t.clientY;
        }
      },
      { passive: true },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.touchId) this.touchId = null;
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  private look(dx: number, dy: number) {
    this.lookDX += dx;
    this.lookDY += dy;
    this.lastLookAt = performance.now();
  }

  /** Bind an on-screen button that acts like holding a key. */
  bindHold(btn: HTMLElement, code: string) {
    const on = (e: Event) => {
      e.preventDefault();
      this.virtual.add(code);
      btn.classList.add('is-active');
    };
    const off = () => {
      this.virtual.delete(code);
      btn.classList.remove('is-active');
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Bind an on-screen button that acts like a single key press. */
  bindTap(btn: HTMLElement, code: string) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pressed.add(code);
    });
  }

  /** Hold or release a key from code (used by the debug filming mode). */
  hold(code: string, on: boolean) {
    if (on) this.virtual.add(code);
    else this.virtual.delete(code);
  }

  down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c) || this.virtual.has(c));
  }

  tap(code: string) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.lookDX = 0;
    this.lookDY = 0;
  }
}
