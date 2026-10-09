/**
 * What changed, for players (DESIGN.md, Homepage: the two pages off it). Newest first.
 * One entry per shipped change a player can notice; engineering stays in git. Dates are the
 * day it reached main.
 */
export interface ChangelogEntry {
  date: string;
  title: string;
  lines: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-09",
    title: "The hardest stations, and this page",
    lines: [
      "A page ranking every station by how many questions it takes to find it, per hub.",
      "This changelog. The daily's number and the timetable's day are in the footer.",
      "The timetable is pinned to Wednesday 2026-10-28.",
    ],
  },
  {
    date: "2026-10-08",
    title: "You hide",
    lines: [
      "A new mode: you ride and hide, a bot seeks. Twenty minutes to hide on the real timetable, then Hide here, answer or veto its questions in the window, play curses, and watch it close in.",
      "Three seeker levels: Easy, Normal and Hard search with 4, 3 or 2 stations left.",
      "The bot seeker acts no faster than a person: at least three real seconds between moves.",
      "A hider in sight can be walked to past the 600 m street limit, and a catch from a neighbouring station's street now records when the hunt ended.",
    ],
  },
  {
    date: "2026-10-07",
    title: "The deck, re-priced from 780 simulated rounds",
    lines: [
      "Time bonuses 6 / 4 / 2 instead of 10 / 6 / 3, so draws matter more.",
      "Wrong way costs one card. Sidewalk shed lasts 20 minutes.",
      "The hider is revealed when any round ends, an unfound daily included.",
      "Rounds survive a server restart, and the link preview shows the game's card.",
    ],
  },
  {
    date: "2026-10-06",
    title: "A bot that plays cards, and difficulty",
    lines: [
      "The bot hider draws on every answer, keeps its best cards, and plays Veto, Randomize, Discard 2 draw 3, Fog, Signal loss, Wrong way, Tourist and Sidewalk shed.",
      "A vetoed question is closed for the rest of the round.",
      "Practice rounds have Easy, Normal and Hard: the bot hides where the questions find it in 3–4, 5–6 or 7–8 questions. The daily plays Normal.",
      "Every station question waits out a one-minute answer window, card or no card.",
      "Sessions survive a dropped connection for three minutes.",
    ],
  },
  {
    date: "2026-10-05",
    title: "The street, and photos",
    lines: [
      "Finding the station starts a Street View endgame: the hider is somewhere within 400 m, you walk the streets, see them within 40 m and catch within 25 m.",
      "Two on-foot questions: street radar and hotter or colder.",
      "Photo questions from the hider's station exit, and from their spot fifteen minutes in.",
      "Daily #1.",
    ],
  },
];
