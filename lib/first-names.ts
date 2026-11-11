/**
 * A FIRST NAME WHERE THE RECORD HAS ONLY AN INITIAL (Lianna Denholm, 11 Nov
 * 2026, 1 Marchmont Road: "tenants 1st names still missing ... when I send
 * works order only initial appears").
 *
 * 77 tenants on 24 homes are held as "A George": the old system's tenancy
 * record named the joint let by initials, and PayProp holds the very same
 * spelling, so the fix of 10 Nov (take the fuller name PayProp has on the
 * home) had nothing to take. The one other place a first name is written down
 * is the tenant's own email address: annageorgeuk@, fraserkate2007@.
 *
 * A wrong first name in front of a contractor or in "Hi ..." is worse than an
 * initial, so the email is only believed when every one of these holds:
 *
 *   the name on the record is initials and a surname
 *   the surname (three letters or more) is in the address
 *   what sits beside it starts with the record's first initial
 *   and is a first name we know (the list below, plus every first name the OS
 *     already holds), with at most two consonants left over before the surname
 *     (middle initials: "kirstypw"), never a vowel ("jones" is not Jon)
 *   and there is exactly one such reading
 *
 * Anything else is left as the record has it, for a person to type in
 * (/portfolio/tenant-names). "P Chan" at kirstypwchan@ is left: the address
 * says Kirsty, the record says P, and one of them is wrong.
 */

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** "A George", "A. George", "A B George": every word but the last is a single letter. */
export function initialOnly(name: string): boolean {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return w.length >= 2 && w.slice(0, -1).every((x) => x.replace(/\./g, "").length === 1) && letters(w[w.length - 1]).length >= 2;
}

/** The name with its first name spelled out from their email, or null when the email does not say it plainly. */
export function nameFromEmail(name: string, email: string | null | undefined, known: ReadonlySet<string> = COMMON_FIRST_NAMES): string | null {
  if (!initialOnly(name)) return null;
  const w = name.trim().split(/\s+/);
  const surname = w[w.length - 1];
  const initial = w[0][0].toLowerCase();
  const sur = letters(surname);
  const local = letters(String(email ?? "").split("@")[0]);
  if (sur.length < 3 || !local.includes(sur)) return null;
  const at = local.indexOf(sur);
  /* The surname twice in the address is not one we can split. */
  if (local.indexOf(sur, at + 1) !== -1) return null;
  const found = new Set<string>();
  for (const [k, part] of [local.slice(0, at), local.slice(at + sur.length)].entries()) {
    if (!part.startsWith(initial)) continue;
    for (let n = part.length; n >= 3; n--) {
      const left = part.slice(n);
      /* Middle initials sit between the first name and the surname ("kirstypw" + "chan"), so
         letters left over are only allowed there, and never a lone "s": "stephens" is a
         surname, not Stephen. */
      const spare = !left || (k === 0 && left.length <= 2 && left !== "s" && !/[aeiouy]/.test(left));
      if (spare && (known.has(part.slice(0, n)) || COMMON_FIRST_NAMES.has(part.slice(0, n)))) {
        found.add(part.slice(0, n));
        break;
      }
    }
  }
  if (found.size !== 1) return null;
  const first = [...found][0];
  return `${first[0].toUpperCase()}${first.slice(1)} ${surname}`;
}

/** The first word of every full name given, lower case, for the list of first names the OS already holds. */
export function firstNamesIn(names: Iterable<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const n of names) {
    const f = letters(String(n ?? "").trim().split(/\s+/)[0] ?? "");
    if (f.length >= 3) out.add(f);
  }
  return out;
}

/** First names common among tenants here. Only ever used to recognise one inside an email address. */
export const COMMON_FIRST_NAMES: ReadonlySet<string> = new Set(
  `aaron abbie abby abdul abigail adam adele adrian ahmed aidan aiden ailsa aimee aisha alan alana alasdair alastair albert alex alexa alexander alexandra alexis alfie alice alicia alisha alison alistair allan amanda amber amelia amelie amy ana anastasia andrea andrew andy angela angus anita ann anna annabel annabelle anne annie anthony antonia antonio april archie arthur ashleigh ashley austin ava
  barbara barry beatrice becky bella ben benjamin bernard beth bethan bethany billy blair bobby bonnie bradley brandon brenda brian bridget brooke bruce bryan
  caitlin callum calum cameron cara carl carla carly carol caroline carolyn carrie casey catherine cathy catriona cecilia celia charles charlie charlotte chelsea cheryl chloe chris christian christina christine christopher ciara ciaran claire clara clare claudia colin connor conor corey courtney craig crystal
  daisy dale damian damien dan dana daniel daniela daniella danielle danny darcy darren david dawn dean deborah debbie declan denise dennis derek diana diane dominic donald donna dorothy douglas duncan dylan
  eamon ed eddie edith edward edwin eilidh eileen elaine eleanor elena elijah elise elizabeth ella ellen ellie elliot elliott eloise elsie emilia emily emma eric erica erin esme ethan euan eva evan eve evelyn evie ewan
  faith faye felicity felix fergus finlay finley finn fiona florence frances francesca francis frank frankie fraser fred freddie freya
  gabriel gabriella gareth gary gavin gemma george georgia georgie georgina gerald gerard gillian gina glen glenn gordon grace graeme graham grant greg gregor gregory gwen
  hamish hannah harriet harrison harry harvey hayley hazel heather heidi helen helena henry holly hope howard hugh hugo
  iain ian imogen india ines iona irene iris isaac isabel isabella isabelle isla isobel ivy
  jack jackie jackson jacob jacqueline jade jake james jamie jan jane janet janice jasmine jason jay jayden jean jeff jemima jemma jen jenna jennifer jenny jeremy jess jessica jessie jill jim jimmy joan joanna joanne jodie joe joel joey john johnny jon jonathan jonny jordan joseph josh joshua josie joy joyce judith julia julian julie june justin
  kai kara karen karl kate katherine kathleen kathryn katie katrina katy kay kayla kayleigh keith kelly kelsey ken kenneth kerry kevin kieran kim kimberley kimberly kirsten kirsty kyle
  lachlan lara laura lauren laurence lawrence layla leah leanne lee leo leon leona leonie lesley leslie lewis liam libby lily linda lindsay lindsey lisa liz lizzie lloyd logan lois lola lorna lorraine lottie louis louisa louise luca lucas lucia lucy luke lydia lynn lynne
  maddie maddison madeleine madeline madison maeve maggie maisie malcolm mandy marc marco marcus margaret maria marian marie marion mark martha martin martina mary matilda matt matthew maureen max maya megan melanie melissa mia michael michaela michelle mike millie milly mohammed mollie molly morag morgan muhammad murray myles
  nadia naomi natalie natasha nathan nathaniel neil niall niamh nicholas nick nicky nicola nicole nigel nina noah norman
  oliver olivia ollie oscar owen
  paige pamela patricia patrick paul paula pauline penny peter philip philippa phillip phoebe pippa poppy
  rachael rachel ralph raymond rebecca rebekah reece regan rhiannon rhys richard ricky riley robbie robert robin robyn roger ronald rory rosa rose rosemary rosie ross rowan roy ruby rupert russell ruth ryan
  sabrina sally sam samantha samuel sandra sara sarah sasha scarlett scott sean sebastian selina seth shannon sharon shaun shauna sheila shelley shirley shona sian sienna simon simone siobhan skye sofia sonia sophia sophie stacey stanley stefan stella stephanie stephen steve steven stewart stuart sue summer susan susanna susie suzanne sylvia
  tara taylor ted teresa terry tess tessa thea theo theodore theresa thomas tia tim timothy tina toby tom tommy tony tracey tracy trevor tristan tyler
  una
  valerie vanessa vera veronica vicky victor victoria vincent violet vivian vivienne
  walter wayne wendy will william willow
  xander xavier
  yasmin yvonne
  zach zachary zack zara zoe`
    .split(/\s+/)
    .filter(Boolean)
);
