import { useStore } from "../store";
import type { Skin } from "../types";

const SKINS: { id: Skin; label: string }[] = [
  { id: "glass", label: "Glass" },
  { id: "dark", label: "Paper" },
  { id: "light", label: "Light" },
  { id: "mat", label: "Mat" },
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
