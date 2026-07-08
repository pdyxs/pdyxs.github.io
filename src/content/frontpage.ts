import type { FrontPageConfig } from "../lib/frontpage";

export const FRONTPAGE_CONFIG: FrontPageConfig = {
    slots: [
        { type: "pinned", uid: "who/about-me" },
        {
            type: "filter",
            label: "A Project",
            filter: { selections: { what: ["what:games", "what:art", "what:software"] } },
        },
        {
            type: "filter",
            label: "A Puzzle",
            filter: { selections: { what: ["what:puzzles"] } },
        },
        {
            type: "filter",
            label: "A Post",
            filter: { selections: { what: ["what:writing"] } },
        },
    ],
};
