import { describe, expect, it } from "vitest";
import { moveItem } from "./move-item";

describe("moveItem", () => {
  const list = ["a", "b", "c", "d"];

  it("monte et descend un élément sans muter la liste d'origine", () => {
    expect(moveItem(list, 2, 1)).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("indices hors limites ou identiques : copie inchangée", () => {
    expect(moveItem(list, 0, 0)).toEqual(list);
    expect(moveItem(list, -1, 0)).toEqual(list);
    expect(moveItem(list, 0, 4)).toEqual(list);
    expect(moveItem(list, 3, 4)).toEqual(list);
    expect(moveItem(list, 1.5, 0)).toEqual(list);
    expect(moveItem([], 0, 0)).toEqual([]);
    expect(moveItem(list, 0, 1)).not.toBe(list);
  });
});
