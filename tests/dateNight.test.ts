import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameStore } from '../src/core/store';
import { onNewDay } from '../src/core/memory';
import { DEFAULT_PLAYER_LOOK, FAMILY_PRESETS, buildProfile } from '../src/domain/family';
import { setRegion } from '../src/domain/region';
import { scheduleFor } from '../src/domain/world';
import { DATE_AT, partnerMode } from '../src/missions/dateNight';
import { getMission } from '../src/missions/registry';
import { SOCIAL_CHALLENGES } from '../src/missions/socialChallenges';
import { byLabel, fakeRepo, idOf, newStore, settle } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  setRegion('in');
});
afterEach(() => vi.useRealTimers());

function withPartner(kind: 'girlfriend' | 'boyfriend' = 'girlfriend', preset = FAMILY_PRESETS[1]) {
  const s = new GameStore(fakeRepo());
  s.newGame(buildProfile('Test', DEFAULT_PLAYER_LOOK, preset, {}, kind));
  s.state.seed = 4242;
  return s;
}

const result = (s: GameStore) => {
  expect(s.ui.modal?.type).toBe('results');
  return s.state.results[0];
};

describe('partner setup', () => {
  it('family presets without a partner behave exactly as before', () => {
    for (const p of FAMILY_PRESETS) {
      const a = buildProfile('Test', DEFAULT_PLAYER_LOOK, p);
      const b = buildProfile('Test', DEFAULT_PLAYER_LOOK, p, {}, null);
      expect(b).toEqual(a);
      expect(a.members.map((m) => m.role)).toEqual(['player', ...p.roles]);
      expect(a.members.some((m) => m.role === 'partner')).toBe(false);
    }
  });

  it('adds a region-named partner who is never at home', () => {
    const g = buildProfile('Test', DEFAULT_PLAYER_LOOK, FAMILY_PRESETS[0], {}, 'girlfriend');
    const gp = g.members.find((m) => m.role === 'partner')!;
    expect(gp).toMatchObject({ id: 'partner-0', name: 'Ananya' });
    expect(gp.voice?.kind).toBe('female');
    const b = buildProfile('Test', DEFAULT_PLAYER_LOOK, FAMILY_PRESETS[0], { partner: 'Sam' }, 'boyfriend');
    const bp = b.members.find((m) => m.role === 'partner')!;
    expect(bp.name).toBe('Sam');
    expect(bp.voice?.kind).toBe('male');
    setRegion('uk');
    expect(buildProfile('T', DEFAULT_PLAYER_LOOK, FAMILY_PRESETS[0], {}, 'boyfriend').members.find((m) => m.role === 'partner')!.name).toBe('Harry');
    for (const t of [16 * 60 + 30, 19 * 60 + 10, 21 * 60]) expect(scheduleFor('partner', t).spot).toBe('away');
  });

  it('partners never hand out household tasks', () => {
    const s = withPartner();
    s.talkTo('partner-0');
    const text = settle(s, byLabel(/Can't today/)).join(' ');
    expect(text).not.toMatch(/help me with something/);
    expect(s.state.run).toBeNull();
  });
});

describe('Date on a Budget (date-night)', () => {
  it('is unavailable without a partner, and the phone still calls home', () => {
    const s = newStore();
    const entry = s.availableMissions().find((x) => x.def.id === 'date-night')!;
    expect(entry.avail.ok).toBe(false);
    expect(entry.avail.reason).toMatch(/girlfriend or boyfriend/);
    s.state.location = 'town';
    s.callHome();
    expect(s.ui.dialogue?.[0].text).toMatch(/Everything okay/);
  });

  it('the phone shows the invite and opens the briefing', () => {
    const s = withPartner();
    expect(s.availableMissions().find((x) => x.def.id === 'date-night')!.avail.ok).toBe(true);
    s.callHome();
    expect(s.ui.dialogue?.[0].text).toMatch(/new message from Ananya/);
    s.choose(0);
    expect(s.ui.modal).toMatchObject({ type: 'briefing', missionId: 'date-night', assignerId: 'partner-0' });
  });

  it('happy path: on time, peanut-free snacks, respects the curfew → completed + badge', () => {
    const s = withPartner();
    const mum = idOf(s, 'mother');
    const mumTrust = s.member(mum)!.trust;
    s.acceptMission('date-night', 'partner-0');
    expect(s.state.run!.deadlineAt).toBe(DATE_AT);
    const seen = settle(s, byLabel(/Sure! Park at 6:30|Doing it now|Clean jeans/));
    expect(seen.join(' ')).toMatch(/allergic to peanuts/);
    expect(s.isDone('text-back') && s.isDone('get-ready')).toBe(true);
    expect(s.member(mum)!.trust).toBeGreaterThan(mumTrust);

    s.travel('town');
    s.buyAtKiosk('popcorn');
    s.buyAtKiosk('juice-box');
    expect(s.isDone('buy-snacks')).toBe(true);

    // way too early: wait on the bench until 6:25
    expect(partnerMode(s)).toBe('hidden');
    s.interact('bench');
    const date = settle(s, byLabel(/Sit on the bench|science test|haven't seen it|Laugh it off|walk you to the bus/)).join(' ');
    expect(date).toMatch(/you remembered!!/);
    expect(s.isDone('meet') && s.isDone('see-off')).toBe(true);
    expect(partnerMode(s)).toBe('hidden'); // partner went home

    s.travel('home');
    settle(s, byLabel(/got home safe/));
    const r = result(s);
    expect(r.outcome).toBe('completed');
    expect(r.overall).toBeGreaterThanOrEqual(80);
    expect(r.badge).toBe('Smooth Operator');
    expect(r.budget).toBeNull();
    expect(r.feedback.join(' ')).toMatch(/remembered the peanut allergy/);
    expect(r.feedback.join(' ')).toMatch(/respecting their curfew/);
    expect(r.challenges).toEqual(expect.arrayContaining(['A quick favour first', 'Breaking the ice', 'Home by 7:15']));
  });

  it('cringe path: pickup line, peanut chocolate, late, "stay 10 more minutes" → completed-late with the right feedback', () => {
    const s = withPartner('boyfriend');
    s.acceptMission('date-night', 'partner-0');
    settle(s, byLabel(/u up\?|Ugh, why NOW|ballgown/));
    expect(s.state.run!.flags['reply']).toBe('uup');
    s.travel('town');
    s.buyAtKiosk('peanut-choc');
    s.state.clock.minutes = DATE_AT + 15; // dawdled
    expect(partnerMode(s)).toBe('date');
    s.interact('npc:partner-0');
    const seen = settle(s, byLabel(/traffic light|pick the peanuts|bus timetable|LOVE it|Blame the duck|10 more minutes/)).join(' ');
    expect(seen).toMatch(/not how allergies work/);
    expect(seen).toMatch(/When I say I have to go/);
    s.travel('home');
    settle(s, byLabel(/14 messages/));
    const r = result(s);
    expect(r.outcome).toBe('completed-late');
    expect(r.badge).toBeUndefined();
    const fb = r.feedback.join(' ');
    expect(fb).toMatch(/15 minutes late/);
    expect(fb).toMatch(/pickup line was… a choice/);
    expect(fb).toMatch(/allergic to peanuts/);
    expect(fb).toMatch(/"pick out"/);
    expect(fb).toMatch(/boundary/);
    expect(fb).toMatch(/Arguing about the chores/);
    expect(fb).toMatch(/a lot for a duck pond/);
    expect(r.scores.responsibility!).toBeLessThan(50);

    // the next morning: partner memories arrive as phone texts
    s.openModal(null);
    s.nextDay();
    const morning = settle(s).join(' ');
    expect(morning).toMatch(/haunts me|be cool with it/);
  });

  it('being stood up: the partner leaves after waiting and the date is incomplete', () => {
    const s = withPartner();
    s.acceptMission('date-night', 'partner-0');
    settle(s, byLabel(/Sure!|Doing it now|Clean jeans/));
    s.spendTime(DATE_AT + 45 - s.state.clock.minutes);
    expect(s.ui.dialogue?.[0].text).toMatch(/I waited at the bench/);
    settle(s, byLabel(/so sorry/));
    expect(result(s).outcome).toBe('incomplete');
  });

  it('every social challenge option explains its "what if"', () => {
    for (const ch of Object.values(SOCIAL_CHALLENGES)) for (const o of ch.options) expect(o.whatIf, `${ch.id}/${o.id}`).toBeTruthy();
    expect(getMission('date-night')!.objectives.every((o) => !o.required || o.id === 'text-back' || (o.where && (o.hint || o.id !== 'buy-snacks')))).toBe(true);
  });

  it('remembering the allergy and the curfew comes back as next-day texts', () => {
    const s = withPartner();
    s.acceptMission('date-night', 'partner-0');
    settle(s, byLabel(/Sure!|Doing it now|Clean jeans/));
    s.travel('town');
    s.buyAtKiosk('popcorn');
    s.state.clock.minutes = DATE_AT - 2;
    s.interact('bench');
    settle(s, byLabel(/science test|haven't seen it|Laugh it off|walk you to the bus/));
    s.travel('home');
    settle(s, byLabel(/got home safe/));
    const mems = s.state.memories!.filter((m) => m.who === 'partner-0').map((m) => m.id.split('@')[0]);
    expect(mems).toEqual(expect.arrayContaining(['date-allergy', 'date-curfew']));
    s.openModal(null);
    s.state.clock.day += 1;
    onNewDay(s);
    const lines = s.ui.dialogue!;
    expect(lines.some((l) => l.speaker === '📱 Ananya' && /remembered no peanuts|mum says hi/.test(l.text))).toBe(true);
  });
});
