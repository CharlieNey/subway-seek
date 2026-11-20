*What this is: a prompt given to an AI reviewer to critique `DESIGN.md` before building started.*

# Review prompt

You're reviewing the design doc for a hobby game I'm about to build: an online 1v1 hide and seek played on the real NYC subway timetable and Google Street View, inspired by Jet Lag: The Game's Hide + Seek.

- I'm a solo developer (TypeScript / Next.js).
- v1 runs in the desktop browser.
- Nothing is built yet.
- The full design doc (DESIGN.md) is included below / attached.

Be adversarial and specific. I want the problems, not praise. Review it on these lenses:

1. **Fun:**
   - Is the round loop actually engaging?
   - Where is the dead time? Especially the seeker's Phase 1 wait, long subway rides, and the Street View endgame on foot.
   - Where does the tension come from, and is there enough of it?
2. **Balance:**
   - Who is favored, hider or seeker?
   - With ~470 stations, how many of the MVP map questions does it take to pin down the station? Is "+5 min per question" the right cost?
   - Any exploits in the freeze rule, the zone rule, station vs spot photos, or the 6× clock?
3. **Technical feasibility:**
   - Is the transit model (in-memory MTA GTFS, shared server clock, player state machine) sound?
   - Are the server authority, hidden-information and anti-cheat approaches sound?
   - What's risky about the Street View integration, beyond pricing/terms (already a known open question — don't spend time on it)?
4. **Scope:**
   - Is M0–M3 the right first playable slice?
   - What would you cut, reorder, or fake for the first playtest?
5. **Missing pieces:** things the doc doesn't address but will bite — e.g.
   - disconnects/reconnects or a player leaving mid-round
   - onboarding / teaching the rules
   - NYC timetable quirks (express/local patterns, station complexes, weekend vs weekday service)
   - accessibility

**Output format:**
- **Top issues:** the 5 most important, ranked by severity. For each: the problem, why it matters, and a concrete fix.
- **Quick wins:** small changes with outsized payoff.
- **Questions for the designer:** decisions the doc leaves open that you'd want answered before building.

Keep it under ~900 words. Don't rewrite the doc.
