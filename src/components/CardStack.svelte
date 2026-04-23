<script lang="ts">
  import { onMount, tick, untrack, flushSync } from 'svelte';
  import { get } from 'svelte/store';
  import { stackStore, pushToStack, removeFromStack, activateCard as activateCardFn } from '../stores/card-stack-store';
  import { computeStackLayout } from '../lib/stack-layout';

  interface Props {
    activeUid?: string;
    activeHtml?: string | null;
  }

  let { activeUid, activeHtml }: Props = $props();

  let cardHtmlCache = $state(new Map<string, string>());
  // UIDs to skip body-open in $effect during VT push (body opens after vt.finished)
  let skipBodyOpen = new Set<string>();
  let startVT: ((cb: () => void) => { finished: Promise<void> }) | undefined;

  // Seed store from SSR prop once at mount — untrack to silence reactive-capture warning.
  untrack(() => {
    if (activeUid && activeHtml) {
      cardHtmlCache.set(activeUid, activeHtml);
      stackStore.set({ cards: [{ uid: activeUid }], activeUid });
    }
  });

  const layout = $derived(computeStackLayout($stackStore));
  const hasCards = $derived($stackStore.cards.length > 0);

  $effect(() => {
    for (const card of layout.visible) {
      const el = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(card.uid)}"]`);
      if (!el) continue;
      el.classList.toggle('stack-card--active', card.isActive);
      el.classList.toggle('stack-card--collapsed', card.isCollapsed);
      el.style.setProperty('--stack-index', String(card.stackIndex));
      const bw = el.querySelector<HTMLElement>('.body-wrapper');
      // During VT push, suppress body-open until vt.finished
      if (bw) bw.classList.toggle('open', card.isActive && !skipBodyOpen.has(card.uid));
    }
  });

  // --- Helpers ---

  function uidToFetchUrl(uid: string): string {
    return `/card/${uid}`;
  }

  function urlToUid(url: string): string {
    return url.startsWith('/card/') ? url.slice('/card/'.length) : url;
  }

  async function fetchAndCacheCard(uid: string): Promise<boolean> {
    if (cardHtmlCache.has(uid)) return true;
    const res = await fetch(uidToFetchUrl(uid));
    if (!res.ok) return false;
    const tmp = document.createElement('div');
    tmp.innerHTML = await res.text();
    const card = tmp.querySelector('.stack-card');
    if (!card) return false;
    cardHtmlCache.set(uid, card.outerHTML);
    return true;
  }

  function updateUrl() {
    const state = get(stackStore);
    if (state.cards.length === 0) {
      history.pushState(null, '', '/');
      return;
    }
    const active = state.activeUid ?? state.cards[state.cards.length - 1].uid;
    const activeIndex = state.cards.findIndex(c => c.uid === active);
    const fromUids = state.cards.slice(0, activeIndex).map(c => c.uid);
    const toUids = state.cards.slice(activeIndex + 1).map(c => c.uid);
    const basePath = `/card/${active}`;
    const params = new URLSearchParams();
    if (fromUids.length) params.set('from', fromUids.join(','));
    if (toUids.length) params.set('to', toUids.join(','));
    const query = params.toString();
    history.pushState(null, '', query ? `${basePath}?${query}` : basePath);
  }

  async function pushCard(url: string, clickedLink?: Element | null) {
    const uid = urlToUid(url);
    const state = get(stackStore);

    // Already in stack → just activate
    if (state.cards.some(c => c.uid === uid)) {
      stackStore.update(s => activateCardFn(s, uid));
      updateUrl();
      await tick();
      document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const ok = await fetchAndCacheCard(uid);
    if (!ok) return;

    const doUpdate = () => {
      stackStore.update(s => {
        const activeIdx = s.activeUid
          ? s.cards.findIndex(c => c.uid === s.activeUid)
          : s.cards.length - 1;
        const base = activeIdx >= 0 ? { ...s, cards: s.cards.slice(0, activeIdx + 1) } : s;
        return pushToStack(base, uid);
      });
    };

    const homepage = document.getElementById('homepage');

    if (clickedLink && startVT) {
      // VT path: panel link morphs into stack card
      skipBodyOpen.add(uid);
      (clickedLink as HTMLElement).style.viewTransitionName = 'panel-card-open';

      const vt = startVT(() => {
        flushSync(doUpdate);
        const newCard = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
        if (newCard) newCard.style.viewTransitionName = 'panel-card-open';
        if (homepage) homepage.hidden = true;
      });

      await vt.finished;
      skipBodyOpen.delete(uid);
      (clickedLink as HTMLElement).style.viewTransitionName = '';
      const newCard = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
      if (newCard) {
        newCard.style.viewTransitionName = '';
        newCard.querySelector<HTMLElement>('.body-wrapper')?.classList.add('open');
      }
    } else {
      // Instant fallback
      doUpdate();
      if (homepage) homepage.hidden = true;
      await tick();
    }

    updateUrl();
    document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function closeCard(uid: string) {
    const state = get(stackStore);
    const isLastCard = state.cards.length === 1;
    const homepage = document.getElementById('homepage');

    if (isLastCard) {
      // Collapse body before removing (for smooth animation)
      const el = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
      const bw = el?.querySelector<HTMLElement>('.body-wrapper');
      if (bw) {
        bw.classList.remove('open');
        await new Promise<void>(resolve => {
          const onEnd = (e: Event) => {
            if ((e as TransitionEvent).propertyName === 'grid-template-rows') {
              bw.removeEventListener('transitionend', onEnd);
              resolve();
            }
          };
          bw.addEventListener('transitionend', onEnd);
          setTimeout(resolve, 400); // fallback if transition doesn't fire
        });
      }

      // Fetch homepage content if empty (direct URL navigation)
      if (homepage && homepage.children.length === 0) {
        const res = await fetch('/');
        if (res.ok) {
          const tmp = document.createElement('div');
          tmp.innerHTML = await res.text();
          const fetched = tmp.querySelector('#homepage');
          if (fetched) homepage.innerHTML = fetched.innerHTML;
        }
      }

      const matchingLink = homepage?.querySelector<HTMLElement>(`.card-link[data-push-card="${uid}"]`);

      if (matchingLink && startVT && el) {
        // VT path: stack card morphs back to panel link
        el.style.viewTransitionName = 'panel-card-close';
        matchingLink.style.viewTransitionName = 'panel-card-close';

        const vt = startVT(() => {
          flushSync(() => stackStore.update(s => removeFromStack(s, uid)));
          if (homepage) homepage.hidden = false;
          history.pushState(null, '', '/');
        });

        await vt.finished;
        matchingLink.style.viewTransitionName = '';
      } else {
        // Instant fallback
        stackStore.update(s => removeFromStack(s, uid));
        if (homepage) {
          homepage.hidden = false;
        } else {
          window.location.href = '/';
        }
        history.pushState(null, '', '/');
      }
    } else {
      stackStore.update(s => removeFromStack(s, uid));
      updateUrl();
      await tick();
      const activeUid = get(stackStore).activeUid;
      if (activeUid) {
        document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(activeUid)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  async function initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const fromUids = params.get('from')?.split(',').filter(Boolean) ?? [];
    const toUids = params.get('to')?.split(',').filter(Boolean) ?? [];
    if (!fromUids.length && !toUids.length) return;

    for (const uid of fromUids) {
      const ok = await fetchAndCacheCard(uid);
      if (ok) {
        stackStore.update(s => {
          const activeIdx = s.cards.findIndex(c => c.uid === s.activeUid);
          const newCards = activeIdx >= 0
            ? [...s.cards.slice(0, activeIdx), { uid }, ...s.cards.slice(activeIdx)]
            : [{ uid }, ...s.cards];
          return { ...s, cards: newCards };
        });
      }
    }
    for (const uid of toUids) {
      const ok = await fetchAndCacheCard(uid);
      if (ok) {
        stackStore.update(s => ({ ...s, cards: [...s.cards, { uid }] }));
      }
    }
  }

  onMount(() => {
    startVT = (document as any).startViewTransition?.bind(document);
    const homepage = document.getElementById('homepage');

    // If SSR-seeded card present, hide homepage
    if (get(stackStore).cards.length > 0 && homepage) {
      homepage.hidden = true;
    }

    // Restore from/to context cards in URL
    initFromUrl();

    const cardStackEl = document.getElementById('card-stack')!;

    function onStackClick(e: MouseEvent) {
      const target = e.target as Element;

      const closeBtn = target.closest('.stack-card-close');
      if (closeBtn) {
        const card = closeBtn.closest<HTMLElement>('.stack-card');
        if (card?.dataset.uid) closeCard(card.dataset.uid);
        return;
      }

      const pushItem = target.closest<HTMLElement>('[data-push-card]');
      if (pushItem?.dataset.pushCard) {
        pushCard(uidToFetchUrl(pushItem.dataset.pushCard));
        return;
      }

      const collapsedCard = target.closest<HTMLElement>('.stack-card--collapsed');
      if (collapsedCard?.dataset.uid) {
        stackStore.update(s => activateCardFn(s, collapsedCard.dataset.uid!));
        collapsedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        updateUrl();
      }
    }
    cardStackEl.addEventListener('click', onStackClick);

    function onHomepageClick(e: MouseEvent) {
      const link = (e.target as Element).closest<HTMLElement>('[data-push-card]');
      if (link?.dataset.pushCard) {
        pushCard(uidToFetchUrl(link.dataset.pushCard), link.closest('.card-link'));
      }
    }
    homepage?.addEventListener('click', onHomepageClick);

    function onDocumentClick(e: MouseEvent) {
      const link = (e.target as Element).closest<HTMLAnchorElement>('a[href^="tag:"]');
      if (!link) return;
      e.preventDefault();
      const slug = link.getAttribute('href')!.slice(4);
      pushCard(`/card/tag/${slug}`);
    }
    document.addEventListener('click', onDocumentClick);

    async function onPopstate() {
      stackStore.set({ cards: [], activeUid: null });
      const path = window.location.pathname;
      if (path === '/' || path === '') {
        if (homepage) homepage.hidden = false;
        return;
      }
      if (path.startsWith('/card/')) {
        const uid = path.slice('/card/'.length);
        const ok = await fetchAndCacheCard(uid);
        if (ok) {
          stackStore.update(s => pushToStack(s, uid));
          if (homepage) homepage.hidden = true;
          await initFromUrl();
        }
      }
    }
    window.addEventListener('popstate', onPopstate);

    return () => {
      cardStackEl.removeEventListener('click', onStackClick);
      homepage?.removeEventListener('click', onHomepageClick);
      document.removeEventListener('click', onDocumentClick);
      window.removeEventListener('popstate', onPopstate);
    };
  });
</script>

<div id="card-stack" hidden={!hasCards}>
  {#each layout.visible as card (card.uid)}
    {@html cardHtmlCache.get(card.uid) ?? ''}
  {/each}
</div>
