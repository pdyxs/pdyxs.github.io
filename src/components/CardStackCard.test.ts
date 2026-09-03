import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getContainerRenderer } from "@astrojs/svelte";
import svelteServerRenderer from "@astrojs/svelte/server.js";
import CardStackCard from "./CardStackCard.astro";
import type { ResolvedCard } from "../lib/cards";

async function makeContainer() {
    const renderers = [
        { ...getContainerRenderer(), ssr: svelteServerRenderer },
    ];
    return AstroContainer.create({ renderers });
}

function dom(html: string) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div;
}

/**
 * A ResolvedCard as resolveCard() would have produced it. The point of these
 * tests is that CardStackCard renders *this*, verbatim — so the fixture values
 * are deliberately ones no re-derivation from content could coincidentally
 * reproduce.
 */
function card(overrides?: Partial<ResolvedCard>): ResolvedCard {
    return {
        uid: "what/posts/about-me",
        title: "About Me",
        description: "A bio",
        tags: ["what:posts"],
        renderer: "card",
        contentHash: "sentinel-hash-12345",
        status: "published",
        visibility: { listed: true, reachable: true },
        priority: 0,
        sort: { key: "date", direction: "desc" },
        ...overrides,
    };
}

describe("CardStackCard", () => {
    // ── It is a consumer, not a resolver (issue #77) ────────────────────────
    //
    // This component used to re-derive title, status, renderer, nav renderer
    // and content hash independently of getAllCards(), guarded only by comments
    // asserting the two agreed. A content-hash mismatch would silently break
    // client-side read tracking (getViewState keys state on the hash), and
    // nothing tested the equivalence. It now renders the ResolvedCard it is
    // handed, so these assertions replace that missing equivalence test.

    it("emits the content hash it was given, verbatim", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ contentHash: "sentinel-hash-12345" }) },
        });

        expect(
            dom(html)
                .querySelector("[data-content-hash]")
                ?.getAttribute("data-content-hash"),
        ).toBe("sentinel-hash-12345");
    });

    it("emits the uid it was given as data-uid", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ uid: "what/posts/about-me" }) },
        });

        expect(
            dom(html).querySelector(".stack-card")?.getAttribute("data-uid"),
        ).toBe("what/posts/about-me");
    });

    it("renders the title it was given, not one re-derived from the entry", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ title: "Sentinel Title" }) },
        });

        expect(dom(html).querySelector(".card-header")?.textContent).toContain(
            "Sentinel Title",
        );
    });

    it("carries the resolved width as a data-width attribute", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ width: "900px" }) },
        });

        expect(
            dom(html).querySelector(".stack-card")?.getAttribute("data-width"),
        ).toBe("900px");
    });

    it("omits data-width when the card resolved none (falls back to the global default)", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ width: undefined }) },
        });

        expect(
            dom(html).querySelector(".stack-card")?.hasAttribute("data-width"),
        ).toBe(false);
    });

    it("renders the plain card shell when the card resolved no nav renderer", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ navRenderer: undefined }) },
        });
        const div = dom(html);

        expect(div.querySelector(".card-header")).not.toBeNull();
        expect(div.querySelector(".body-wrapper.open")).not.toBeNull();
    });

    // COLLECTION_RENDERERS is empty (issue #89), so every renderer name now
    // falls back to GenericRenderer — including the work cards' `work`, whose
    // own component had no tag chips, no card strips and no gallery. The
    // dispatch is still on the name the *card* carries; that it is never
    // re-cascaded from _config.yaml is guarded by the resolveFolderCascade
    // entry in FORBIDDEN, below.
    it("dispatches an unregistered renderer name to GenericRenderer, which renders when/roles as meta rows", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: {
                card: card({ uid: "where/work/equalreality", renderer: "work" }),
            },
        });
        const div = dom(html);

        expect(div.querySelector(".work-meta")).toBeNull();
        expect(div.querySelector(".generic-meta")?.textContent).toContain(
            "Head of Technology",
        );
    });

    // ── Spine + sentinel (issue #108) ──────────────────────────────────────
    //
    // The spine is server-rendered markup, not something the island creates:
    // "Fragments are HTML; the stack is state" (CLAUDE.md), and
    // CardStack.fragments.test.ts guards CardStack.svelte against building
    // nodes. Both branches of this shell must carry it — the nav-renderer one
    // owns only the header/body pair, so the spine lives outside the branch
    // while the sentinel is rendered by whoever renders the header.

    it("renders the spine as the first child of the plain card shell", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ title: "Sentinel Title", navRenderer: undefined }) },
        });
        const stack = dom(html).querySelector(".stack-card")!;

        expect(stack.firstElementChild?.classList.contains("stack-card-spine")).toBe(true);
        expect(stack.querySelector(".stack-card-spine > .stack-card-spine-inner")).not.toBeNull();
        expect(
            stack.querySelector(".stack-card-spine-inner > .stack-card-spine-title")?.textContent,
        ).toBe("Sentinel Title");
    });

    it("renders the header sentinel immediately before the card header", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ navRenderer: undefined }) },
        });
        const stack = dom(html).querySelector(".stack-card")!;
        const sentinel = stack.querySelector(".card-header-sentinel");

        expect(sentinel).not.toBeNull();
        expect(sentinel!.nextElementSibling?.classList.contains("card-header")).toBe(true);
    });

    it("renders the spine and sentinel in the nav-renderer branch too", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: {
                card: card({
                    uid: "what/stories/arctic/09-polar-bear-tracks",
                    title: "Sentinel Title",
                    navRenderer: "series",
                }),
            },
        });
        const stack = dom(html).querySelector(".stack-card")!;

        // The nav renderer really did take over the shell.
        expect(stack.querySelector(".series-position")).not.toBeNull();

        expect(stack.firstElementChild?.classList.contains("stack-card-spine")).toBe(true);
        expect(stack.querySelector(".stack-card-spine-title")?.textContent).toBe("Sentinel Title");

        const sentinel = stack.querySelector(".card-header-sentinel");
        expect(sentinel).not.toBeNull();
        expect(sentinel!.nextElementSibling?.classList.contains("card-header")).toBe(true);
    });

    it("renders no status badge for a published card", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { card: card({ status: "published" }) },
        });

        expect(dom(html).querySelector(".status-badge")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Architecture guard.
//
// The four comments this refactor deleted were an attempt to enforce, in
// English, that CardStackCard's resolution matched getAllCards(). English did
// not enforce it. This does: the component must not import any resolution
// primitive, because the only correct source for resolved card data is the
// `card` prop.
//
// If a future field needs to reach the single-card view, extend ResolvedCard
// and thread it — do not re-resolve locally and do not relax this test.
// ---------------------------------------------------------------------------
describe("CardStackCard resolves nothing itself", () => {
    const SOURCE = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "CardStackCard.astro"),
        "utf-8",
    );

    const FORBIDDEN = [
        "computeContentHash",
        "resolveFolderCascade",
        "resolveCardTitle",
        "resolveCardDescription",
        "resolveStatus",
        "computeStatusVisibility",
        "makeFileReader",
    ];

    for (const name of FORBIDDEN) {
        it(`does not reference ${name}`, () => {
            // Comments legitimately name these; only real references count.
            const withoutComments = SOURCE.replace(/\/\/.*$/gm, "").replace(
                /\/\*[\s\S]*?\*\//g,
                "",
            );
            expect(withoutComments).not.toContain(name);
        });
    }
});
