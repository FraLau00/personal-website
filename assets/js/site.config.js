/* =============================================================================
   Francesco Lauriola — site values
   -----------------------------------------------------------------------------
   The facts that appear in more than one place, written down once.

   Two consumers read this file:

     • the browser, at runtime — components.js builds the footer from it;
     • sync-content.py, a small helper kept with the project notes rather than
       in this folder, which rewrites the same values where they are baked into
       the HTML (<title>, the meta and og: tags, the JSON-LD, the visible copy).

   CHANGING A VALUE HERE IS HALF THE JOB. The footer follows immediately; every
   copy baked into the HTML does not. Run the helper, or edit those by hand.

   The rewrite is what keeps the metadata correct: social crawlers — LinkedIn,
   WhatsApp, Slack — never run JavaScript, so anything they must see has to be
   in the file itself, not injected by a script.

   FORMAT: everything between the braces must be strict JSON — double quotes, no
   trailing commas, no comments inside the object. The Python script parses it.
   Explanations go above, here.

   • role / roleInProse — the same job title, capitalised for a label and for
     the middle of a sentence ("a senior UX designer based in Turin").
   • careerStart — the script renders "nearly five years" and friends from this
     and today's date, so the sentence cannot quietly go stale.
   ========================================================================== */

window.SITE = {
  "name":        "Francesco Lauriola",
  "role":        "UX Designer",
  "roleInProse": "UX designer",
  "lastEdit":    "09/2026",
  "careerStart": "2021-09"
};
