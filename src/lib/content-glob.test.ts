import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { globSync } from "tinyglobby";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTENT_GLOB_PATTERN } from "./content-glob";

/**
 * The content collection is loaded by Astro's glob loader with
 * CONTENT_GLOB_PATTERN. Anything the pattern matches becomes a card, so the
 * pattern is the only thing keeping non-card markdown (Templater scaffolds in
 * the content vault's `_templates/`) out of the site.
 *
 * tinyglobby is the engine Astro's glob loader uses, so matching it here
 * exercises the real behaviour rather than a reimplementation.
 */
describe("CONTENT_GLOB_PATTERN", () => {
    let base: string;

    const matched = () =>
        globSync(CONTENT_GLOB_PATTERN, { cwd: base }).sort();

    beforeAll(() => {
        base = mkdtempSync(join(tmpdir(), "content-glob-"));

        const write = (path: string) => {
            const full = join(base, path);
            mkdirSync(join(full, ".."), { recursive: true });
            writeFileSync(full, "---\ntitle: x\n---\n");
        };

        write("what/posts/hello/index.md");
        write("_templates/card.md");
        write("_templates/nested/chapter.md");
    });

    afterAll(() => rmSync(base, { recursive: true, force: true }));

    it("loads a card's index.md", () => {
        expect(matched()).toContain("what/posts/hello/index.md");
    });

    it("does not load markdown inside an underscore-prefixed directory", () => {
        expect(matched()).not.toContain("_templates/card.md");
        expect(matched()).not.toContain("_templates/nested/chapter.md");
    });
});
