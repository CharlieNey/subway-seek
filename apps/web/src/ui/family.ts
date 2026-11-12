/**
 * Family colors: each question category keeps one, and the color stands for the shape its
 * answer draws (DESIGN.md, Questions). On-foot questions aren't a seventh family: the
 * street radar and the walking hotter-or-colder draw Radar's ring and Thermometer's line,
 * so they take those colors at street scale.
 */
import { categoryOf, type Question, type QuestionCategory } from "@stand-clear/engine";

export type Family = "radar" | "thermo" | "match" | "measure" | "tent" | "photo";

export const FAMILIES: readonly Family[] = ["radar", "thermo", "match", "measure", "tent", "photo"];

/** Fill and trim, for canvases and map layers that can't read CSS variables. */
export const FAMILY_COLORS: Record<Family, { fill: string; trim: string }> = {
  radar: { fill: "#25396B", trim: "#121B36" },
  thermo: { fill: "#A12A3C", trim: "#3A1A1C" },
  match: { fill: "#4C8A40", trim: "#2C5A2A" },
  measure: { fill: "#DDAE36", trim: "#8E6A14" },
  tent: { fill: "#1F6E6B", trim: "#0E3A38" },
  photo: { fill: "#6B4A8C", trim: "#3E2759" },
};

export const FAMILY_NAME: Record<Family, string> = {
  radar: "Radar",
  thermo: "Thermometer",
  match: "Matching",
  measure: "Measuring",
  tent: "Nearest",
  photo: "Photos",
};

const BY_CATEGORY: Record<Exclude<QuestionCategory, "onFoot">, Family> = {
  radar: "radar",
  thermometer: "thermo",
  matching: "match",
  measuring: "measure",
  tentacles: "tent",
  photo: "photo",
};

export function familyOfCategory(category: Exclude<QuestionCategory, "onFoot">): Family {
  return BY_CATEGORY[category];
}

export function familyOf(q: Question): Family {
  if (q.kind === "spotRadar") return "radar";
  if (q.kind === "spotThermometer") return "thermo";
  const category = categoryOf(q);
  return category === "onFoot" ? "radar" : BY_CATEGORY[category];
}
