import { describe, it, expect } from "vitest";
import { humaniseSegment, displayFor } from "./tag-display";

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
