/** Tiny element builder shared by the form, the tooltip layer and the details modal. */
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class')
            node.className = String(v);
        else
            node[k] = v;
    }
    for (const c of children)
        node.append(c);
    return node;
}
/** Copy to the clipboard; resolves false when the browser refuses (file://, sandboxed frames). */
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=dom.js.map