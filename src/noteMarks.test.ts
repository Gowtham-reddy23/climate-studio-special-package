import { describe, expect, it } from "vitest";
import { joinNote, splitNote } from "./noteFiles";
import { applyNoteMark } from "./noteMarks";
import { slashAt } from "./slash";

describe("writing tools", () => {
  it("wraps the selection in bold", () => {
    const next = applyNoteMark("say hello there", 4, 9, "bold");
    expect(next.text).toBe("say **hello** there");
  });

  it("turns the current line into a heading and a checklist", () => {
    expect(applyNoteMark("Ship the notch", 0, 0, "heading").text).toBe("# Ship the notch");
    expect(applyNoteMark("Buy paper", 0, 0, "check").text).toBe("- [ ] Buy paper");
  });

  it("finds a slash command and keeps files out of the writing", () => {
    expect(slashAt("hello\n/li", 9)?.query).toBe("li");
    const body = joinNote("A page", [{ kind: "pdf", id: "file_1", name: "brief.pdf" }]);
    expect(splitNote(body).prose).toBe("A page");
    expect(splitNote(body).files[0]?.name).toBe("brief.pdf");
  });
});
