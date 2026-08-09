import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { globSync } from "tinyglobby";
import picomatch from "picomatch";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTENT_GLOB_PATTERN } from "./content-glob";

/**
 * The content collection is loaded by Astro's glob loader with
 * CONTENT_GLOB_PATTERN. Anything the pattern matches becomes a card, so the
 * pattern is the only thing keeping non-card files (Templater scaffolds in
 * `_templates/`, the Obsidian vault's `.obsidian/` and `.trash/`) out of the
 * site.
 *
 * The loader matches with *two* engines and both are exercised here: tinyglobby
 * for the initial scan, and bare `picomatch.isMatch` for the dev watcher's
 * add/change/unlink handler. They disagree about arrays containing `!` excludes
 * (see the comment on CONTENT_GLOB_PATTERN), so every exclusion assertion below
 * is run against both.
 */
describe("CONTENT_GLOB_PATTERN", () => {
    let base: string;

    const scanned = () => globSync(CONTENT_GLOB_PATTERN, { cwd: base }).sort();
    // What the dev watcher asks: Astro calls picomatch with no options.
    const watched = (path: string) => picomatch.isMatch(path, CONTENT_GLOB_PATTERN);

    const CARD = "what/posts/hello/index.md";
    const NON_CARDS = [
        "_templates/card.md",
        "_templates/nested/chapter.md",
        // The vault infrastructure that leaked through the watcher: Obsidian
        // rewrites workspace.json on every pane change, and .trash keeps
        // soft-deleted cards as intact markdown.
        ".obsidian/workspace.json",
        ".obsidian/plugins/templater-obsidian/manifest.json",
        ".trash/what/posts/deleted/index.md",
        "what/posts/hello/_draft.md",
    ];

    beforeAll(() => {
        base = mkdtempSync(join(tmpdir(), "content-glob-"));

        const write = (path: string) => {
            const full = join(base, path);
            mkdirSync(join(full, ".."), { recursive: true });
            writeFileSync(full, "---\ntitle: x\n---\n");
        };

        write(CARD);
        for (const path of NON_CARDS) write(path);
    });

    afterAll(() => rmSync(base, { recursive: true, force: true }));

    it("loads a card's index.md", () => {
        expect(scanned()).toContain(CARD);
        expect(watched(CARD)).toBe(true);
    });

    it.each(NON_CARDS)("does not load %s in the initial scan", path => {
        expect(scanned()).not.toContain(path);
    });

    it.each(NON_CARDS)("does not load %s on a watcher event", path => {
        expect(watched(path)).toBe(false);
    });

    it("is a single positive pattern, so both engines agree", () => {
        // An array here silently re-opens the watcher hole: picomatch ORs the
        // elements, and a `!`-prefixed element matches everything it excludes.
        expect(typeof CONTENT_GLOB_PATTERN).toBe("string");
        expect(CONTENT_GLOB_PATTERN.startsWith("!")).toBe(false);
        // picomatch compiles `[!…]` to a literal, so a POSIX-spelled negated
        // class silently stops matching on watcher events. Use `[^…]`.
        expect(CONTENT_GLOB_PATTERN).not.toContain("[!");
    });
});
