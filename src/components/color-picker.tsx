import { LOCATION_COLORS, type LocationColorKey } from "../../shared/location-colors";

// Scelta del colore di una sede: campioni tondi (radio). I colori già usati da altre sedi sono disattivati.

interface ColorPickerProps {
  /** colore → nome della sede che lo usa */
  usedBy: Partial<Record<LocationColorKey, string>>;
  defaultValue: LocationColorKey | null;
  name?: string;
  idPrefix: string;
}

export function ColorPicker({ usedBy, defaultValue, name = "color", idPrefix }: ColorPickerProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold text-ink-soft">Colore</legend>
      <div className="flex flex-wrap gap-2.5">
        {LOCATION_COLORS.map((color) => {
          const owner = usedBy[color.key];
          const isTaken = Boolean(owner) && color.key !== defaultValue;
          const id = `${idPrefix}-${color.key}`;
          return (
            <div key={color.key}>
              <input
                type="radio"
                id={id}
                name={name}
                value={color.key}
                defaultChecked={color.key === defaultValue}
                disabled={isTaken}
                required
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                title={isTaken ? `${color.label}: già usato da ${owner}` : color.label}
                className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full ${color.className} ring-offset-2 ring-offset-surface peer-checked:ring-3 peer-checked:ring-ink peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-[var(--focus)] peer-disabled:cursor-not-allowed peer-disabled:opacity-25`}
              >
                <span className="sr-only">
                  {color.label}
                  {isTaken && `, già usato da ${owner}`}
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
