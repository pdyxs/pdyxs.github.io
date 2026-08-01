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

    it("dispatches to the renderer named on the card, not one re-cascaded from _config.yaml", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: {
                card: card({ uid: "what/puzzles/cartography", renderer: "puzzle" }),
            },
        });

        expect(dom(html).querySelector(".puzzle-meta")).not.toBeNull();
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
