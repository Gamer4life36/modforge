// Turn an arbitrary parsed object/array into a flat list of editable leaf rows,
// and write edited values back into the object by path. This is what powers the
// structured table editor — the user edits leaves, we reserialize the whole tree.

export type Scalar = string | number | boolean | null;
export type LeafType = "string" | "number" | "boolean" | "null";

export interface Row {
  /** Path from the root to this leaf, e.g. ["Physics", "Frigate", 0, "MaxSpeed"] */
  path: (string | number)[];
  /** Dotted label for display, e.g. "Physics.Frigate.0.MaxSpeed" */
  label: string;
  /** The leaf key (last path segment) for a compact column */
  key: string;
  value: Scalar;
  type: LeafType;
}

function typeOf(v: unknown): LeafType {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  return "string";
}

/** Depth-first walk emitting one Row per scalar leaf. Objects/arrays are containers. */
export function flatten(data: unknown): Row[] {
  const rows: Row[] = [];
  const walk = (node: unknown, path: (string | number)[]) => {
    if (node !== null && typeof node === "object") {
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, [...path, i]));
      } else {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          walk(v, [...path, k]);
        }
      }
      return;
    }
    const key = path.length ? String(path[path.length - 1]) : "(root)";
    rows.push({
      path,
      label: path.map(String).join(".") || "(root)",
      key,
      value: node as Scalar,
      type: typeOf(node),
    });
  };
  walk(data, []);
  return rows;
}

/** Coerce a raw string from an input back into the leaf's original type. */
export function coerce(raw: string, type: LeafType): Scalar {
  switch (type) {
    case "number": {
      const n = Number(raw);
      return Number.isNaN(n) ? raw : n; // keep as string if not a valid number
    }
    case "boolean":
      return raw === "true" || raw === "1" || raw.toLowerCase() === "yes";
    case "null":
      return raw === "" ? null : raw;
    default:
      return raw;
  }
}

/** Mutate `data` in place, setting the leaf at `path` to `value`. */
export function setAtPath(data: unknown, path: (string | number)[], value: Scalar): void {
  if (path.length === 0) return;
  let node = data as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    node = node[path[i]] as Record<string | number, unknown>;
    if (node === null || typeof node !== "object") return; // path broke; bail safely
  }
  node[path[path.length - 1]] = value;
}

/** Resolve the parent container of a path. Returns null if the path is broken. */
function parentOf(
  data: unknown,
  path: (string | number)[]
): { parent: unknown; key: string | number } | null {
  if (path.length === 0) return null;
  let node = data as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    node = node[path[i]] as Record<string | number, unknown>;
    if (node === null || typeof node !== "object") return null;
  }
  return { parent: node, key: path[path.length - 1] };
}

/** True if the leaf/element at `path` lives inside an array (so it can be duplicated). */
export function isArrayElement(data: unknown, path: (string | number)[]): boolean {
  const p = parentOf(data, path);
  return !!p && Array.isArray(p.parent);
}

/** Remove the field or array element at `path`. Mutates `data`. */
export function removeAtPath(data: unknown, path: (string | number)[]): void {
  const p = parentOf(data, path);
  if (!p) return;
  if (Array.isArray(p.parent)) {
    p.parent.splice(Number(p.key), 1);
  } else {
    delete (p.parent as Record<string | number, unknown>)[p.key];
  }
}

/** Duplicate an array element in place (inserts a deep copy right after it). Mutates `data`. */
export function duplicateElement(data: unknown, path: (string | number)[]): void {
  const p = parentOf(data, path);
  if (!p || !Array.isArray(p.parent)) return;
  const idx = Number(p.key);
  const copy = structuredClone(p.parent[idx]);
  p.parent.splice(idx + 1, 0, copy);
}

