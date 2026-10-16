import { getMission } from '../missions/registry';
// Game side of family multiplayer: starts a child's game from the shared family
// profile and keeps the child's device in sync with the parents —
// live status out; assignments & nudges in (all via src/services/family.ts).
import { store } from './store';
import { sfx } from './sfx';
import type { Assignment } from '../domain/types';
import { region } from '../domain/region';
import { calls, isVoice, voiceSeenAt } from './voiceMsg';
import {
  currentSession,
  fetchAssignments,
  fetchFamilyProfile,
  fetchMessages,
  loadMemberSave,
  pushStatus,
  sendMessage,
  subscribeFamily,
  updateAssignment,
  type FamilyMessage,
  type FamilySession,
  type LiveStatus,
} from '../services/family';

let stopSync: (() => void) | null = null;

/** Build the small status snapshot parents see on their dashboard. */
export function buildStatus(session: FamilySession, online = true): LiveStatus {
  const s = store.state;
  const def = store.mission;
  const run = s.run;
  const next = store.nextObjective?.() ?? null;
  const last = s.results[0];
  return {
    gameMemberId: session.gameMemberId,
    name: session.displayName,
    updatedAt: new Date().toISOString(),
    online,
    location: s.location,
    clock: { day: s.clock.day, minutes: Math.floor(s.clock.minutes) },
    wallet: s.wallet.balance,
    currency: region().currency.symbol,
    energy: Math.round(s.stats.energy),
    mission:
      run && def
        ? {
            id: def.id,
            title: def.title,
            icon: def.icon,
            objectivesDone: def.objectives.filter((o) => run.objectives[o.id]?.done).length,
            objectivesTotal: def.objectives.length,
            nextObjective: next ? next.label : null,
            timeLeft: store.timeLeft(),
            budget: run.budget,
            spent: run.spent,
          }
        : null,
    lastResult: last ? { title: last.title, outcome: last.outcome, overall: last.overall, day: last.day, feedback: last.feedback[0] ?? '' } : null,
    reflections: (s.reflections ?? []).slice(0, 3),
    skills: { ...s.stats.skills },
    xp: s.stats.xp,
  };
}

/** Child device: load (or create) this child's own game from the family profile, then start syncing. */
export async function startChildGame(session: FamilySession): Promise<void> {
  const saved = await loadMemberSave().catch(() => null);
  if (saved) {
    // reuse the normal continue path so settings/region are applied
    store.state = saved;
    await store.continueGame().catch(() => false);
    if (store.ui.screen !== 'game') {
      store.state = saved;
      store.goToScreen('game');
    }
  } else {
    const fam = await fetchFamilyProfile();
    if (!fam) throw new Error('Could not load your family. Check your connection and try again.');
    // this device plays the child: make sure the player character carries the child's name
    const profile = {
      ...fam.profile,
      playerName: session.displayName,
      members: fam.profile.members.map((m) => (m.role === 'player' ? { ...m, name: session.displayName } : m)),
    };
    store.newGame(profile, fam.settings);
  }
  startFamilySync();
}

function receiveAssignment(a: Assignment & { toGameMemberId: string }) {
  const session = currentSession();
  if (!session || a.toGameMemberId !== session.gameMemberId) return;
  if (store.state.assignments.some((x) => x.id === a.id)) return;
  if (a.status !== 'assigned') return;
  // on the child's device the child is always the game's 'player'
  store.state.assignments = [{ ...a, assignedTo: 'player' }, ...store.state.assignments];
  const from = store.member(a.assignedBy);
  const title = getMission(a.missionId)?.title ?? a.missionId;
  sfx.play('alert');
  store.toast(`📱 ${from?.name ?? 'Your parent'} assigned you: ${title}${a.budget ? ` · ${store.formatMoney(a.budget)}` : ''}. Talk to them to start!`, 'good');
  store.notify();
  void store.save('Task received');
}

function receiveMessage(m: FamilyMessage) {
  const session = currentSession();
  if (!session || m.fromGameMemberId === session.gameMemberId) return;
  if (m.toGameMemberId && m.toGameMemberId !== session.gameMemberId) return;
  // voice messages ring the in-game phone (src/ui/PhoneCall.tsx) instead of showing a text line
  if (isVoice(m)) {
    calls.incoming(m);
    return;
  }
  sfx.play('blip');
  const from = store.member(m.fromGameMemberId);
  if (!store.ui.dialogue && !store.ui.modal && store.ui.screen === 'game') {
    store.say([{ speaker: `📱 ${m.fromName}`, portrait: from?.id, text: m.text }]);
  } else {
    store.toast(`📱 ${m.fromName}: ${m.text}`, 'info');
  }
}

/** Start pushing status + listening for assignments/messages (child devices only). Safe to call twice. */
export function startFamilySync(): void {
  const session = currentSession();
  if (!session || session.kind !== 'child') return;
  stopSync?.();

  let lastPush = 0;
  let lastKey = '';
  const push = (force = false) => {
    const st = buildStatus(session, !document.hidden);
    const key = JSON.stringify([st.location, st.mission?.objectivesDone, st.mission?.id, st.lastResult?.title, Math.floor(st.wallet), st.reflections.length]);
    const now = Date.now();
    if (!force && key === lastKey && now - lastPush < 10_000) return;
    lastKey = key;
    lastPush = now;
    void pushStatus(st).catch(() => {});
  };

  // assignment status → back to the parent when a linked mission ends
  const reported = new Set<string>();
  const unsubStore = store.subscribe(() => {
    if (store.ui.screen !== 'game') return;
    push();
    for (const a of store.state.assignments) {
      if ((a.status === 'completed' || a.status === 'incomplete' || a.status === 'in-progress') && !reported.has(a.id + a.status)) {
        reported.add(a.id + a.status);
        void updateAssignment(a.id, { status: a.status, resultId: a.resultId }).catch(() => {});
        if (a.status !== 'in-progress') push(true);
      }
    }
  });
  const timer = window.setInterval(() => push(true), 15_000);
  const onVis = () => push(true);
  document.addEventListener('visibilitychange', onVis);
  const unsubFamily = subscribeFamily({ onAssignment: receiveAssignment, onMessage: receiveMessage });

  // reports for whoever gave the task: live events (e.g. a bargain) + a summary when a task ends
  const unsubReport = store.bus.on('report', (r) => {
    const to = r.toMemberId ?? store.state.run?.assignerId ?? null;
    void sendMessage(to, `📋 ${r.text}`).catch(() => {});
  });
  let lastResultId = store.state.results[0]?.id ?? '';
  const unsubResults = store.subscribe(() => {
    const r = store.state.results[0];
    if (!r || r.id === lastResultId) return;
    lastResultId = r.id;
    const asg = store.state.assignments.find((a) => a.resultId === r.id);
    const outcome = r.outcome === 'completed' ? 'done ✅' : r.outcome === 'completed-late' ? 'done, a bit late ⏰' : 'not finished ❌';
    const money = r.budget != null ? ` Spent ${store.formatMoney(r.moneySpent)} of ${store.formatMoney(r.budget)}.` : '';
    void sendMessage(asg?.assignedBy ?? null, `📋 ${r.title}: ${outcome} · score ${r.overall}/100.${money} ${r.feedback[0] ?? ''}`.trim()).catch(() => {});
  });

  // tasks assigned while this device was offline
  void fetchAssignments()
    .then((list) => list.forEach(receiveAssignment))
    .catch(() => {});
  // voice notes sent while this device was offline → phone inbox (new ones count as missed calls)
  void fetchMessages(50)
    .then((list) => {
      const seen = voiceSeenAt(session.memberId);
      const mine = list.filter((m) => isVoice(m) && m.fromGameMemberId !== session.gameMemberId && (!m.toGameMemberId || m.toGameMemberId === session.gameMemberId));
      calls.backfill(mine, (m) => Date.parse(m.createdAt) > seen);
    })
    .catch(() => {});
  push(true);

  stopSync = () => {
    unsubStore();
    unsubFamily();
    unsubReport();
    unsubResults();
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    void pushStatus(buildStatus(session, false)).catch(() => {});
    stopSync = null;
  };
}

export function stopFamilySync(): void {
  stopSync?.();
}
