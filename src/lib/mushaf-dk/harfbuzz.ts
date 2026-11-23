// A thin wrapper over stock HarfBuzz compiled to WASM (harfbuzzjs 0.4.5, MIT; the
// same hb.wasm digitalkhatt.org ships, byte for byte). Adapted from DigitalKhatt's
// harfbuzz.ts (digitalkhatt-js, MIT), itself from harfbuzzjs's harfbuzz.ts (MIT).
// Changes: heap views are re-read on every use (the WASM memory grows when the
// 2.3 MB font is loaded, which detaches views taken earlier), no globals beyond
// the one module instance, and works the same in the browser and in Node (tests).

/* eslint-disable @typescript-eslint/no-explicit-any */

type Pointer = number;

export interface HBFeature {
  tag: string;
  value: number;
  start: number;
  /** -1 = to the end of the buffer */
  end: number;
}

export interface GlyphInfo {
  glyphId: number;
  cluster: number;
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

const HB_MEMORY_MODE_WRITABLE = 2;

export function hbTag(s: string): number {
  return ((s.charCodeAt(0) & 0xff) << 24) | ((s.charCodeAt(1) & 0xff) << 16) | ((s.charCodeAt(2) & 0xff) << 8) | (s.charCodeAt(3) & 0xff);
}

/** The emscripten module that hb.js resolves to */
export interface HarfBuzzModule {
  wasmExports: any;
  addFunction: (fn: (...args: number[]) => void, sig: string) => number;
}

export class HarfBuzz {
  readonly x: any;
  readonly arabScript: number;
  readonly arabLanguage: number;
  private readonly freePtr: number;

  constructor(readonly module: HarfBuzzModule) {
    this.x = module.wasmExports;
    this.freePtr = module.addFunction((ptr: number) => this.x.free(ptr), 'vi');
    let s = this.ascii('Arab');
    this.arabScript = this.x.hb_script_from_string(s, -1);
    this.x.free(s);
    s = this.ascii('ar');
    this.arabLanguage = this.x.hb_language_from_string(s, -1);
    this.x.free(s);
  }

  get u8() { return new Uint8Array(this.x.memory.buffer); }
  get u32() { return new Uint32Array(this.x.memory.buffer); }
  get i32() { return new Int32Array(this.x.memory.buffer); }

  private ascii(text: string): Pointer {
    const ptr = this.x.malloc(text.length + 1);
    const heap = this.u8;
    for (let i = 0; i < text.length; i++) heap[ptr + i] = text.charCodeAt(i);
    heap[ptr + text.length] = 0;
    return ptr;
  }

  loadFont(data: Uint8Array): HBFont {
    const ptr = this.x.malloc(data.byteLength);
    this.u8.set(data, ptr);
    const blob = this.x.hb_blob_create(ptr, data.byteLength, HB_MEMORY_MODE_WRITABLE, ptr, this.freePtr);
    const face = this.x.hb_face_create(blob, 0);
    const font = new HBFont(this, face);
    this.x.hb_face_destroy(face);
    this.x.hb_blob_destroy(blob);
    return font;
  }
}

export class HBFont {
  readonly ptr: Pointer;
  readonly upem: number;
  private drawFuncs: Pointer;
  private path = '';
  private readonly pathCache = new Map<number, string>();

  constructor(private readonly hb: HarfBuzz, face: Pointer) {
    this.ptr = hb.x.hb_font_create(face);
    this.upem = hb.x.hb_face_get_upem(face);
    const r = (n: number) => Math.round(n);
    const add = hb.module.addFunction;
    const moveTo = add((_f, _d, _s, x, y) => { this.path += `M${r(x)} ${r(y)}`; }, 'viiiffi');
    const lineTo = add((_f, _d, _s, x, y) => { this.path += `L${r(x)} ${r(y)}`; }, 'viiiffi');
    const cubicTo = add((_f, _d, _s, a, b, c, d, x, y) => { this.path += `C${r(a)} ${r(b)} ${r(c)} ${r(d)} ${r(x)} ${r(y)}`; }, 'viiiffffffi');
    const quadTo = add((_f, _d, _s, a, b, x, y) => { this.path += `Q${r(a)} ${r(b)} ${r(x)} ${r(y)}`; }, 'viiiffffi');
    const close = add(() => { this.path += 'Z'; }, 'viiii');
    const x = hb.x;
    this.drawFuncs = x.hb_draw_funcs_create();
    x.hb_draw_funcs_set_move_to_func(this.drawFuncs, moveTo, 0, 0);
    x.hb_draw_funcs_set_line_to_func(this.drawFuncs, lineTo, 0, 0);
    x.hb_draw_funcs_set_cubic_to_func(this.drawFuncs, cubicTo, 0, 0);
    x.hb_draw_funcs_set_quadratic_to_func(this.drawFuncs, quadTo, 0, 0);
    x.hb_draw_funcs_set_close_path_func(this.drawFuncs, close, 0, 0);
  }

  /** The glyph outline as SVG path data in font units (y up), cached per glyph */
  glyphPath(glyphId: number): string {
    let d = this.pathCache.get(glyphId);
    if (d === undefined) {
      this.path = '';
      this.hb.x.hb_font_draw_glyph(this.ptr, glyphId, this.drawFuncs, 0);
      d = this.path;
      this.pathCache.set(glyphId, d);
    }
    return d;
  }

  /** Shape RTL Arabic text; features carry per-character ranges (UTF-16 indices) */
  shape(text: string, features: HBFeature[] | null | undefined): GlyphInfo[] {
    const hb = this.hb;
    const x = hb.x;
    const buf = x.hb_buffer_create();
    x.hb_buffer_set_direction(buf, 5); // rtl
    x.hb_buffer_set_language(buf, hb.arabLanguage);
    x.hb_buffer_set_script(buf, hb.arabScript);
    x.hb_buffer_set_cluster_level(buf, 1);
    const sp = x.malloc(text.length * 2 + 2);
    const words = new Uint16Array(x.memory.buffer, sp, text.length);
    for (let i = 0; i < text.length; i++) words[i] = text.charCodeAt(i);
    x.hb_buffer_add_utf16(buf, sp, text.length, 0, text.length);
    x.free(sp);
    let fp = 0;
    const n = features?.length ?? 0;
    if (n) {
      fp = x.malloc(16 * n);
      const u32 = hb.u32;
      for (let i = 0; i < n; i++) {
        const f = features![i];
        u32[fp / 4 + i * 4] = hbTag(f.tag);
        u32[fp / 4 + i * 4 + 1] = f.value;
        u32[fp / 4 + i * 4 + 2] = f.start;
        u32[fp / 4 + i * 4 + 3] = f.end; // -1 wraps to 0xFFFFFFFF = HB_FEATURE_GLOBAL_END
      }
    }
    x.hb_shape(this.ptr, buf, fp, n);
    if (fp) x.free(fp);
    const len = x.hb_buffer_get_length(buf);
    const ip = x.hb_buffer_get_glyph_infos(buf, 0) / 4;
    const pp = x.hb_buffer_get_glyph_positions(buf, 0) / 4;
    const u32 = hb.u32;
    const i32 = hb.i32;
    const out: GlyphInfo[] = new Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = {
        glyphId: u32[ip + i * 5],
        cluster: u32[ip + i * 5 + 2],
        xAdvance: i32[pp + i * 5],
        xOffset: i32[pp + i * 5 + 2],
        yOffset: i32[pp + i * 5 + 3],
      };
    }
    x.hb_buffer_destroy(buf);
    return out;
  }

  /** Advance width of shaped text, in font units */
  width(text: string, features?: HBFeature[] | null): number {
    let w = 0;
    for (const g of this.shape(text, features)) w += g.xAdvance;
    return w;
  }
}
