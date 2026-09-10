import { describe, it, expect } from "vitest";
import { humaniseSegment, displayFor, narrowTagDisplay } from "@content/tags/tag-display";

describe("humaniseSegment", () => {
    it("title-cases a single-word last segment", () => {
        expect(humaniseSegment("what:puzzles")).toBe("Puzzles");
    });

    it("splits and title-cases a hyphenated last segment", () => {
        expect(humaniseSegment("what:projects/data-art")).toBe("Data Art");
    });
});

describe("displayFor", () => {
    it("returns the declared display info when the value is in the map", () => {
        const display = {
            "what:puzzles": { name: "Puzzles", description: "Logic puzzles" },
        };
        expect(displayFor("what:puzzles", display)).toEqual({
            name: "Puzzles",
            description: "Logic puzzles",
        });
    });

    it("falls back to a humanised segment when the value is absent from the map", () => {
        expect(displayFor("what:projects/data-art", {})).toEqual({
            name: "Data Art",
            declared: false,
        });
    });

    it("falls back to a humanised segment when no display map is provided", () => {
        expect(displayFor("what:puzzles")).toEqual({
            name: "Puzzles",
            declared: false,
        });
    });
});

describe("narrowTagDisplay", () => {
    const display = {
        "what:puzzles": { name: "Puzzles" },
        "who:seethrough": { name: "SeeThrough Studios" },
        "what:posts/stories/arctic": { name: "Arctic" },
        "where:europe": { name: "Europe" },
    };

    it("keeps only the values the given previews carry", () => {
        expect(
            narrowTagDisplay(display, [{ tags: ["what:puzzles"] }]),
        ).toEqual({ "what:puzzles": { name: "Puzzles" } });
    });

    it("unions the tags of every preview", () => {
        expect(
            Object.keys(
                narrowTagDisplay(display, [
                    { tags: ["what:puzzles", "who:seethrough"] },
                    { tags: ["who:seethrough", "where:europe"] },
                ]),
            ).sort(),
        ).toEqual(["what:puzzles", "where:europe", "who:seethrough"]);
    });

    it("keeps a preview's collapsedContainer", () => {
        expect(
            Object.keys(
                narrowTagDisplay(display, [
                    { tags: [], collapsedContainer: "what:posts/stories/arctic" },
                ]),
            ),
        ).toEqual(["what:posts/stories/arctic"]);
    });

    it("drops values with no entry in the map rather than inventing one", () => {
        // displayFor's humaniseSegment fallback covers the absence — which is
        // exactly why narrowing too far is silent.
        expect(narrowTagDisplay(display, [{ tags: ["what:unknown"] }])).toEqual({});
    });

    it("returns the entries by reference, not copies", () => {
        const out = narrowTagDisplay(display, [{ tags: ["what:puzzles"] }]);
        expect(out["what:puzzles"]).toBe(display["what:puzzles"]);
    });

    it("tolerates a missing map and a preview with no tags", () => {
        expect(narrowTagDisplay(undefined, [{ tags: ["what:puzzles"] }])).toEqual({});
        expect(narrowTagDisplay(display, [{}])).toEqual({});
    });

    it("is empty for no previews", () => {
        expect(narrowTagDisplay(display, [])).toEqual({});
    });
});
