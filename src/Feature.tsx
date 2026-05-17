import { useEffect, useRef } from "react";
import {
  ArmGate,
  useConfetti,
  useEventLog,
  useFairRng,
  useNamedPeer,
  useShake,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Shape = "d6" | "d20" | "3d6";
type Roll = {
  id: string;
  peerId: string;
  shape: Shape;
  values: number[];
  total: number;
  ts: number;
  round: number;
};

const SHAPES: Shape[] = ["d6", "d20", "3d6"];

function rollFor(shape: Shape, seed: number, round: number): number[] {
  let s = (Math.floor(seed * 0xffffffff) ^ round) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const [n, sides] = shape === "d6" ? [1, 6] : shape === "d20" ? [1, 20] : [3, 6];
  return Array.from({ length: n }, () => 1 + Math.floor(next() * sides));
}

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="dice-screen">
        <h1>shake dice</h1>
        <p className="dice-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName } = useNamedPeer(config, room);
  const fair = useFairRng(room, "dice-salts", { minContributors: 1 });
  const log = useEventLog<Roll>(room, "rolls");
  const { burst } = useConfetti();
  const stateMap = room.doc.getMap<number>("state");
  const shapeMap = room.doc.getMap<string>("dice-shape");
  const shape = (shapeMap.get("v") as Shape) ?? "d6";
  const lastPushedRound = useRef(0);

  const triggerRoll = () => {
    if (fair.seed === null) return;
    const cur = (stateMap.get("round") as number) ?? 0;
    const next = cur + 1;
    stateMap.set("round", next);
    const values = rollFor(shape, fair.seed, next);
    const total = values.reduce((a, b) => a + b, 0);
    const roll: Roll = {
      id: Math.random().toString(36).slice(2, 12),
      peerId: room.peerId,
      shape,
      values,
      total,
      ts: Date.now(),
      round: next,
    };
    lastPushedRound.current = next;
    log.push(roll);
    const max = shape === "d6" ? 6 : shape === "d20" ? 20 : 18;
    if (total === max) burst({ origin: "top", count: 80, hueRange: [30, 60] });
  };

  const triggerRef = useRef(triggerRoll);
  triggerRef.current = triggerRoll;
  const shakeArmed = useRef(false);
  const shakeState = useShake({ armed: shakeArmed.current, threshold: 14 });
  const lastShakes = useRef(0);
  useEffect(() => {
    if (shakeState.shakes > lastShakes.current) {
      lastShakes.current = shakeState.shakes;
      triggerRef.current();
    }
  }, [shakeState.shakes]);

  const latest = log.latest(1)[0];
  const history = log.latest(6).slice(latest ? 1 : 0, 6);

  return (
    <div className="dice-screen">
      <header className="dice-header">
        <h1>shake dice</h1>
        <p className="dice-status">
          round {(stateMap.get("round") as number) ?? 0} · {fair.contributors} salt(s)
        </p>
      </header>

      <input
        className="dice-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        maxLength={48}
        aria-label="your name"
      />

      <div className="dice-shapes" role="group" aria-label="dice shape">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            className={`dice-shape${shape === s ? " is-active" : ""}`}
            onClick={() => shapeMap.set("v", s)}
          >
            {s}
          </button>
        ))}
      </div>

      <ArmGate label="tap to enable shake">
        {() => {
          shakeArmed.current = true;
          return (
            <div className="dice-shake-area">
              <div className="dice-mag" aria-hidden="true">
                magnitude {shakeState.magnitude.toFixed(1)}
              </div>
              <button type="button" className="dice-roll" aria-label="ROLL" onClick={triggerRoll}>
                ROLL
              </button>
            </div>
          );
        }}
      </ArmGate>

      <div className="dice-result" aria-live="polite">
        {latest ? (
          <>
            <div className="dice-values">{latest.values.join(" · ")}</div>
            <div className="dice-total-label">
              total <span className="dice-total">{latest.total}</span>
            </div>
            <div className="dice-meta">
              {latest.shape} · round {latest.round}
            </div>
          </>
        ) : (
          <div className="dice-empty">no rolls yet — tap ROLL</div>
        )}
      </div>

      <ul className="dice-history">
        {history.map((r) => (
          <li key={r.id}>
            <span>{r.shape}</span>
            <span>{r.values.join("+")}</span>
            <span>= {r.total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
