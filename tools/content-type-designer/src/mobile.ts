/**
 * The app's mobile Library page (below the 860px card-mode breakpoint) at a
 * 390×844 phone size, with one type filtered in. It is drawn to match the real
 * page, not to summarise it: the header, title, search row, "Other types"
 * pills, the Type filter chip, ActivityCardList's cards, the footer bar and the
 * messages button are all mirrored from their Svelte source, utility class by
 * utility class, in the default Reading Room theme.
 *
 * Sources: routes/content-library/+page.svelte, components/Header.svelte,
 * TypePills.svelte, FilterChips.svelte, ActivityCardList.svelte,
 * ActivityTable.svelte (footer), DataModeToggle.svelte,
 * plan/AddToPlanButton.svelte, messaging/MessagingWidget.svelte.
 *
 * The screen lives in a shadow root so the tool's own form styles (button,
 * input, header…) cannot leak into it. The fonts are declared by index.html,
 * because @font-face inside a shadow root is ignored.
 */
import { el } from './dom.js';
import { lucideSvg } from './icons.js';
import { APP_TYPE_LABELS, type MobileCard, type MobileCardSpec } from './mobile-data.js';

export const PHONE_WIDTH = 390;
export const PHONE_HEIGHT = 844;

/** Tailwind v4 preflight (the parts this page uses) plus each utility the page's markup applies. */
const CSS = `
:host {
  --color-background: #ffffff; --color-foreground: #171717; --color-card: #ffffff;
  --color-primary: #1a365d; --color-primary-foreground: #ffffff;
  --color-muted: #f5f5f5; --color-muted-foreground: #525252;
  --color-border: #d4d4d4; --color-input: #d4d4d4;
  --font-sans: 'Geist', system-ui, -apple-system, sans-serif;
  --font-serif: 'Charter', 'Georgia', 'Times New Roman', serif;
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  display: block; width: ${PHONE_WIDTH}px; height: ${PHONE_HEIGHT}px; position: relative; overflow: hidden;
  font-family: var(--font-sans); font-size: 16px; line-height: 1.5; font-weight: 400;
  color: var(--color-foreground); background: var(--color-background);
  -webkit-text-size-adjust: 100%; tab-size: 4; text-align: left; letter-spacing: normal;
  font-feature-settings: normal; font-variation-settings: normal;
}
*, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; border: 0 solid; }
img, svg { display: block; vertical-align: middle; }
img { max-width: 100%; height: auto; }
button, input { font: inherit; font-feature-settings: inherit; font-variation-settings: inherit; letter-spacing: inherit; color: inherit; border-radius: 0; background-color: transparent; opacity: 1; }
button { cursor: pointer; text-align: center; }
button:disabled { cursor: default; }
input::placeholder { color: var(--color-muted-foreground); opacity: 1; }
.scroll-x, .scroll-y { scrollbar-width: none; }
.scroll-x::-webkit-scrollbar, .scroll-y::-webkit-scrollbar { display: none; }

/* root layout: min-h-screen bg-background; page: flex flex-col h-[calc(100vh-4rem)] */
.root { min-height: 100%; background: var(--color-background); color: var(--color-foreground); }

/* Header.svelte */
.hdr { height: 64px; border-bottom: 1px solid var(--color-border); background: var(--color-primary); color: var(--color-primary-foreground); position: sticky; top: 0; z-index: 50; }
.hdr-in { height: 100%; padding: 0 16px; max-width: 1280px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.hdr-left { display: flex; align-items: center; gap: 16px; min-width: 0; }
.brand { font-weight: 700; font-size: 16px; line-height: 24px; color: var(--color-primary-foreground); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 4px; text-decoration: none; }
.nav { display: flex; align-items: center; gap: 2px; min-width: 0; overflow-x: auto; padding: 4px; margin: -4px; }
.nav a { padding: 4px 6px; border-radius: 6px; font-size: 12px; line-height: 16px; font-weight: 500; white-space: nowrap; text-decoration: none; color: color-mix(in oklab, var(--color-primary-foreground) 80%, transparent); }
.nav a.on { color: var(--color-primary-foreground); background: color-mix(in oklab, var(--color-primary-foreground) 15%, transparent); }
.hdr-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.btn-outline { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; border-radius: 6px; font-size: 14px; line-height: 20px; font-weight: 500; background: var(--color-background); color: var(--color-foreground); border: 1px solid var(--color-border); box-shadow: var(--shadow-xs); }
.btn-add { height: 36px; padding: 8px 12px; }
.btn-icon { width: 36px; height: 36px; flex-shrink: 0; }
.btn-settings { display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; width: 36px; height: 36px; color: color-mix(in oklab, var(--color-primary-foreground) 80%, transparent); }
.avatar { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9999px; background: var(--color-primary-foreground); color: var(--color-primary); font-size: 14px; line-height: 20px; font-weight: 600; }

/* routes/content-library/+page.svelte */
.page { display: flex; flex-direction: column; height: calc(${PHONE_HEIGHT}px - 4rem); }
.page-head { width: 100%; max-width: 1280px; margin: 0 auto; padding: 16px; }
.page-head-in { display: flex; flex-direction: column; gap: 12px; }
.h1 { font-size: 24px; line-height: 32px; font-weight: 600; color: var(--color-foreground); }
.lede { font-size: 14px; line-height: 20px; color: var(--color-muted-foreground); margin-top: 4px; }
.pills-wrap { order: 9999; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.controls { display: flex; align-items: center; gap: 8px; }
.mine { padding: 6px 10px; font-size: 12px; line-height: 16px; font-weight: 500; border-radius: 6px; border: 1px solid var(--color-input); background: var(--color-background); color: var(--color-muted-foreground); }
.search { position: relative; width: 100%; }
.search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--color-muted-foreground); pointer-events: none; }
.search input { display: flex; height: 36px; width: 100%; min-width: 0; border-radius: 6px; border: 1px solid var(--color-input); background: var(--color-background); padding: 4px 12px 4px 36px; font-size: 16px; line-height: 24px; box-shadow: var(--shadow-xs); outline: none; }
.content { flex: 1 1 0%; min-height: 0; width: 100%; max-width: 1280px; margin: 0 auto; padding: 0 16px 16px; }
.frame { border: 1px solid var(--color-border); border-radius: 8px; box-shadow: var(--shadow-sm); overflow: hidden; height: 100%; display: flex; flex-direction: column; }
.table { display: flex; flex-direction: column; height: 100%; gap: 0; }

/* TypePills.svelte */
.tp { display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
.tp-label { flex-shrink: 0; font-size: 12px; line-height: 16px; color: var(--color-muted-foreground); }
.tp-row { display: flex; min-width: 0; flex: 1 1 0%; align-items: center; gap: 4px; }
.tp-arrow { display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0; border-radius: 9999px; border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-muted-foreground); }
.tp-arrow:disabled { opacity: 0.4; pointer-events: none; }
.tp-scroll { display: flex; min-width: 0; flex: 1 1 0%; align-items: center; gap: 8px; overflow-x: auto; padding: 2px 0; }
.tp-pill { flex-shrink: 0; white-space: nowrap; display: inline-flex; align-items: center; padding: 4px 10px; font-size: 12px; line-height: 16px; border-radius: 9999px; border: 1px solid var(--color-border); color: var(--color-muted-foreground); }

/* FilterChips.svelte */
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 4px 12px; border-bottom: 1px solid var(--color-border); background: color-mix(in oklab, var(--color-muted) 30%, transparent); }
.fchip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 4px 4px 10px; font-size: 12px; line-height: 16px; border-radius: 9999px; background: color-mix(in oklab, var(--color-primary) 10%, transparent); color: var(--color-primary); border: 1px solid color-mix(in oklab, var(--color-primary) 20%, transparent); }
.fchip b { font-weight: 600; }
.fchip i { font-style: normal; opacity: 0.8; }
.fchip button { margin-left: 2px; padding: 2px; border-radius: 9999px; }
.clear { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 12px; line-height: 16px; color: var(--color-muted-foreground); }

/* ActivityTable.svelte card-mode wrapper + ActivityCardList.svelte */
.list-scroll { flex: 1 1 0%; min-height: 0; overflow-y: auto; }
.list { display: flex; flex-direction: column; gap: 10px; padding: 8px; }
.card { display: flex; align-items: center; gap: 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-card); padding: 10px; }
.card:hover { background: color-mix(in oklab, var(--color-primary) 6%, transparent); }
.thumb { position: relative; height: 64px; width: 96px; flex: none; overflow: hidden; border-radius: 6px; }
.thumb.grey { background: var(--color-muted); }
.thumb img { height: 100%; width: 100%; object-fit: cover; }
.thumb img.fitted { object-fit: contain; }
.play { position: absolute; right: 4px; bottom: 4px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: color-mix(in oklab, #000 65%, transparent); padding: 4px; }
.play svg { fill: #fff; color: #fff; }
.text { min-width: 0; flex: 1 1 0%; text-align: left; }
.title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-family: var(--font-serif); font-size: 14px; line-height: 1.25; font-weight: 600; color: var(--color-foreground); }
.facts { margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; column-gap: 8px; row-gap: 4px; font-size: 12px; line-height: 16px; color: var(--color-muted-foreground); }
.facts.more { margin-top: 4px; flex-wrap: nowrap; gap: 8px; }
.cat { border-radius: 4px; background: var(--color-muted); padding: 2px 6px; color: var(--color-foreground); }
.act { display: flex; width: 36px; height: 36px; flex: none; align-items: center; justify-content: center; border-radius: 6px; color: var(--color-muted-foreground); }
.act.mine-p { color: var(--color-primary); }
.act:hover { background: color-mix(in oklab, var(--color-primary) 10%, transparent); color: var(--color-primary); }

/* ActivityTable.svelte footer + DataModeToggle.svelte */
.foot { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 4px 8px; border-top: 1px solid var(--color-border); font-size: 12px; line-height: 16px; }
.foot-in { display: flex; align-items: center; gap: 8px; }
.total { color: var(--color-muted-foreground); }
.mode { display: flex; align-items: center; gap: 4px; border-radius: 6px; border: 1px solid var(--color-input); background: var(--color-background); padding: 2px; }
.mode button { padding: 4px 10px; font-size: 12px; line-height: 16px; font-weight: 500; border-radius: 4px; color: var(--color-muted-foreground); }
.mode button.on { background: var(--color-primary); color: var(--color-primary-foreground); }
.sortbtn { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; font-size: 14px; line-height: 20px; border: 1px solid var(--color-input); border-radius: 6px; background: var(--color-background); }
.sortbtn:disabled { opacity: 0.5; }

/* messaging/MessagingWidget.svelte: fixed bottom-right, drawn inside the phone */
.fab { position: absolute; right: 20px; bottom: 20px; z-index: 40; display: flex; width: 56px; height: 56px; align-items: center; justify-content: center; border-radius: 9999px; background: var(--color-primary); color: var(--color-primary-foreground); box-shadow: var(--shadow-lg); transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1); will-change: transform; }
`;

const NAV = ['Library', 'Discover', 'Compare', 'Plan', 'Declare', 'Import'];

function icon(name: string, size: number): HTMLElement {
  const span = document.createElement('span');
  span.innerHTML = lucideSvg(name, size);
  return span.firstElementChild as HTMLElement;
}

export interface MobileScreenInput {
  spec: MobileCardSpec;
  cards: MobileCard[];
  /** Tapping a card's text opens the details view; the caller draws it over the phone. */
  onOpen: (index: number) => void;
}

/** One card, mirroring ActivityCardList.svelte. */
function cardView(card: MobileCard, index: number, input: MobileScreenInput): HTMLElement {
  const thumb = el('button', { type: 'button', title: 'Open original content in new tab', class: `thumb${card.thumb && card.thumb.fitted ? '' : ' grey'}` });
  if (card.thumb) {
    const img = el('img', { src: card.thumb.src, alt: '' });
    if (card.thumb.fitted) img.classList.add('fitted');
    img.addEventListener('error', () => img.remove());
    thumb.append(img);
    if (card.thumb.play) thumb.append(el('span', { class: 'play' }, [icon('play', 10)]));
  }
  if (card.href) thumb.addEventListener('click', () => window.open(card.href, '_blank', 'noopener,noreferrer'));

  const text = el('button', { type: 'button', title: 'View content data + details', class: 'text' }, [el('div', { class: 'title' }, [card.title])]);
  for (const line of card.lines) {
    const parts: HTMLElement[] = [];
    line.facts.forEach((fact, i) => {
      if (i > 0) parts.push(el('span', {}, ['·']));
      parts.push(el('span', {}, [fact]));
    });
    if (line.chip) {
      if (line.facts.length) parts.push(el('span', {}, ['·']));
      parts.push(el('span', { class: 'cat' }, [line.chip]));
    }
    if (parts.length) text.append(el('div', { class: `facts${line.first ? '' : ' more'}` }, parts));
  }
  text.addEventListener('click', () => input.onOpen(index));

  let mine = card.hasPerspective;
  const persp = el('button', { type: 'button', class: 'act' });
  const paint = () => {
    persp.className = `act${mine ? ' mine-p' : ''}`;
    persp.title = mine ? 'Edit your perspective' : 'Add a perspective';
    persp.ariaLabel = persp.title;
    persp.replaceChildren(icon(mine ? 'glasses' : 'plus', 16));
  };
  paint();
  // The mock has no perspective form: tapping "+" just flips the card to the glasses state, and back.
  persp.addEventListener('click', () => {
    mine = !mine;
    paint();
  });
  const plan = el('button', { type: 'button', class: 'act', title: 'Add to plan', ariaLabel: 'Add to plan' }, [icon('list-plus', 16)]);
  return el('div', { class: 'card' }, [thumb, text, persp, plan]);
}

/** Draws the page into a new shadow-rooted element sized like the phone's screen. */
export function renderMobileScreen(input: MobileScreenInput): HTMLElement {
  const host = el('div', { class: 'phone-screen' });
  const root = host.attachShadow({ mode: 'open' });

  const header = el('div', { class: 'hdr' }, [
    el('div', { class: 'hdr-in' }, [
      el('div', { class: 'hdr-left' }, [
        el('a', { class: 'brand', href: '#' }, ['Perspectize']),
        el('nav', { class: 'nav scroll-x' }, NAV.map((n) => el('a', { href: '#', class: n === 'Library' ? 'on' : '' }, [n])))
      ]),
      el('div', { class: 'hdr-right' }, [
        el('button', { type: 'button', class: 'btn-outline btn-add', ariaLabel: 'Add content' }, [icon('plus', 16)]),
        el('button', { type: 'button', class: 'btn-settings', ariaLabel: 'Settings' }, [icon('settings', 16)]),
        el('button', { type: 'button', class: 'avatar' }, ['A'])
      ])
    ])
  ]);

  const others = APP_TYPE_LABELS.filter((l) => l !== input.spec.appLabel);
  const left = el('button', { type: 'button', class: 'tp-arrow', ariaLabel: 'Scroll types left', disabled: true }, [icon('chevron-left', 14)]);
  const right = el('button', { type: 'button', class: 'tp-arrow', ariaLabel: 'Scroll types right' }, [icon('chevron-right', 14)]);
  const scroller = el('div', { class: 'tp-scroll scroll-x' }, others.map((l) => el('button', { type: 'button', class: 'tp-pill', ariaLabel: `Show only ${l}` }, [l])));
  const fade = () => {
    const atStart = scroller.scrollLeft <= 2;
    const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
    left.disabled = atStart;
    right.disabled = atEnd;
    const mask = `linear-gradient(to right, ${atStart ? 'black 0, black 0' : 'transparent 0, black 2.5rem'}, ${atEnd ? 'black 100%, black 100%' : 'black calc(100% - 2.5rem), transparent 100%'})`;
    scroller.style.setProperty('mask-image', mask);
    scroller.style.setProperty('-webkit-mask-image', mask);
  };
  scroller.addEventListener('scroll', fade);
  left.addEventListener('click', () => scroller.scrollBy({ left: -scroller.clientWidth * 0.8, behavior: 'smooth' }));
  right.addEventListener('click', () => scroller.scrollBy({ left: scroller.clientWidth * 0.8, behavior: 'smooth' }));
  // The mask needs layout; until then assume the row overflows to the right, which it does at 390px.
  fade();
  requestAnimationFrame(fade);

  const pageHead = el('div', { class: 'page-head' }, [
    el('div', { class: 'page-head-in' }, [
      el('div', {}, [el('div', { class: 'h1' }, ['Library']), el('p', { class: 'lede' }, ['Everything Perspectize members have added.'])]),
      el('div', { class: 'pills-wrap' }, [el('div', { class: 'tp' }, [el('span', { class: 'tp-label' }, ['Other types:']), el('div', { class: 'tp-row' }, [left, scroller, right])])]),
      el('div', { class: 'controls' }, [
        el('button', { type: 'button', class: 'mine' }, ['Mine']),
        el('div', { class: 'search' }, [icon('search', 16), el('input', { type: 'text', placeholder: 'Search content...' })]),
        el('button', { type: 'button', class: 'btn-outline btn-icon', ariaLabel: 'Choose which fields to search' }, [icon('sliders-horizontal', 16)])
      ])
    ])
  ]);

  const n = input.cards.length;
  const table = el('div', { class: 'table' }, [
    el('div', { class: 'chips' }, [
      el('span', { class: 'fchip' }, [el('b', {}, ['Type:']), el('i', {}, [input.spec.appLabel]), el('button', { type: 'button', ariaLabel: 'Remove Type filter' }, [icon('x', 12)])]),
      el('button', { type: 'button', class: 'clear' }, [icon('list-x', 14), 'Clear all'])
    ]),
    el('div', { class: 'list-scroll scroll-y' }, [el('div', { class: 'list' }, input.cards.map((c, i) => cardView(c, i, input)))]),
    el('div', { class: 'foot' }, [
      el('div', { class: 'foot-in' }, [
        el('div', { class: 'total' }, [`${n} total`]),
        el('div', { class: 'mode' }, [el('button', { type: 'button' }, ['All Items']), el('button', { type: 'button', class: 'on' }, [`Loaded ${n} Items`])]),
        el('button', { type: 'button', class: 'sortbtn', ariaLabel: 'Edit sorts' }, [icon('list-ordered', 16)]),
        el('button', { type: 'button', class: 'sortbtn', ariaLabel: 'Clear sorts', disabled: true }, [icon('arrow-up-down', 16)])
      ])
    ])
  ]);

  const page = el('div', { class: 'page' }, [pageHead, el('div', { class: 'content' }, [el('div', { class: 'frame' }, [table])])]);
  const fab = el('button', { type: 'button', class: 'fab', ariaLabel: 'Open messages' }, [icon('message-circle', 24)]);

  root.append(el('style', {}, [CSS]), el('div', { class: 'root' }, [header, page]), fab);
  return host;
}
