/**
 * Takrar's guides (/blog): short, original articles on how to memorise and keep the
 * Quran, and how the app's method works. Written for Takrar, not adapted from anyone's
 * learning plans or articles. Bodies use a small markdown subset (src/lib/mini-markdown.tsx):
 * ## headings, paragraphs, "- " lists, **bold** and [links](/path).
 */
export interface Guide {
  slug: string;
  title: string;
  summary: string;
  /** ISO date first published */
  date: string;
  minutes: number;
  body: string;
}

export const GUIDES: Guide[] = [
  {
    slug: 'the-6-4-4-6-method',
    title: 'The 6-4-4-6 method',
    summary: 'Why every new ayah in Takrar is recited twenty times, in four rounds, and why half of them are from memory.',
    date: '2026-10-17',
    minutes: 4,
    body: `
Every new ayah you learn in Takrar goes through the same four rounds:

- **Six times with the text.** Listen to the reciter and repeat after them, reading as you go.
- **Four times from memory.** The text is hidden. Recite it, and say honestly how it went.
- **Four times with the text again.** Look back at what you just tried to remember.
- **Six times from memory.** Hidden again, to fix it in place.

Then you put the ayah's words back in order, as a last check that you know the sequence and not just the sound.

## Why recite from memory so early

Reading an ayah over and over feels productive, because it gets familiar quickly. But familiar isn't the same as remembered. You only find out what you really hold when the page is gone.

That's why the second round hides the text after only six readings, before it feels comfortable. Trying to recall something, even when you stumble, does more for memory than another look at it. The stumble shows you exactly where the gap is, and the third round, with the text back, fills that gap while it's fresh.

## Why the numbers are six, four, four and six

The first six give you the sound and the shape. Four from memory is enough to find the weak spots without wearing you out. Four more with the text repairs them. The last six, from memory, are the longest round because that's the version you'll carry away.

Twenty recitations sounds like a lot, but most ayahs take only a few seconds. A lesson of three or four short ayahs takes about fifteen minutes.

## Joining ayahs together

Knowing ayahs one by one isn't the same as reciting them in a row. So after the second ayah of a lesson, you recite the first and second together from memory; after the third, all three. The lesson ends with the whole passage from memory. That's where you find out whether the joins hold.

## When to skip a round

If you already know an ayah well, you can skip ahead. The rounds are there to build memory, not to slow down someone who has it. Be honest, though: skipping a round you needed costs more in review later than it saves now.
`,
  },
  {
    slug: 'sabaq-sabqi-manzil',
    title: 'Sabaq, sabqi and manzil',
    summary: 'The three parts of a traditional hifz day, and how Takrar schedules each one for you.',
    date: '2026-10-17',
    minutes: 4,
    body: `
In many Quran schools, especially across South Asia, a student's day has three parts, each with its own name.

- **Sabaq** is the new lesson: today's few lines, learned until they can be recited from memory.
- **Sabqi** is the recent lessons: roughly the last week or so of sabaq, recited every day while they're still settling.
- **Manzil** is everything older: the juz already memorised, revised in turn so that nothing fades.

The idea behind it is simple. New memory is fragile and needs daily attention. Older memory is sturdier but still slips if it's left alone for long. So each part gets the attention it needs, every day.

## The common mistake

Most people who give up on hifz don't stop learning new ayahs. They stop revising old ones. The sabaq is exciting; the manzil is work. A month later, the first surahs they learned have faded, and starting again feels worse than starting fresh.

Keeping the three parts together is what prevents that. A smaller sabaq with a steady manzil goes further than a large sabaq with none.

## How Takrar does it

Takrar keeps the three parts for you:

- Your **lesson** is the sabaq: new ayahs, learned with the [6-4-4-6 method](/blog/the-6-4-4-6-method).
- Recently learned ayahs come back in **reviews** within days: that's the sabqi.
- Surahs you've held for a while move to longer intervals and come back in turn: the manzil.

Instead of a fixed cycle, each ayah keeps its own schedule. Recite it cleanly and it comes back later; stumble and it comes back sooner. The ayahs you keep slipping on are gathered into a short drill, so the weakest parts of your manzil get attention first.

If you already know some surahs, tell the [planner](/plans) when you set it up. They join the manzil from the start, so they're revised alongside everything new.
`,
  },
  {
    slug: 'long-ayahs-in-parts',
    title: 'Learning long ayahs in parts',
    summary: 'How to memorise an ayah that runs for several lines: split it where the reciter pauses, then join the parts back together.',
    date: '2026-10-17',
    minutes: 3,
    body: `
Some ayahs are a few words long. Others run for half a page. Ayat al-Kursi is a single ayah; the longest ayah in the Quran, at the end of Al-Baqarah's long passage on debts, fills most of a page.

Trying to learn a long ayah in one go usually ends with the beginning solid, the middle muddled and the end missing. It works better in parts.

## Where to split

The Quran already marks good places to pause. The small signs above the line, like ۚ and ۖ, show where a reciter may stop and breathe. Splitting at those marks keeps each part a complete phrase, so it carries its own meaning and is easier to hold.

Takrar does this for you. Any ayah longer than about thirty words is split at its pause marks into parts of a manageable size, and each part is learned with the [6-4-4-6 method](/blog/the-6-4-4-6-method) as if it were an ayah of its own.

## Joining the parts

Learning the parts is half the job. The other half is the joins. After the second part, you recite the first and second together from memory; after the third, all three, and so on, until the last join is the whole ayah.

The joins are where long ayahs usually break. You know each part, but moving from one to the next makes you hesitate. Practising the joins on purpose, every time a new part is added, is what makes the ayah one piece again.

## A tip for the hardest ones

Before you start, listen to the whole ayah once or twice while following the meaning. Knowing what the ayah is saying, and how its parts connect in meaning, gives you a thread to follow when the words alone run out.
`,
  },
  {
    slug: 'similar-verses',
    title: "Similar verses: how to stop mixing them up",
    summary: "Hundreds of ayahs have a near-twin elsewhere in the Quran. Here's why that trips people up, and how to keep them apart.",
    date: '2026-10-17',
    minutes: 4,
    body: `
Ask anyone who has memorised a lot of the Quran what goes wrong when they recite, and similar verses will come up quickly. In Arabic they're called **mutashabihat**: ayahs that are almost the same as another one somewhere else, differing by a word or two.

They're common. In Takrar's data, about 565 ayahs, roughly one in eleven, have a near-twin elsewhere in the Quran. Some pairs are in the same surah; many are in different surahs entirely.

## Why they cause trouble

When you recite from memory, the opening words of an ayah call up the rest. If two ayahs open the same way, the stronger memory tends to win. You start in one surah and, without noticing, finish in the other. Because the words around the switch are correct, it can go unnoticed for a long time.

## How to keep them apart

- **Learn the difference, not just the ayah.** When you meet an ayah with a twin, look at both side by side and find exactly what changes: a word added, a word swapped, a different ending.
- **Anchor each one to its place.** Notice what comes before and after each twin. The ayah that follows is often the best clue to which one you're in.
- **Revise them together.** Reciting both versions in the same session, one after the other, trains you to choose rather than drift.

## What Takrar does

When an ayah you're learning has a twin, Takrar tells you and shows the two together, with the differing words marked. There's also a short practice that asks you to tell similar ayahs apart, and in the page view you can mark the similar ayahs on the page.

The aim isn't to avoid the similar verses. It's to know them so well that the difference is the first thing you notice.
`,
  },
  {
    slug: 'how-reviews-work',
    title: 'How reviews keep what you learn',
    summary: 'Why Takrar brings each ayah back on its own schedule, what "Got it", "Shaky" and "Missed" do, and what happens when you miss a day.',
    date: '2026-10-17',
    minutes: 4,
    body: `
Memory fades in a predictable way: quickly at first, then more slowly. An ayah learned today can slip within days if it isn't revisited; one you've revised several times over weeks will hold for much longer.

That's the idea behind Takrar's reviews. Instead of revising everything every day, which soon takes hours, each ayah comes back just before you would be likely to lose it.

## Your ratings set the schedule

After you recite an ayah in a review, you say how it went:

- **Got it**: recited cleanly. It comes back later than last time.
- **Shaky**: you got there, with a hesitation or a slip. It comes back sooner.
- **Missed**: you couldn't recall it. It goes back to the start and returns soon.

There's no penalty for an honest "Shaky". It's the most useful rating you can give, because it catches an ayah before it's lost.

## Weak spots

Some ayahs keep slipping however often you revise them. Takrar notices when an ayah is missed again and again and gathers those into a short weak-spots drill, so you can work on them directly instead of meeting them by chance.

## When you miss a day

Life happens. If you miss a day, your reviews wait for you, ordered so that the ayahs most at risk come first. A streak freeze covers the occasional missed day, so one bad day doesn't undo weeks of habit.

If you've been away for longer, Takrar suggests a lighter catch-up instead of asking you to clear everything at once. Coming back is what matters.

## A rhythm that lasts

Reviews usually take less time than you expect, because most ayahs you've held for a while only come back every few weeks. Most of your time goes on the ayahs that need it. Over months, that's what lets you keep learning new ayahs without losing the old ones.
`,
  },
  {
    slug: 'memorising-when-busy',
    title: 'Memorising when you are busy',
    summary: 'Small daily lessons, a fixed time, and listening in the gaps: a realistic way to keep going with work, study or family.',
    date: '2026-10-17',
    minutes: 3,
    body: `
Most people memorising the Quran aren't full-time students. They have work, exams, children, long commutes. The good news is that hifz rewards consistency far more than long sessions.

## Make the lesson small

A lesson of two or three short ayahs takes about fifteen minutes. That's small enough to do on a hard day, which is the point: the habit survives the hard days. You can always do a second lesson when you have time; you can't make up for the week you stopped.

## Give it a fixed time

Tie your lesson to something that already happens every day: after Fajr, before work, after Isha. A fixed time means you don't have to decide each day whether to do it. Takrar's daily reminder can nudge you at that time.

## Use the gaps for listening

Listening isn't memorising, but it helps a great deal. Play your lesson, or the surah you're revising, on a commute, while cooking, or on a walk. In the phone app the player keeps going with the screen off, and you can download a surah to listen without a signal.

## Protect your revision

When time is short, it's tempting to keep the new lesson and skip the reviews. Do the opposite: on a busy day, keep your reviews and skip the new lesson. New ayahs can wait a day; old ones fade.

## Plan honestly

When you set up a [plan](/plans), choose a pace you could keep on your worst week, not your best. One lesson on weekdays, finished, is worth more than two a day that stop after a fortnight. You can always raise the pace later.
`,
  },
];

export const findGuide = (slug: string) => GUIDES.find((g) => g.slug === slug) ?? null;
