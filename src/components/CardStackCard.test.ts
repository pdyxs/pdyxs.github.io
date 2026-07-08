import { describe, it, expect } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getContainerRenderer } from "@astrojs/svelte";
import svelteServerRenderer from "@astrojs/svelte/server.js";
import CardStackCard from "./CardStackCard.astro";

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

describe("CardStackCard", () => {
    // Collection-view pages (bare uids like "posts") are retired (issue #26) —
    // COLLECTION_VIEW_RENDERERS is empty, so a bare collection name resolves to
    // `unknown` and falls back to a plain (empty) card shell rather than
    // crashing.
    it("renders a bare collection name with no registered view renderer as an empty card shell", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { path: "posts" },
        });
        const div = dom(html);

        expect(div.querySelector(".stack-card")?.getAttribute("data-uid")).toBe(
            "posts",
        );
        expect(div.querySelector(".card-header")).not.toBeNull();
    });

    it("renders a plain card location with a CardHeader + the resolved renderer", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { path: "who/about-me" },
        });
        const div = dom(html);

        expect(div.querySelector(".stack-card")?.getAttribute("data-uid")).toBe(
            "who/about-me",
        );
        expect(div.querySelector(".card-header")).not.toBeNull();
        expect(div.querySelector(".body-wrapper.open")).not.toBeNull();
        expect(
            div
                .querySelector("[data-content-hash]")
                ?.getAttribute("data-content-hash"),
        ).toBeTruthy();
    });

    it("renders a puzzle card via PuzzleRenderer, resolved from the cascaded _config.yaml renderer (not a frontmatter override)", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { path: "what/puzzles/cartography" },
        });
        const div = dom(html);

        expect(div.querySelector(".stack-card")?.getAttribute("data-uid")).toBe(
            "what/puzzles/cartography",
        );
        expect(div.querySelector(".puzzle-meta")).not.toBeNull();
    });

    it("carries a frontmatter-declared width as a data-width attribute", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { path: "what/projects/art/the-path" },
        });
        const div = dom(html);

        expect(
            div.querySelector(".stack-card")?.getAttribute("data-width"),
        ).toBe("900px");
    });

    it("omits data-width when frontmatter declares no width (falls back to the global default)", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { path: "who/about-me" },
        });
        const div = dom(html);

        expect(
            div.querySelector(".stack-card")?.hasAttribute("data-width"),
        ).toBe(false);
    });

    it("renders a tag location via the tag renderer, hashing name+description", async () => {
        const container = await makeContainer();
        const html = await container.renderToString(CardStackCard, {
            props: { path: "tag/who" },
        });
        const div = dom(html);

        expect(div.querySelector(".stack-card")?.getAttribute("data-uid")).toBe(
            "tag/who",
        );
    });
});
