// Family memory & carry-over consequences.
//
// The family remembers what the player did on a mission and brings it up later:
//  • rememberResult  — turns a finished mission into 0–3 short memories (some with a next-day effect)
//  • onNewDay        — applies yesterday's pending effects exactly once + one warm morning chat
//  • memoryChat      — family members sometimes mention a recent memory, in their own voice
//  • missionLock     — the world opens up as the player proves themselves
// Everything is deterministic (no Math.random) so saves, retries and tests behave the same.
import type { GameStore } from './store';
import type { FamilyMember, Memory, MissionResult, Role } from '../domain/types';
import type { MissionDef } from '../missions/types';
import { GUARDIAN_ROLES } from '../domain/types';
import { money, words } from '../domain/region';
import { formatMoney } from '../domain/items';
import { getMission } from '../missions/registry';

type Kind = Memory['kind'];

export const POSITIVE_KINDS: Kind[] = ['kind', 'responsible', 'honest', 'thrifty', 'helpful', 'brave'];
export const isPositive = (m: Pick<Memory, 'kind'>) => POSITIVE_KINDS.includes(m.kind);

/** How many memories the save keeps (oldest drop off). */
const MAX_MEMORIES = 40;
/** Share of family chats that bring up a memory (0–100). */
export const MEMORY_CHAT_CHANCE = 40;
/** Trust with the assigner that unlocks the town trips without the usual first step. */
export const TRUST_UNLOCK = 70;
/** World flag recording a mission was completed at least once (survives the 30-result cap). */
export const doneKey = (missionId: string) => `mem.done.${missionId}`;

/**
 * Per-memory talking points. `topic` is how *other* family members refer to it ("you …"),
 * `lesson` is the one-line life lesson used in the morning chat.
 */
const TOPICS: Record<string, { topic: string; lesson: string }> = {
  'helped-elder': { topic: 'you let an elderly lady go ahead of you at FreshMart', lesson: 'Small kindnesses cost a minute and make someone’s whole day.' },
  'no-milk': { topic: 'the milk didn’t make it home', lesson: 'When a shelf is empty, a quick call home turns a problem into a plan.' },
  'milk-sub': { topic: 'you found another milk when the shelf was empty', lesson: 'Asking before you swap something shows you care about getting it right.' },
  'pocket-cut': { topic: 'you bought a few extras with the shopping money', lesson: 'Shopping money is for the list — treats come from your own pocket money.' },
  'over-budget': { topic: 'the shopping went over budget', lesson: 'Comparing prices before the basket saves you from surprises at the till.' },
  'change-back': { topic: 'you brought back every bit of the change', lesson: 'Being honest with money is how people learn to trust you with more.' },
  'hid-mug': { topic: 'a mug went under the bed instead of to the sink', lesson: 'Clean means really clean — not just clean-looking.' },
  'made-bed': { topic: 'you made your bed without being asked', lesson: 'Small daily habits make the biggest difference.' },
  'calm-sibling': { topic: 'you stayed calm when the crayons got confusing', lesson: 'Explaining calmly works better than raising your voice.' },
  'snapped-sibling': { topic: 'you got a bit snappy over the crayons', lesson: 'When you feel frustrated, a slow breath and a simple explanation help.' },
  'gave-up-sibling': { topic: 'the crayon mix-up didn’t get sorted out', lesson: 'A short, kind explanation usually clears up a misunderstanding.' },
  'burnt-soup': { topic: 'the soup burned a little', lesson: 'Stay near the stove — a timer is a cook’s best friend.' },
  'left-stove': { topic: 'the stove was left on when you went out', lesson: 'Stove off before you leave the kitchen. Every single time.' },
  'hid-burnt': { topic: 'the burnt pot was kept a secret', lesson: 'Mistakes are easy to fix when people know early.' },
  'told-burnt': { topic: 'you owned up about the burnt pot', lesson: 'Owning a mistake takes courage, and it builds trust.' },
  'pink-hidden': { topic: 'a pink shirt was hidden at the back of the rack', lesson: 'Saying “I made a mistake” early is always easier than being found out.' },
  'pink-told': { topic: 'you were honest about the pink shirts', lesson: 'Honesty turns a mistake into something we can fix together.' },
  'pink-rewash': { topic: 'you re-washed the pink shirts to fix them', lesson: 'Fixing your own mistake is a grown-up move.' },
  'wrong-bus': { topic: 'you hopped on the wrong bus and still found your way', lesson: 'Check the number on the front of the bus, or just ask the driver.' },
  'drop-box': { topic: 'you used the library drop box when it was closed', lesson: 'When plan A is closed, look for plan B.' },
  'book-late': { topic: 'the library book didn’t get returned', lesson: 'Check opening hours before you set off.' },
  'missed-post': { topic: 'the letter missed the last post', lesson: 'Do the errand that closes earliest first.' },
  'good-plan': { topic: 'you planned the errands in a smart order', lesson: 'Ten seconds of planning saves ten minutes of rushing.' },
  'forgot-card': { topic: 'the health card stayed at home', lesson: 'A quick checklist at the door saves a second trip.' },
  'showed-slip': { topic: 'you brought back the appointment slip', lesson: 'Writing details down beats trying to remember them.' },
  'trusted-more': { topic: 'you finished a job on time and did it really well', lesson: 'Doing things well, on time, is how you earn more freedom.' },
  late: { topic: 'a job ran a bit late', lesson: 'Leave a ten-minute buffer — queues and buses always take longer.' },
  // optional teen storyline (date-night)
  'date-allergy': { topic: 'you remembered your date’s peanut allergy', lesson: 'Remembering small details is how people feel cared for.' },
  'date-peanut': { topic: 'the peanut chocolate mix-up', lesson: 'Listening properly includes the boring-but-important bits, like allergies.' },
  'date-curfew': { topic: 'you walked your date to the bus so they got home on time', lesson: 'Respecting other people’s rules and curfews is a big part of being trusted.' },
  'date-pleaded': { topic: 'you asked your date to stay past their curfew', lesson: 'When someone says they need to go, “okay!” is always the right answer.' },
  'date-pickup': { topic: 'the bus timetable pickup line', lesson: 'Laughing at your own cringe is a superpower.' },
  'date-sneak': { topic: 'you slipped out without saying where you were going', lesson: 'Telling your family where you are going is about safety, not just rules.' },
  'date-favour': { topic: 'you did the chores before going out', lesson: 'Family first, fun second — and you can usually have both.' },
  // market-day (bargaining at the market cart)
  'market-polite': { topic: 'you bargained so politely at the market cart', lesson: 'Firm and friendly gets the best price — and a vendor who remembers you.' },
  'market-rude': { topic: 'you were rude to the vendor at the market', lesson: 'Vendors are people earning a living. You can bargain hard and still be kind.' },
  'market-elder': { topic: 'you squeezed the elderly vendor for a few coins', lesson: 'A fair price is a kind price — a couple of coins mean more to her than to you.' },
  'market-honest': { topic: 'you fibbed about prices at the market', lesson: 'Honest comparisons work; made-up ones cost you trust.' },
};

const keyOf = (m: Memory) => m.id.split('@')[0];
export function topicOf(m: Memory) {
  return TOPICS[keyOf(m)] ?? { topic: 'what happened the other day', lesson: 'Every day is a chance to try again.' };
}

/** Small deterministic hash (FNV-1a) → 0..2^32. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function memories(s: GameStore): Memory[] {
  if (!s.state.memories) s.state.memories = [];
  return s.state.memories;
}

// ---------------------------------------------------------------- rememberResult

const LIST_IDS = new Set(['milk-packet', 'milk-tetra', 'milk-tetra-old', 'tomato', 'potatoes', 'baby-potatoes']);

/** What the player spent on non-list items during this grocery run (bags excluded). */
function groceryExtras(s: GameStore, result: MissionResult, startedAt: number | null): number {
  if (startedAt === null) return 0;
  let total = 0;
  for (const rc of s.state.receipts) {
    if (rc.at < startedAt || (rc.day !== undefined && rc.day !== result.day)) continue;
    for (const l of rc.lines) {
      if (LIST_IDS.has(l.id) || /bag/.test(l.id)) continue;
      total += l.price * Math.max(0, l.qty - (l.returned ?? 0));
    }
  }
  return Math.round(total * 100) / 100;
}

interface Draft {
  key: string;
  who: string;
  kind: Kind;
  text: string;
  effect?: Memory['effect'];
}

/** Called once when a mission ends, with its result. */
export function rememberResult(s: GameStore, result: MissionResult): void {
  const def = getMission(result.missionId);
  // finishMission calls us while the run is still set, so its flags are available
  const run = s.state.run && s.state.run.missionId === result.missionId ? s.state.run : null;
  const f = run?.flags ?? {};
  const fb = result.feedback.join(' ');
  const dec = (re: RegExp, tone?: 'good' | 'neutral' | 'bad') => result.decisions.some((d) => re.test(d.text) && (!tone || d.tone === tone));
  const assigner =
    (run && s.member(run.assignerId)) ||
    (def && s.memberByRole(...def.assignerRoles)) ||
    s.memberByRole(...GUARDIAN_ROLES);
  const boss = assigner?.id ?? 'family';
  const sibling = s.memberByRole('younger-sibling', 'older-sibling');
  const done = result.outcome !== 'incomplete';
  const drafts: Draft[] = [];
  const add = (d: Draft) => drafts.push(d);

  switch (result.missionId) {
    case 'grocery-run': {
      if (f['helpedElder'] || /elderly lady go first/.test(fb))
        add({ key: 'helped-elder', who: boss, kind: 'kind', text: 'You let that elderly lady go first at FreshMart. That made me proud.', effect: { type: 'trust', delta: 1, say: 'Someone at FreshMart told me how kind you were yesterday. That made my morning.' } });

      const milkMissing = (!!f['skippedMilk'] && Number(f['missingAtDelivery'] ?? 0) > 0) || dec(/milk was missing/i);
      const milkSoldOut = run ? run.challengesSeen.includes('stock-out-milk') : /milk was sold out/i.test(fb);
      if (milkMissing)
        add({ key: 'no-milk', who: boss, kind: 'forgetful', text: words('We had no milk for {tea}. Next time, call me if the shelf is empty.'), effect: { type: 'no-milk', say: words('No milk for {tea} this morning… It’s okay — next time, a quick call home and we’ll find a fix together.') } });
      else if (milkSoldOut && done)
        add({ key: 'milk-sub', who: boss, kind: 'helpful', text: 'The milk was sold out and you still found a good one. Thank you!', effect: { type: 'milk-thanks', say: words('Lovely {tea} this morning — thanks to the milk you found when the shelf was empty. {praise}') } });

      const budget = result.budget;
      const spent = result.moneySpent;
      if (budget !== null) {
        const cash = run?.cashGiven ?? budget;
        const ownMoney = Math.max(0, spent - cash); // already came out of the player's wallet
        const extras = groceryExtras(s, result, run?.startedAt ?? null);
        const cut = Math.min(money(20), Math.max(0, Math.round((extras - ownMoney) * 100) / 100));
        if (cut > 0)
          add({ key: 'pocket-cut', who: boss, kind: 'wasteful', text: 'You bought extras with the shopping money. We agreed extras come from your own pocket money.', effect: { type: 'pocket-cut', amount: cut, say: `We agreed the extras came from your pocket money, so today’s is ${formatMoney(cut)} less. No hard feelings — it’s how budgets work.` } });
        else if (ownMoney > 0)
          add({ key: 'over-budget', who: boss, kind: 'wasteful', text: 'The shopping went over budget, so the extra came from your own pocket money. Compare prices next time.' });
        else if (done && spent <= budget && (Number(f['returnedChange'] ?? 0) > 0 || (!run && spent < budget)))
          add({ key: 'change-back', who: boss, kind: 'thrifty', text: 'You stayed in budget and brought back all the change. I noticed.', effect: { type: 'bonus', amount: money(5), say: `You stayed in budget and brought back every bit of change. Here’s ${formatMoney(money(5))} extra — honesty with money pays.` } });
      }
      break;
    }
    case 'clean-room': {
      if (f['hidMug'] || /Hiding the mug/.test(fb))
        add({ key: 'hid-mug', who: boss, kind: 'careless', text: 'I found a mug under the bed. Next time, dishes go to the sink — clean means clean!' });
      if (/Making the bed/.test(fb))
        add({ key: 'made-bed', who: boss, kind: 'responsible', text: 'You made your bed too. Small habits, big difference.' });
      break;
    }
    case 'help-sibling': {
      const sib = sibling?.id ?? boss;
      if (dec(/^A misunderstanding:/, 'good'))
        add({ key: 'calm-sibling', who: sib, kind: 'kind', text: 'You explained about my crayons really nicely. Thanks for not getting mad!', effect: { type: 'trust', delta: 1, say: 'My art teacher loved the crayons! Thanks for packing them — and for being nice about it.' } });
      else if (dec(/^A misunderstanding:/, 'neutral'))
        add({ key: 'snapped-sibling', who: sib, kind: 'careless', text: 'You kinda yelled about the crayons… but you still packed my bag. Thanks, I guess.' });
      else if (dec(/^A misunderstanding:/, 'bad'))
        add({ key: 'gave-up-sibling', who: sib, kind: 'careless', text: 'I didn’t have my crayons for art. Can you explain stuff to me next time?' });
      break;
    }
    case 'cook-meal': {
      if (f['leftStove'] || /stove on/.test(fb))
        add({ key: 'left-stove', who: boss, kind: 'careless', text: 'The stove was left on when you went out. That one really matters.', effect: { type: 'reminder', say: 'One thing before breakfast: the stove goes off before you leave the kitchen. Always. I know you’ll remember now.' } });
      else if (f['burnt'] || /soup burned|burnt pot/.test(fb))
        add({ key: 'burnt-soup', who: boss, kind: 'careless', text: 'The soup burned a little. Happens to every cook!', effect: { type: 'reminder', say: 'Let’s cook together later — I’ll show you my timer trick so the soup never burns again.' } });
      if (f['hidBurnt'] || /Hiding the burnt pot/.test(fb))
        add({ key: 'hid-burnt', who: boss, kind: 'careless', text: 'I could taste the burnt pot. Next time, just tell me — I won’t be cross.' });
      else if (/truth about the burnt pot/.test(fb))
        add({ key: 'told-burnt', who: boss, kind: 'honest', text: 'You told me straight away about the burnt pot. That’s real honesty.' });
      break;
    }
    case 'laundry': {
      if (f['hidPink'] || /Hiding the pink shirt/.test(fb))
        add({ key: 'pink-hidden', who: boss, kind: 'careless', text: 'There was a pink shirt hidden at the back of the rack…', effect: { type: 'trust', delta: -3, say: 'I found the pink shirt hiding at the back of the rack. I’m not upset about the shirt — I’d just rather hear it from you.' } });
      else if (f['pinkChoice'] === 'told' || /truth about the pink shirts/.test(fb))
        add({ key: 'pink-told', who: boss, kind: 'honest', text: 'You told me about the pink shirts straight away. Thank you for being honest.', effect: { type: 'trust', delta: 2, say: 'Still thinking about how honest you were about the pink shirts. That means a lot to me.' } });
      else if (f['pinkChoice'] === 'rewash' || /Re-washing with whitener/.test(fb))
        add({ key: 'pink-rewash', who: boss, kind: 'responsible', text: 'You fixed the pink shirts yourself with a re-wash. Very grown-up.' });
      break;
    }
    case 'bus-trip': {
      if (f['wrongBus'] || /Getting on Route 7/.test(fb))
        add({ key: 'wrong-bus', who: boss, kind: 'brave', text: 'You took the wrong bus and still found your way back. Next time, check the number first!' });
      if (f['returnedVia'] === 'box' || /used the return box/.test(fb))
        add({ key: 'drop-box', who: boss, kind: 'responsible', text: 'The library was closed, but you used the drop box. Smart thinking!' });
      else if (/book was not returned/.test(fb))
        add({ key: 'book-late', who: boss, kind: 'late', text: 'The book didn’t make it back. Let’s check the opening hours together next time.' });
      break;
    }
    case 'errands': {
      if (f['missed:post-letter'] || f['missed:get-parcel'] || f['letterLate'] || /missed the last collection|post office closed/.test(fb))
        add({ key: 'missed-post', who: boss, kind: 'late', text: 'The post closed before you got there. Tomorrow, let’s do that one first.' });
      else if (/Great planning/.test(fb))
        add({ key: 'good-plan', who: boss, kind: 'responsible', text: 'You planned the errands in a smart order. That’s how adults do it!' });
      break;
    }
    case 'date-night': {
      const partner = s.memberByRole('partner');
      const pid = partner?.id ?? boss;
      const fav = typeof f['favourBy'] === 'string' && f['favourBy'] ? String(f['favourBy']) : (s.memberByRole(...GUARDIAN_ROLES)?.id ?? 'family');
      if (f['favour'] === 'sneaked')
        add({ key: 'date-sneak', who: fav, kind: 'careless', text: 'You slipped out without doing the chores or saying where you were going.', effect: { type: 'trust', delta: -2, say: words('You slipped out yesterday without a word. Next time just tell me where you’re going — I would have said yes, {endearment}.') } });
      if (f['snacks'] === 'safe')
        add({ key: 'date-allergy', who: pid, kind: 'kind', text: 'You remembered I can’t have peanuts 🥺', effect: { type: 'trust', delta: 1, say: 'you remembered no peanuts!! 🥺 told my mum and she said “keep that one” 😂' } });
      else if (f['snacks'] === 'peanut')
        add({ key: 'date-peanut', who: pid, kind: 'forgetful', text: 'The peanut chocolate… I’m allergic, remember? 😅 It’s okay!' });
      if (f['curfew'] === 'walked')
        add({ key: 'date-curfew', who: pid, kind: 'responsible', text: 'You walked me to the bus so I was home by 7:15.', effect: { type: 'trust', delta: 1, say: 'my mum says hi 😂 she liked that I was home on time' } });
      else if (f['curfew'] === 'pleaded')
        add({ key: 'date-pleaded', who: pid, kind: 'careless', text: 'When I say I have to go home, please just say okay 🙂', effect: { type: 'reminder', say: 'hey, about yesterday — when I say I have to go home, I need you to be cool with it, okay? 🙂 still had fun though' } });
      if (f['pickup'])
        add({ key: 'date-pickup', who: pid, kind: 'brave', text: 'The bus timetable line. Unforgettable. 😂', effect: { type: 'reminder', say: 'I still think about the bus timetable line. Every day. It haunts me 😂' } });
      if (f['favour'] === 'done')
        add({ key: 'date-favour', who: fav, kind: 'helpful', text: 'You did the chores before heading out to meet your friend. Thank you!' });
      break;
    }
    case 'market-day': {
      const vendor = typeof f['mk.vendor'] === 'string' && f['mk.vendor'] ? String(f['mk.vendor']) : 'the vendor';
      const rude = Number(f['mk.rude'] ?? 0) > 0 || !!f['mk.joinedMob'];
      const paid = Number(f['mk.paid'] ?? 0);
      const list = Number(f['mk.list'] ?? 0);
      if (rude)
        add({ key: 'market-rude', who: boss, kind: 'careless', text: `${vendor} told me you were rude at the cart. Bargaining is fine — rudeness isn't.`, effect: { type: 'trust', delta: f['mk.apologised'] ? 0 : -1, say: f['mk.apologised'] ? `${vendor} said you came back and apologised yesterday. That's how grown-ups fix things.` : `${vendor} told me you were rude at the cart yesterday… Let's be firm but kind next time, okay?` } });
      else if (Number(f['mk.deals'] ?? 0) > 0 && Number(f['mk.polite'] ?? 0) > 0 && paid < list && done)
        add({ key: 'market-polite', who: boss, kind: 'thrifty', text: `You got the vegetables for ${formatMoney(paid)} instead of ${formatMoney(list)} — and so politely!`, effect: { type: 'trust', delta: 1, say: `I told the neighbours how nicely you bargained at the market — ${formatMoney(paid)} instead of ${formatMoney(list)}! ${vendor} says you're welcome any time.` } });
      if (f['mk.squeezed'])
        add({ key: 'market-elder', who: boss, kind: 'careless', text: `You haggled ${vendor} down by a couple of coins. She works hard for every sale.`, effect: { type: 'reminder', say: `I saw ${vendor} at the cart this morning, still there since dawn. A couple of coins mean more to her than to us — let's pay her fairly, okay?` } });
      if (f['mk.citedFalse'])
        add({ key: 'market-honest', who: boss, kind: 'careless', text: 'Telling the vendor FreshMart was cheaper when it wasn’t… honesty matters, even when bargaining.' });
      break;
    }
    case 'clinic-visit': {
      const grand = s.memberByRole('grandparent')?.id ?? boss;
      if (/health card was forgotten/.test(fb))
        add({ key: 'forgot-card', who: grand, kind: 'forgetful', text: words('The health card stayed at home, {endearment}. A checklist at the door helps.') });
      if (f['showedSlip'] || /Showing the written slip/.test(fb))
        add({ key: 'showed-slip', who: grand, kind: 'responsible', text: words('You brought me the slip with the time and room. Clever, {endearment}.') });
      break;
    }
  }

  // general: great work on time earns trust; lateness gets one gentle note (family tasks only — not dates)
  if (result.missionId === 'date-night') {
    /* the partner isn't the family: no "you've earned more responsibility" note */
  } else if (result.outcome === 'completed' && result.overall >= 80)
    add({ key: 'trusted-more', who: boss, kind: 'responsible', text: `You did “${result.title}” on time and really well. You’ve earned more responsibility.`, effect: { type: 'trust', delta: 2, say: `I keep thinking about how well you handled “${result.title}”. You’ve earned more responsibility around here.` } });
  else if (result.outcome === 'completed-late' && !drafts.length)
    add({ key: 'late', who: boss, kind: 'late', text: `“${result.title}” ran a bit late. A ten-minute buffer helps.` });

  // remember completion for unlocks (results are capped at 30)
  if (done) s.state.world[doneKey(result.missionId)] = true;

  const list = memories(s);
  const fresh: Memory[] = drafts.slice(0, 3).map((d) => ({
    id: `${d.key}@${result.id}`,
    day: result.day,
    who: d.who,
    kind: d.kind,
    text: d.text,
    ...(d.effect ? { effect: d.effect } : {}),
  }));
  s.state.memories = [...list.filter((m) => !fresh.some((x) => x.id === m.id)), ...fresh].slice(-MAX_MEMORIES);
}

// ---------------------------------------------------------------- onNewDay

/** Apply one memory's pending effect. Returns the line its owner says about it. */
function applyEffect(s: GameStore, m: Memory): string {
  const e = m.effect!;
  const say = typeof e.say === 'string' ? e.say : m.text;
  switch (e.type) {
    case 'trust':
      s.trust(m.who, Number(e.delta ?? 0));
      break;
    case 'no-milk':
      s.trust(m.who, -1);
      s.toast('Reminder: if something is sold out, call home before giving up.', 'neutral');
      break;
    case 'milk-thanks':
      s.trust(m.who, 1);
      break;
    case 'pocket-cut': {
      const amount = Math.min(Number(e.amount ?? 0), s.state.wallet.balance);
      if (amount > 0 && s.pay(amount, 'Extras from the shopping money (as agreed)', false))
        s.toast(`Pocket money −${formatMoney(amount)}: the extras came from your share.`, 'neutral');
      break;
    }
    case 'bonus': {
      const amount = Number(e.amount ?? 0);
      if (amount > 0) {
        s.give(amount, 'Bonus for staying in budget');
        s.toast(`Bonus +${formatMoney(amount)} for returning the change!`, 'good');
      }
      s.trust(m.who, 1);
      break;
    }
    // 'reminder': words only
  }
  return say;
}

/** Called at the start of each new day (after pocket money). */
export function onNewDay(s: GameStore): void {
  const today = s.state.clock.day;
  const pending = memories(s).filter((m) => !m.used && m.day < today);
  if (!pending.length) return;
  // effects first, then good news, newest first
  const ranked = [...pending].sort(
    (a, b) => Number(!!b.effect) - Number(!!a.effect) || Number(isPositive(b)) - Number(isPositive(a)) || b.day - a.day,
  );
  const said: { m: Memory; text: string }[] = [];
  for (const m of ranked) {
    const text = m.effect ? applyEffect(s, m) : m.text;
    m.used = true;
    if (s.member(m.who)) said.push({ m, text });
  }
  if (!said.length) return;

  // max 3 lines: up to 2 remembered things + one closing lesson; keep at least one warm note
  let picks = said.slice(0, 2);
  if (!picks.some((p) => isPositive(p.m))) {
    const warm = said.find((p) => isPositive(p.m));
    if (warm) picks = [picks[0], warm];
  }
  const lines = picks.map(({ m, text }) => {
    const who = s.member(m.who)!;
    // the partner lives across town, so their memories arrive as phone texts
    return { speaker: who.role === 'partner' ? `📱 ${who.name}` : who.name, portrait: who.id, text };
  });
  const lead = picks.find((p) => !isPositive(p.m)) ?? picks[0];
  // closing life lesson comes from family; skip it when only the partner texted
  if (picks.every((p) => s.member(p.m.who)?.role === 'partner')) {
    s.say(lines.slice(0, 3));
    return;
  }
  const guide = s.memberByRole(...GUARDIAN_ROLES) ?? s.member(lead.m.who)!;
  const closing = isPositive(lead.m)
    ? words(`Keep it up, {endearment}. ${topicOf(lead.m).lesson}`)
    : words(`New day, fresh start, {endearment}. ${topicOf(lead.m).lesson}`);
  lines.push({ speaker: guide.name, portrait: guide.id, text: closing });
  s.say(lines.slice(0, 3));
}

// ---------------------------------------------------------------- memoryChat

const PARENT_ROLES: Role[] = ['mother', 'father', 'guardian'];

/** Is this the chat where `m` brings up a memory? Deterministic per day, member and half-hour. */
export function chatRoll(day: number, memberId: string, minutes: number): number {
  return hash(`${day}|${memberId}|${Math.floor(minutes / 30)}`) % 100;
}

function voice(m: FamilyMember, mem: Memory): string {
  const { topic, lesson } = topicOf(mem);
  const good = isPositive(mem);
  const own = mem.who === m.id;
  switch (m.role) {
    case 'partner':
      return good ? `${mem.text} …anyway hi 🙈` : mem.text;
    case 'grandparent':
      return words(
        good
          ? `${own ? 'I still smile when I think how' : 'I heard'} ${topic}, {endearment}. Kindness and care — that is a full life.`
          : `I heard ${topic}. When I was young I made the same slips, {endearment}. ${lesson}`,
      );
    case 'younger-sibling':
      if (own) return good ? `${mem.text} You’re the best!` : `${mem.text} …But I still like you.`;
      return good ? `Guess what — I heard ${topic}! You’re basically a superhero now.` : `Hehe, ${topic}! Don’t worry, I mess up way more than you.`;
    case 'older-sibling':
      return good
        ? `So apparently ${topic}. Okay, not bad — you’re making me look lazy.`
        : `Heard ${topic}. Been there. Pro tip: ${lesson.charAt(0).toLowerCase()}${lesson.slice(1)}`;
    default:
      // parents & guardians: warm but firm, using their own memory when it is theirs
      if (own) return good ? words(`${mem.text} {praise}`) : `${mem.text} ${lesson}`;
      return good ? words(`I heard ${topic}. {praise}`) : `I heard ${topic}. We all learn — ${lesson.charAt(0).toLowerCase()}${lesson.slice(1)}`;
  }
}

/** A line a family member says because they remember something. null = use normal chat. */
export function memoryChat(s: GameStore, m: FamilyMember): string | null {
  const list = s.state.memories;
  if (!list?.length || m.role === 'player') return null;
  const day = s.state.clock.day;
  const roll = chatRoll(day, m.id, s.state.clock.minutes);
  if (roll >= MEMORY_CHAT_CHANCE) return null;
  const recent = list.filter((x) => day - x.day <= 3 && day - x.day >= 0);
  // parents talk about their own memories first; siblings & grandparents talk about anything
  // the partner only brings up their own memories; family never brings up the partner's
  const pool =
    m.role === 'partner'
      ? recent.filter((x) => x.who === m.id)
      : PARENT_ROLES.includes(m.role) && recent.some((x) => x.who === m.id)
        ? recent.filter((x) => x.who === m.id)
        : recent.filter((x) => s.member(x.who)?.role !== 'partner');
  if (!pool.length) return null;
  // positive memories come up 3× as often as negative ones
  const weighted = pool.flatMap((x) => (isPositive(x) ? [x, x, x] : [x]));
  const pick = weighted[hash(`${day}|${m.id}|${roll}|pick`) % weighted.length];
  return voice(m, pick);
}

// ---------------------------------------------------------------- missionLock

function completedOnce(s: GameStore, ids: string[]): boolean {
  return ids.some((id) => s.state.world[doneKey(id)] === true || s.state.results.some((r) => r.missionId === id && r.outcome !== 'incomplete'));
}

function bestTrust(s: GameStore, roles: Role[]): number {
  return s.state.profile.members.filter((m) => roles.includes(m.role)).reduce((n, m) => Math.max(n, m.trust), 0);
}

/** Missions that unlock later, and what opens them. */
const GATES: Record<string, { needs: string[]; trust?: number; reason: (names: string) => string }> = {
  'bus-trip': { needs: ['grocery-run', 'clinic-visit'], trust: TRUST_UNLOCK, reason: (n) => `Earn a bit more trust first: complete ${n}.` },
  errands: { needs: ['grocery-run', 'clinic-visit'], trust: TRUST_UNLOCK, reason: (n) => `Earn a bit more trust first: complete ${n}.` },
  'cook-meal': { needs: ['clean-room', 'help-sibling'], reason: (n) => `Show you’re careful at home first (the stove comes after the basics): complete ${n}.` },
};

/** Reason a mission is still locked (e.g. needs more trust), or null when available. */
export function missionLock(s: GameStore, def: MissionDef): string | null {
  const gate = GATES[def.id];
  if (!gate) return null;
  if (completedOnce(s, gate.needs)) return null;
  if (gate.trust !== undefined && bestTrust(s, def.assignerRoles) >= gate.trust) return null;
  const playable = gate.needs
    .map((id) => getMission(id))
    .filter((m): m is MissionDef => !!m && (!m.available || m.available(s.state).ok));
  const names = (playable.length ? playable : gate.needs.map((id) => getMission(id)!).filter(Boolean)).map((m) => m.title);
  return gate.reason(names.join(' or '));
}
