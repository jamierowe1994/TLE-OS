# Which AI model each feature uses, and why

Decided 20 Oct 2026 from a head-to-head on real TLE work: Haiku 5.5, Sonnet 5.5 and
Opus 5.5 on the same inputs, with the model the feature used before as a fourth where it
mattered. A feature moved to a cheaper model only where the comparison showed no visible drop.
The models live in `lib/ai.ts`; every call is counted in `os_ai_usage` and added up on
**Admin > AI costs**.

Switch any feature back without a deploy: on Railway, TLE-OS service, set
`AI_MODEL_<FEATURE>` (e.g. `AI_MODEL_PLC_SCAN=claude-opus-5-5`) and optionally
`AI_EFFORT_<FEATURE>` (`low`, `medium`, `high`). The page shows "switched on Railway" when one is set.

Prices per million tokens (in / out): Opus 4.8 and Opus 5 $5 / $25, Opus 5.5 $4 / $20,
Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50, Haiku 4.5 $1 / $5.

## The choices

| Feature | Was | Now | Per call, measured | What the test showed |
|---|---|---|---|---|
| PLC document check | Opus 4.8 | **Sonnet 5.5**, medium | ~$0.079 → $0.034 | Same verdict as Opus 5.5 on all 12 real pack documents and the same facts. On a gas certificate noting an out-of-date CO alarm, Sonnet flagged it 6/6 times, Opus 5.5 2/5 (once it passed the certificate). Haiku 5.5 misread an issue date (2025 for 2023) |
| PLC file sorter | Haiku 4.5 | **Sonnet 5.5**, low | ~2x Haiku 4.5 | Haiku 5.5 filed a "Full Guarantor Referencing" report as a tenant reference 3/3 times; Sonnet and Haiku 4.5 got 12/13, Haiku 5.5 11/13 |
| Certificate reader | Haiku 4.5 | **Haiku 5.5**, low | $0.012 → $0.0015 | Issue date right on 11/12 (the 12th: the database was wrong, the model right) against Haiku 4.5's 5/12. Sonnet no better |
| Engineer register reader | Haiku 4.5 | **Haiku 5.5**, low | as above | Where no number is printed, Haiku 5.5 and Sonnet say so; Haiku 4.5 invented one |
| EPC reader | Haiku 4.5 | **Haiku 5.5**, low | as above | All three models identical on 5 EPCs |
| Steve (chat) | Opus 4.8 | **Opus 5.5**, medium | ~$0.10 a question | Opus gave the most useful answers on 10 real questions (e.g. "send an offer link" = the passport, with the walk-through). Haiku 5.5 answered everything sensibly at $0.002 but missed two of those |
| Steve's morning brief | Opus 4.8 | **Haiku 5.5**, low | ~50x cheaper per token | Same content as Opus on three real people's days |
| Steve reading links | Opus 4.8 | **Haiku 5.5**, low | ~50x cheaper per token | Same substance on three pages; Haiku followed "one line if it isn't lettings" best |
| Advert writer, listing auto-fill | Opus 5 | **Opus 5.5**, medium | 20% cheaper per token | Opus copy was clearly the best on two live listings. Haiku shorter and thinner; Sonnet hedged in the copy ("which look like a fridge") |
| Ask Bond | Opus 5 | **Opus 5.5**, medium | ~$0.06 a question | Opus best on 5 real prospecting questions (James's "find me 10 properties", why flagged, the story, the letter, planning). On the top-ten list Sonnet took a rent "cut" from £6,952 to £3,500 at face value ("an unhappy landlord"); Haiku and Opus both flagged it as a likely data error. Haiku missed that 67 Gordon Road is still advertised with its old agent. Only Opus noticed a "1-bed house" holding an HMO licence |
| Planning reader | Opus 5 | **Sonnet 5.5**, low | $0.0037 → $0.0016 an application | Same reading as Opus 5.5 on 40 real applications (8 HMO, 6 flats, 6 to residential, 8 new homes, 12 none): no lead lost and no false lead. The only differences were which of two signalling kinds (flats vs new homes) and one id copied wrong (that application is simply read again next run). Haiku 5.5 marked a farm barn conversion as "owner will live in it", which takes a real lead off the board. All three, unlike the stored Opus 5 readings, correctly read a Section 73 amendment as "none" |
| Translation | Opus 5.5 | **Opus 5.5**, low | under 1p a message | Opus clean on 5 messages in and 5 replies out (Polish, Romanian, Arabic, Portuguese, Punjabi). Sonnet turned "1 bed flat" into a one-room flat in Polish and added its own words. Haiku wrote names and addresses in Punjabi script (the rule is to keep them as written), added line breaks and went informal in Romanian. Too cheap to be worth the risk |
| Marketing library reader | Sonnet 5.5 | **Sonnet 5.5**, high | ~1p a file | Sonnet matched the hand-checked 13 Oct write-ups on 4 real files (England and Scotland landlord guides, the Partner Charter, a tenant checklist). Haiku 5.5 was close but called the Partner Charter "Agent Charter", told Steve to offer the moving checklist for questions about notice (it does not cover that) and dropped the "PRTs only" caveat |

Steve on Sonnet 5.5, re-run after the "answer goes last" fix (10 real questions, $0.46): **no tie.**
Sonnet still lost the answer on 3 of 10, writing it before its last tool call. For "where is the
guarantor listed on 33 eastfield road" it said only "I can open the Portfolio file ... The 'Yes, open it'
button is below", where Opus gave the guarantor's name, phone and the three places she shows. "38 Golders
Green is still showing as inspection due" and "no gas supply" came back as one line about a button or a
failed note to James. "How do I log an inspection?" got "Follow the highlight" pointing at the dashboard,
where Opus gave the four steps. It also still missed that the offer link is the passport, and that a
viewing is cancelled in REX. Steve stays on Opus 5.5.

## Things the newer models changed, already handled in `lib/ai.ts`

- Thinking is always on (Opus 5.5) or on by default (Haiku and Sonnet 5.5), so `max_tokens` was
  raised everywhere; effort is set per feature.
- A forced tool call is refused by Opus 5.5 and Sonnet 5.5. It is now "auto" plus an instruction,
  asked once more if the model answers in prose.
- Opus 5.5 and Sonnet 5.5 can decline on a safety classifier; those calls carry Anthropic's
  server-side fallback. A PLC read that comes back empty now says so as a query.
- **Text written before a tool call comes back hidden on Opus 5.5 and Sonnet 5.5.** Steve lost
  whole answers in testing ("I couldn't put an answer together"). Steve and Bond are now told to
  put the whole answer last, and keep the last thing said if the final message is empty.
  Re-checked on Opus 5.5: fixed.

## Re-running the comparison

`scripts/ai-compare/` has the harnesses (PLC check, document readers, Steve/brief/links/adverts)
and `run.sh`, which runs them against the live data through a read-only database session with
REX writes, email and texts left out. `/plc/bench` (local only) reads one document with
several models side by side. `others.ts` covers Ask Bond, the planning reader, translation and the
library reader (`CAP` stops a run at that many dollars). The first 20 Oct run cost about $5.60; the
second (Bond, planning, translation, library, Steve on Sonnet) $1.17.

In the read-only session Bond's campaigns and call-list (Nudges) tools fail, so the letter and
top-ten answers were compared without them; each model that tried one said it had failed.
