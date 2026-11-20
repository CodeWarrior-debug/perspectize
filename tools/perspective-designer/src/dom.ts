/** Tiny element builder shared by every renderer in the designer. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & {
    class?: string;
    style?: string;
    [data: `data-${string}`]: string;
    [aria: `aria-${string}`]: string;
  } = {},
  children: (Node | string | null | undefined | false)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'style') node.setAttribute('style', String(v));
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') node.setAttribute(k, String(v));
    else (node as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
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
