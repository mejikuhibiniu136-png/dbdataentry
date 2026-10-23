// Renderer DOM untuk pohon GUI Roblox yang dibangun skrip Lua. Satu elemen DOM per Instance, diperbarui langsung
// tiap properti diubah (real-time). Teks selalu lewat textContent (tidak pernah innerHTML), gambar rbxthumb:// tidak
// dimuat (diganti placeholder), jadi skrip tidak bisa menyisipkan HTML/skrip ke halaman.
import { BUTTON_CLASSES, DEFAULT_BG, GUI_CLASSES, alignX, alignY, cornerRadius, decode, fontStyle, layoutStyle, rgba, type Val } from '@/lib/lualab/css';
import type { RenderOp } from '@/lib/lualab/runtime';

export const STAGE_W = 960;
export const STAGE_H = 540;
export type StageEvent = (id: number, event: string, kind: string, x: number, y: number) => void;

interface Node {
  id: number; cls: string; el: HTMLElement | null; text: HTMLElement | null; parent: number;
  bg: [number, number, number]; bgT: number; tc: [number, number, number]; tT: number;
  stroke: { color: [number, number, number]; thickness: number; t: number; on: boolean };
  props: Map<string, Val>;
}

export class Stage {
  private nodes = new Map<number, Node>();
  private scaleBox: HTMLElement;
  private offs: (() => void)[] = [];

  constructor(private host: HTMLElement, private onEvent: StageEvent) {
    host.replaceChildren();
    host.style.position = 'relative';
    host.style.overflow = 'hidden';
    this.scaleBox = document.createElement('div');
    Object.assign(this.scaleBox.style, { position: 'absolute', left: '0', top: '0', width: `${STAGE_W}px`, height: `${STAGE_H}px`, transformOrigin: 'top left', userSelect: 'none', touchAction: 'none' });
    host.appendChild(this.scaleBox);
    const fit = () => { this.scaleBox.style.transform = `scale(${host.clientWidth / STAGE_W})`; };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    const move = (e: PointerEvent) => { const [x, y] = this.local(e); this.onEvent(0, 'Move', '', x, y); };
    const up = () => this.onEvent(0, 'InputEnded', '', 0, 0);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.offs.push(() => ro.disconnect(), () => window.removeEventListener('pointermove', move), () => window.removeEventListener('pointerup', up));
  }

  private scale() { return this.host.clientWidth / STAGE_W || 1; }
  private local(e: PointerEvent): [number, number] {
    const r = this.host.getBoundingClientRect();
    const s = this.scale();
    return [(e.clientX - r.left) / s, (e.clientY - r.top) / s];
  }

  apply(op: RenderOp): void {
    switch (op.t) {
      case 'create': return this.create(op.id, op.cls);
      case 'set': return this.set(op.id, op.prop, op.v);
      case 'parent': return this.reparent(op.id, op.parent);
      case 'destroy': return this.destroy(op.id);
    }
  }

  private create(id: number, cls: string) {
    const n: Node = { id, cls, el: null, text: null, parent: 0, bg: DEFAULT_BG, bgT: 0, tc: [0, 0, 0], tT: 0, stroke: { color: [0, 0, 0], thickness: 1, t: 0, on: true }, props: new Map() };
    this.nodes.set(id, n);
    if (cls === 'CoreGui') { n.el = this.scaleBox; return; }
    if (cls === 'UICorner' || cls === 'UIStroke') return;
    const el = document.createElement('div');
    n.el = el;
    el.dataset.cls = cls;
    el.dataset.id = String(id);
    const s = el.style;
    if (cls === 'Folder') { s.display = 'contents'; return; }
    if (cls === 'ScreenGui') { Object.assign(s, { position: 'absolute', inset: '0', pointerEvents: 'none' }); return; }
    if (!GUI_CLASSES.has(cls)) { s.display = 'none'; return; }
    Object.assign(s, { position: 'absolute', boxSizing: 'border-box', left: '0', top: '0', width: '100px', height: '100px', pointerEvents: 'auto', color: rgba([0, 0, 0]), fontSize: '14px' });
    if (BUTTON_CLASSES.has(cls)) { s.cursor = 'pointer'; el.setAttribute('role', 'button'); }
    if (cls === 'ScrollingFrame') { s.overflowX = 'hidden'; s.overflowY = 'auto'; s.scrollbarWidth = 'thin'; }
    if (cls === 'ImageLabel' || cls === 'ImageButton') { s.backgroundImage = 'none'; }
    this.paintBg(n);
    this.bind(n);
  }

  private bind(n: Node) {
    const el = n.el!;
    const kind = (e: PointerEvent) => (e.pointerType === 'touch' ? 'Touch' : 'MouseButton1');
    el.addEventListener('pointerenter', () => this.onEvent(n.id, 'MouseEnter', '', 0, 0));
    el.addEventListener('pointerleave', () => this.onEvent(n.id, 'MouseLeave', '', 0, 0));
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const [x, y] = this.local(e);
      this.onEvent(n.id, 'MouseButton1Down', '', x, y);
      this.onEvent(n.id, 'InputBegan', kind(e), x, y);
    });
    el.addEventListener('pointerup', () => this.onEvent(n.id, 'MouseButton1Up', '', 0, 0));
    if (BUTTON_CLASSES.has(n.cls)) el.addEventListener('click', () => this.onEvent(n.id, 'Activated', '', 0, 0));
  }

  private paintBg(n: Node) {
    if (!n.el) return;
    n.el.style.backgroundColor = rgba(n.bg, n.bgT);
  }
  private paintText(n: Node) {
    if (n.text) n.text.style.color = rgba(n.tc, n.tT);
  }
  private paintStroke(p: Node, strokeNode: Node) {
    if (!p.el) return;
    const s = strokeNode.stroke;
    p.el.style.boxShadow = s.on && s.thickness > 0 && s.t < 1 ? `inset 0 0 0 ${s.thickness}px ${rgba(s.color, s.t)}` : '';
  }
  private textEl(n: Node): HTMLElement {
    if (n.text) return n.text;
    const span = document.createElement('span');
    Object.assign(span.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', overflow: 'hidden', whiteSpace: 'nowrap', lineHeight: '1.15' });
    const t = document.createElement('i');
    Object.assign(t.style, { fontStyle: 'normal', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' });
    span.appendChild(t);
    n.el!.prepend(span);
    n.text = span;
    this.paintText(n);
    return span;
  }

  private set(id: number, prop: string, raw: string) {
    const n = this.nodes.get(id);
    const v = decode(raw);
    if (!n || !v) return;
    n.props.set(prop, v);

    // Dekorasi yang menempel ke induk.
    if (n.cls === 'UICorner' && prop === 'CornerRadius') { const p = this.nodes.get(n.parent); const r = cornerRadius(v); if (p?.el && r) p.el.style.borderRadius = r; return; }
    if (n.cls === 'UIStroke') {
      if (prop === 'Color' && v.k === 'c') n.stroke.color = v.v;
      else if (prop === 'Thickness' && v.k === 'n') n.stroke.thickness = v.v;
      else if (prop === 'Transparency' && v.k === 'n') n.stroke.t = v.v;
      else if (prop === 'Enabled' && v.k === 'b') n.stroke.on = v.v;
      const p = this.nodes.get(n.parent);
      if (p) this.paintStroke(p, n);
      return;
    }
    const el = n.el;
    if (!el || n.cls === 'CoreGui') return;

    const lay = layoutStyle(prop, v);
    if (lay) { Object.assign(el.style, lay); return; }
    switch (prop) {
      case 'Name': el.dataset.name = v.k === 's' ? v.v : ''; break;
      case 'Visible': el.style.display = v.k === 'b' && !v.v ? 'none' : (n.cls === 'Folder' ? 'contents' : ''); break;
      case 'Enabled': if (n.cls === 'ScreenGui') el.style.display = v.k === 'b' && !v.v ? 'none' : ''; break;
      case 'ZIndex': if (v.k === 'n') el.style.zIndex = String(v.v); break;
      case 'ClipsDescendants': el.style.overflow = v.k === 'b' && v.v ? 'hidden' : el.style.overflow; break;
      case 'BackgroundColor3': if (v.k === 'c') { n.bg = v.v; this.paintBg(n); } break;
      case 'BackgroundTransparency': if (v.k === 'n') { n.bgT = v.v; this.paintBg(n); } break;
      case 'Text': if (v.k === 's') this.textEl(n).firstElementChild!.textContent = v.v; break;
      case 'TextColor3': if (v.k === 'c') { n.tc = v.v; this.paintText(n); } break;
      case 'TextTransparency': if (v.k === 'n') { n.tT = v.v; this.paintText(n); } break;
      case 'TextSize': if (v.k === 'n') el.style.fontSize = `${v.v}px`; break;
      case 'Font': if (v.k === 'e') Object.assign(el.style, fontStyle(v.v.split('.').pop() ?? '')); break;
      case 'TextXAlignment': if (v.k === 'e') this.textEl(n).style.justifyContent = alignX(v.v); break;
      case 'TextYAlignment': if (v.k === 'e') this.textEl(n).style.alignItems = alignY(v.v); break;
      case 'TextWrapped': { const t = this.textEl(n); t.style.whiteSpace = v.k === 'b' && v.v ? 'normal' : 'nowrap'; break; }
      case 'Image': if (v.k === 's') this.placeholderImage(n, v.v); break;
      default: break;
    }
  }

  // rbxthumb:// / rbxassetid:// tidak bisa dimuat di luar Roblox: tampilkan lingkaran placeholder, bukan permintaan jaringan.
  private placeholderImage(n: Node, src: string) {
    if (!n.el) return;
    n.el.style.backgroundImage = 'linear-gradient(135deg, #22d3ee, #8b5cf6)';
    n.el.title = `Gambar Roblox (${src.split('?')[0].slice(0, 40)}) tidak dimuat di Test Lab`;
  }

  private reparent(id: number, parent: number) {
    const n = this.nodes.get(id);
    if (!n) return;
    n.parent = parent;
    const p = parent ? this.nodes.get(parent) : null;
    if (n.cls === 'UICorner' || n.cls === 'UIStroke') { if (p) { for (const [k, v] of n.props) this.set(id, k, rawOf(v)); } return; }
    if (!n.el) return;
    if (p?.el) p.el.appendChild(n.el);
    else n.el.remove();
  }

  private destroy(id: number) {
    const n = this.nodes.get(id);
    if (!n) return;
    if (n.cls === 'UICorner' || n.cls === 'UIStroke') { const p = this.nodes.get(n.parent); if (p?.el) { if (n.cls === 'UICorner') p.el.style.borderRadius = ''; else p.el.style.boxShadow = ''; } }
    if (n.el && n.cls !== 'CoreGui') n.el.remove();
    this.nodes.delete(id);
  }

  // ----- dipakai self-test -----
  nodeCount(): number { return this.nodes.size; }
  private labels(): HTMLElement[] { return [...this.scaleBox.querySelectorAll<HTMLElement>('i')]; }
  private visible(el: HTMLElement): boolean { return typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null; }
  /** Teks yang sedang TERLIHAT di panel (elemen tersembunyi tidak dihitung). */
  visibleTexts(): string[] { return this.labels().filter((l) => this.visible(l)).map((l) => l.textContent ?? '').filter(Boolean); }
  hasVisibleText(substr: string): boolean { return this.visibleTexts().some((t) => t.includes(substr)); }
  /** Klik tombol bertuliskan persis `label` (seperti pemain menekan tombol). */
  clickText(label: string): boolean {
    const hit = this.labels().find((l) => l.textContent === label && this.visible(l));
    const btn = hit?.closest<HTMLElement>('[data-cls="TextButton"],[data-cls="ImageButton"]');
    if (!btn) return false;
    btn.click();
    return true;
  }

  destroyAll(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.nodes.clear();
    this.host.replaceChildren();
  }
}

function rawOf(v: Val): string {
  switch (v.k) {
    case 'n': return `n:${v.v}`; case 'b': return `b:${v.v ? 1 : 0}`; case 's': return `s:${v.v}`; case 'e': return `e:${v.v}`;
    case 'u2': return `u2:${v.v.join(',')}`; case 'u': return `u:${v.v.join(',')}`; case 'v2': return `v2:${v.v.join(',')}`; case 'c': return `c:${v.v.join(',')}`;
  }
}
