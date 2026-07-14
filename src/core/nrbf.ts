// MS-NRBF (.NET BinaryFormatter) reader — the format used by many Unity/C# mobile
// games (e.g. Murder Hill's Save.dat). It walks the serialized object graph and
// collects every editable Int32 / UInt32 / Boolean together with the class + member
// name it belongs to, so the UI (and the AI agent) can label and edit them.
//
// Robustness note: deeply-nested generic dictionaries can drift the walker. When
// that happens we stop cleanly and keep everything collected up to that point, then
// a separate byte-pattern pass (`scanResourceDicts`) recovers the dictionary-backed
// resource amounts the walker missed. Same two-pronged approach that worked by hand.

export type FieldKind = "i32" | "u32" | "bool";

export interface NrbfField {
  id: string;
  offset: number;
  kind: FieldKind;
  value: number; // bool is 0/1
  className: string;
  member: string;
}

export interface ScanResult {
  fields: NrbfField[];
  parsedTo: number;
  size: number;
  drift?: string; // set if the walker stopped early
}

/** A .NET BinaryFormatter stream starts with the SerializedStreamHeader record (type 0). */
export function isNrbf(bytes: Uint8Array): boolean {
  return bytes.length > 17 && bytes[0] === 0x00;
}

class Walker {
  p = 0;
  fields: NrbfField[] = [];
  private classes = new Map<number, { name: string; mnames: string[]; infos: [number, number][] }>();
  private d: Uint8Array;
  private dv: DataView;
  constructor(d: Uint8Array) {
    this.d = d;
    this.dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  }

  private u8(): number {
    return this.d[this.p++];
  }
  private i32(): number {
    const v = this.dv.getInt32(this.p, true);
    this.p += 4;
    return v;
  }
  private readLen(): number {
    let r = 0, s = 0;
    for (;;) {
      const b = this.d[this.p++];
      r |= (b & 0x7f) << s;
      if (!(b & 0x80)) break;
      s += 7;
    }
    return r >>> 0;
  }
  private readStr(): string {
    const n = this.readLen();
    const slice = this.d.subarray(this.p, this.p + n);
    this.p += n;
    // best-effort utf-8 decode (labels only; not round-tripped)
    let s = "";
    for (let i = 0; i < slice.length; i++) s += String.fromCharCode(slice[i]);
    return s;
  }

  private add(kind: FieldKind, off: number, value: number, cls: string, member: string) {
    this.fields.push({ id: `${off}:${kind}`, offset: off, kind, value, className: cls, member });
  }

  private readPrimitive(pt: number, cls: string, name: string) {
    const off = this.p;
    switch (pt) {
      case 8: { const v = this.dv.getInt32(this.p, true); this.p += 4; this.add("i32", off, v, cls, name); return; }
      case 15: { const v = this.dv.getUint32(this.p, true); this.p += 4; this.add("u32", off, v, cls, name); return; }
      case 1: { const v = this.d[this.p]; this.p += 1; this.add("bool", off, v, cls, name); return; }
      case 2: case 10: this.p += 1; return;                 // Byte / SByte
      case 7: case 14: this.p += 2; return;                 // Int16 / UInt16
      case 11: this.p += 4; return;                         // Single
      case 6: case 9: case 16: case 12: case 13: this.p += 8; return; // Double/Int64/UInt64/TimeSpan/DateTime
      case 5: case 18: this.readStr(); return;              // Decimal / String
      case 3: {                                             // Char (utf-8, 1–4 bytes)
        const b = this.d[this.p]; this.p += 1;
        if (b >= 0x80) this.p += 1 + (b >= 0xe0 ? 1 : 0) + (b >= 0xf0 ? 1 : 0);
        return;
      }
      default: throw new Error(`prim ${pt} @ ${off}`);
    }
  }

  private readTypeInfos(count: number): [number, number][] {
    const bts: number[] = [];
    for (let i = 0; i < count; i++) bts.push(this.d[this.p + i]);
    this.p += count;
    const infos: [number, number][] = [];
    for (const bt of bts) {
      if (bt === 0) infos.push([0, this.u8()]);
      else if (bt === 7) infos.push([7, this.u8()]);
      else if (bt === 1 || bt === 2 || bt === 5 || bt === 6) infos.push([bt, -1]);
      else if (bt === 3) { this.readStr(); infos.push([3, -1]); }
      else if (bt === 4) { this.readStr(); this.i32(); infos.push([4, -1]); }
      else throw new Error(`bt ${bt} @ ${this.p}`);
    }
    return infos;
  }

  private readMemberValue(bt: number, pt: number, cls: string, name: string) {
    if (bt === 0) this.readPrimitive(pt, cls, name);
    else this.record();
  }

  private cwmt(system: boolean) {
    const objid = this.i32();
    const name = this.readStr();
    const mc = this.i32();
    const mnames: string[] = [];
    for (let i = 0; i < mc; i++) mnames.push(this.readStr());
    const infos = this.readTypeInfos(mc);
    if (!system) this.i32(); // library id
    this.classes.set(objid, { name, mnames, infos });
    for (let i = 0; i < mc; i++) this.readMemberValue(infos[i][0], infos[i][1], name, mnames[i]);
  }

  private cwid() {
    this.i32(); // objid
    const meta = this.i32();
    const c = this.classes.get(meta);
    if (!c) throw new Error(`unknown class id ${meta} @ ${this.p}`);
    for (let i = 0; i < c.mnames.length; i++)
      this.readMemberValue(c.infos[i][0], c.infos[i][1], c.name, c.mnames[i]);
  }

  private binaryArray() {
    this.i32(); // objid
    const atype = this.u8();
    const rank = this.i32();
    const lengths: number[] = [];
    for (let i = 0; i < rank; i++) lengths.push(this.i32());
    if (atype === 3 || atype === 4 || atype === 5) for (let i = 0; i < rank; i++) this.i32();
    const [bt, pt] = this.readTypeInfos(1)[0];
    let total = 1;
    for (const l of lengths) total *= l;
    for (let i = 0; i < total; i++) this.readMemberValue(bt, pt, "<arr>", "elem");
  }

  private record() {
    const start = this.p;
    const rt = this.u8();
    switch (rt) {
      case 0: this.p += 16; return;
      case 12: this.i32(); this.readStr(); return;
      case 5: this.cwmt(false); return;
      case 3: this.cwmt(true); return;
      case 4: {
        this.i32(); this.readStr();
        const mc = this.i32();
        for (let i = 0; i < mc; i++) this.readStr();
        this.i32();
        for (let i = 0; i < mc; i++) this.record();
        return;
      }
      case 2: {
        this.i32(); this.readStr();
        const mc = this.i32();
        for (let i = 0; i < mc; i++) this.readStr();
        for (let i = 0; i < mc; i++) this.record();
        return;
      }
      case 1: this.cwid(); return;
      case 6: this.i32(); this.readStr(); return;
      case 9: this.i32(); return;
      case 10: return;
      case 13: this.u8(); return;
      case 14: this.i32(); return;
      case 8: { const pt = this.u8(); this.readPrimitive(pt, "<inline>", "value"); return; }
      case 7: this.binaryArray(); return;
      case 15: {
        this.i32(); const length = this.i32(); const pt = this.u8();
        for (let i = 0; i < length; i++) this.readPrimitive(pt, "<prim[]>", "e");
        return;
      }
      case 16: case 17: {
        this.i32(); const length = this.i32();
        for (let i = 0; i < length; i++) this.record();
        return;
      }
      case 11: throw new StopWalk();
      default: throw new Error(`record ${rt} @ ${start}`);
    }
  }

  walk(): ScanResult {
    let drift: string | undefined;
    try {
      while (this.p < this.d.length) this.record();
    } catch (e) {
      if (!(e instanceof StopWalk)) drift = e instanceof Error ? e.message : String(e);
    }
    return { fields: this.fields, parsedTo: this.p, size: this.d.length, drift };
  }
}

class StopWalk extends Error {}

/** Walk a .NET BinaryFormatter save and collect all editable numbers/booleans. */
export function scanNrbf(bytes: Uint8Array): ScanResult {
  return new Walker(bytes).walk();
}

/**
 * Recover dictionary-backed resource amounts the walker drifts on.
 * Games store `Dictionary<Int32,Int32>` resource tables as a run of
 * `01 <objid:negRef> <metaId:negRef> <key:i32> <value:i32>` records at a constant
 * 17-byte spacing (only int→int pairs are 17 bytes). We find the longest such run
 * and expose each amount as an editable field.
 */
export function scanResourceDicts(bytes: Uint8Array): NrbfField[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cands: number[] = [];
  for (let i = 5; i < bytes.length - 12; i++) {
    if (
      bytes[i - 5] === 0x01 &&
      bytes[i - 3] === 0xff && bytes[i - 2] === 0xff && bytes[i - 1] === 0xff &&
      bytes[i + 1] === 0xff && bytes[i + 2] === 0xff && bytes[i + 3] === 0xff
    ) cands.push(i);
  }
  // group into maximal runs of constant 17-byte spacing
  let best: number[] = [], run: number[] = [];
  for (const c of cands) {
    if (run.length && c - run[run.length - 1] === 17) run.push(c);
    else { if (run.length > best.length) best = run; run = [c]; }
  }
  if (run.length > best.length) best = run;
  if (best.length < 4) return [];

  const out: NrbfField[] = [];
  // definition pair value sits 9 bytes before the first rt=1 pair's metaId
  const defOff = best[0] - 9;
  if (defOff >= 0) {
    const key = dv.getInt32(best[0] - 13, true);
    out.push({ id: `${defOff}:i32`, offset: defOff, kind: "i32", value: dv.getInt32(defOff, true), className: "ResourcesData.SaveResources", member: `resource #${key}` });
  }
  for (const c of best) {
    const key = dv.getInt32(c + 4, true);
    const off = c + 8;
    out.push({ id: `${off}:i32`, offset: off, kind: "i32", value: dv.getInt32(off, true), className: "ResourcesData.SaveResources", member: `resource #${key}` });
  }
  return out;
}

/** Merge walker fields + recovered resource fields, deduped by offset. */
export function scanSave(bytes: Uint8Array): ScanResult {
  const res = scanNrbf(bytes);
  const seen = new Set(res.fields.map((f) => f.offset));
  for (const f of scanResourceDicts(bytes)) if (!seen.has(f.offset)) { res.fields.push(f); seen.add(f.offset); }
  res.fields.sort((a, b) => a.offset - b.offset);
  return res;
}

export interface Edit {
  offset: number;
  kind: FieldKind;
  value: number;
}

/** Apply length-preserving edits in place and return the modified bytes. */
export function applyEdits(bytes: Uint8Array, edits: Edit[]): Uint8Array {
  const out = bytes.slice();
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (const e of edits) {
    if (e.kind === "i32") dv.setInt32(e.offset, e.value | 0, true);
    else if (e.kind === "u32") dv.setUint32(e.offset, e.value >>> 0, true);
    else dv.setUint8(e.offset, e.value ? 1 : 0);
  }
  return out;
}
