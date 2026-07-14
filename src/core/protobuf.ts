// Schema-less Protocol Buffers reader for game saves that use protobuf (common in
// modern mobile games). Without a .proto schema we can't know field *names*, but the
// wire format still tells us every field's number, type, and value — enough to find
// and edit the numbers you care about (currency, resources, levels).
//
// Editing protobuf is NOT length-preserving (a varint can grow), so we re-encode.
// To stay faithful, every UNCHANGED field is re-emitted from its original raw bytes;
// only the path from the message root down to an edited leaf is re-encoded. Untouched
// data therefore comes out byte-identical.

import type { NrbfField } from "./nrbf";

interface PbNode {
  path: string; // e.g. "1.4.2" (field-number path)
  field: number;
  wire: number; // 0 varint, 1 fixed64, 2 length-delimited, 5 fixed32
  start: number; // offset of this field's tag in the original bytes
  end: number; // offset just past this field's value
  scalar?: number; // for wire 0/1/5
  edited?: boolean;
  newScalar?: number;
  children?: PbNode[]; // for wire 2 successfully parsed as a nested message
}

function readVarint(d: Uint8Array, p: number): [number, number] {
  let shift = 0, result = 0;
  for (;;) {
    if (p >= d.length) throw new Error("varint overrun");
    const b = d[p++];
    result += (b & 0x7f) * Math.pow(2, shift);
    if (!(b & 0x80)) break;
    shift += 7;
    if (shift > 63) throw new Error("varint too long");
  }
  return [result, p];
}

function encodeVarint(v: number): number[] {
  const out: number[] = [];
  let n = Math.max(0, Math.floor(v));
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n & 0x7f);
  return out;
}

function parseMessage(d: Uint8Array, start: number, end: number, prefix: string): PbNode[] {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const nodes: PbNode[] = [];
  let p = start;
  let idx = 0;
  while (p < end) {
    const tagStart = p;
    let tag: number;
    [tag, p] = readVarint(d, p);
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (field === 0) throw new Error("field 0");
    const path = `${prefix}${field}#${idx++}`;
    if (wire === 0) {
      let v: number;
      [v, p] = readVarint(d, p);
      nodes.push({ path, field, wire, start: tagStart, end: p, scalar: v });
    } else if (wire === 1) {
      if (p + 8 > end) throw new Error("fixed64 oob");
      nodes.push({ path, field, wire, start: tagStart, end: p + 8, scalar: Number(dv.getBigInt64(p, true)) });
      p += 8;
    } else if (wire === 5) {
      if (p + 4 > end) throw new Error("fixed32 oob");
      nodes.push({ path, field, wire, start: tagStart, end: p + 4, scalar: dv.getInt32(p, true) });
      p += 4;
    } else if (wire === 2) {
      let len: number;
      [len, p] = readVarint(d, p);
      const valStart = p, valEnd = p + len;
      if (valEnd > end) throw new Error("len oob");
      let children: PbNode[] | undefined;
      if (len > 0) {
        try { children = parseMessage(d, valStart, valEnd, `${path}.`); } catch { children = undefined; }
      }
      nodes.push({ path, field, wire, start: tagStart, end: valEnd, children });
      p = valEnd;
    } else {
      throw new Error(`wire ${wire}`); // groups (3/4) unsupported
    }
  }
  if (p !== end) throw new Error("trailing bytes");
  return nodes;
}

/** True if the bytes parse cleanly as a protobuf message end-to-end. */
export function looksProtobuf(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  try {
    const nodes = parseMessage(bytes, 0, bytes.length, "");
    // Require at least a couple of fields and some editable numbers to avoid
    // treating arbitrary binary as "protobuf".
    const scalars = countScalars(nodes);
    return nodes.length >= 2 && scalars >= 2;
  } catch {
    return false;
  }
}

function countScalars(nodes: PbNode[]): number {
  let n = 0;
  for (const nd of nodes) {
    if (nd.wire === 0 || nd.wire === 5) n++;
    if (nd.children) n += countScalars(nd.children);
  }
  return n;
}

function collect(nodes: PbNode[], out: NrbfField[], byPath: Map<string, PbNode>) {
  for (const nd of nodes) {
    byPath.set(nd.path, nd);
    if (nd.children) collect(nd.children, out, byPath);
    else if (nd.wire === 0 || nd.wire === 5) {
      out.push({
        id: nd.path,
        offset: nd.start,
        kind: nd.wire === 0 ? "u32" : "i32",
        value: nd.scalar ?? 0,
        className: "protobuf",
        member: `field ${nd.path.replace(/#\d+/g, "")}`,
      });
    }
  }
}

export interface ProtobufScan {
  fields: NrbfField[];
  root: PbNode[];
  byPath: Map<string, PbNode>;
}

/** Parse a protobuf save into editable scalar fields. Returns null if it isn't protobuf. */
export function scanProtobuf(bytes: Uint8Array): ProtobufScan | null {
  let root: PbNode[];
  try {
    root = parseMessage(bytes, 0, bytes.length, "");
  } catch {
    return null;
  }
  const fields: NrbfField[] = [];
  const byPath = new Map<string, PbNode>();
  collect(root, fields, byPath);
  if (fields.length < 2) return null;
  return { fields, root, byPath };
}

function nodeEdited(nd: PbNode): boolean {
  if (nd.edited) return true;
  return !!nd.children && nd.children.some(nodeEdited);
}

function encodeNode(d: Uint8Array, nd: PbNode): number[] {
  if (!nodeEdited(nd)) return Array.from(d.subarray(nd.start, nd.end));
  const tag = nd.field * 8 + nd.wire;
  const out = encodeVarint(tag);
  if (nd.wire === 0) {
    out.push(...encodeVarint(nd.newScalar ?? nd.scalar ?? 0));
  } else if (nd.wire === 5) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, (nd.newScalar ?? nd.scalar ?? 0) | 0, true);
    out.push(...new Uint8Array(buf));
  } else if (nd.wire === 2 && nd.children) {
    const inner: number[] = [];
    for (const c of nd.children) inner.push(...encodeNode(d, c));
    out.push(...encodeVarint(inner.length), ...inner);
  } else {
    // fixed64 or opaque length-delimited leaf: emit original span verbatim
    return Array.from(d.subarray(nd.start, nd.end));
  }
  return out;
}

/** Apply edits (by field path) and re-encode. Unchanged branches stay byte-identical. */
export function applyProtobufEdits(
  bytes: Uint8Array,
  scan: ProtobufScan,
  edits: { path: string; value: number }[]
): Uint8Array {
  for (const e of edits) {
    const nd = scan.byPath.get(e.path);
    if (nd && (nd.wire === 0 || nd.wire === 5)) { nd.edited = true; nd.newScalar = e.value; }
  }
  const out: number[] = [];
  for (const nd of scan.root) out.push(...encodeNode(bytes, nd));
  return Uint8Array.from(out);
}
