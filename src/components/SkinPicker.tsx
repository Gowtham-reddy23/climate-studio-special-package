import { useStore } from "../store";
import type { Skin } from "../types";

const SKINS: { id: Skin; label: string }[] = [
  { id: "dark", label: "Paper" },
  { id: "mat", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "glass", label: "Glass" },
];

export function SkinPicker() {
  const { state, dispatch } = useStore();
  return (
    <div className="skin-picker" role="group" aria-label="Skin">
      {SKINS.map((s) => (
        <button
          key={s.id}
          className={`skin-chip ${state.skin === s.id ? "is-on" : ""}`}
          aria-pressed={state.skin === s.id}
          onClick={() => dispatch({ type: "set-skin", skin: s.id })}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
