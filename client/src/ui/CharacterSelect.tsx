import { useState, type CSSProperties } from "react";
import { CHARACTERS } from "@party-royale/shared";
import { setSelectedCharacter } from "../game/selection";
import { CharacterPreview } from "./CharacterPreview";

/** Character-select screen: pick one of the Adventurers, then find a match. */
export function CharacterSelect({
  onConfirm,
  onBack,
}: {
  onConfirm: () => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState(CHARACTERS[0]!.id);

  const confirm = () => {
    setSelectedCharacter(selected);
    onConfirm();
  };

  return (
    <div className="screen select-screen">
      <h2 className="screen-title">Choose your character</h2>

      <div className="select-stage">
        <CharacterPreview characterId={selected} />
      </div>

      <div className="char-row">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            className={`char-card${c.id === selected ? " active" : ""}`}
            style={{ "--accent": `#${c.accent.toString(16).padStart(6, "0")}` } as CSSProperties}
            onClick={() => setSelected(c.id)}
          >
            <span className="char-swatch" />
            {c.name}
          </button>
        ))}
      </div>

      <div className="screen-actions">
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button className="btn-primary" onClick={confirm}>
          Find match
        </button>
      </div>
    </div>
  );
}
