/** Tiny element builder shared by the form, the tooltip layer and the details modal. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else (node as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
}

/** Copy to the clipboard; resolves false when the browser refuses (file://, sandboxed frames). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
