// "What your family remembers" — a compact list of the family's memories of the player's choices.
// Mount inside the journal (e.g. as its own tab or under the Skills tab).
import { useSnap } from './hooks';
import { Portrait } from './art';
import { isPositive } from '../core/memory';
import type { Memory } from '../domain/types';

const KIND_LABEL: Record<Memory['kind'], string> = {
  kind: 'Kind',
  responsible: 'Responsible',
  honest: 'Honest',
  thrifty: 'Thrifty',
  helpful: 'Helpful',
  brave: 'Brave',
  careless: 'Lesson',
  late: 'Lesson',
  wasteful: 'Lesson',
  forgetful: 'Lesson',
};

export default function MemoryPanel({ limit = 12 }: { limit?: number }) {
  const { state } = useSnap();
  const list = [...(state.memories ?? [])].reverse().slice(0, limit);
  const today = state.clock.day;
  const nameOf = (id: string) => state.profile.members.find((m) => m.id === id)?.name ?? 'Family';

  return (
    <div className="section">
      <h3>What your family remembers</h3>
      {!list.length ? (
        <p className="muted small">Nothing yet. Your choices on tasks — kind, careful or a bit messy — will be remembered here.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {list.map((m) => {
            const good = isPositive(m);
            const tone = good ? 'var(--mint)' : 'var(--orange)';
            return (
              <li
                key={m.id}
                className="boxed row"
                style={{ gap: 8, alignItems: 'flex-start', borderLeft: `4px solid ${tone}` }}
              >
                <Portrait id={m.who} size={32} alt={nameOf(m.who)} />
                <div className="grow">
                  <div className="small muted">
                    <b style={{ color: tone }}>{KIND_LABEL[m.kind]}</b> · {nameOf(m.who)} ·{' '}
                    {m.day === today ? 'today' : m.day === today - 1 ? 'yesterday' : `day ${m.day}`}
                  </div>
                  <div className="small">“{m.text}”</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
