// Scelta della sede: per poche sedi (≤ 5) un gruppo di pulsanti radio è più rapido di un menu a tendina.

export function LocationSelect({
  locations,
  name = "locationId",
  defaultValue,
  legend = "Sede",
}: {
  locations: { id: string; name: string }[];
  name?: string;
  defaultValue?: string;
  legend?: string;
}) {
  const selected = defaultValue ?? (locations.length === 1 ? locations[0]?.id : undefined);
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-semibold text-ink-soft">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {locations.map((location) => (
          <label
            key={location.id}
            className="flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-surface px-4 text-[15px] font-medium has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]"
          >
            <input type="radio" name={name} value={location.id} defaultChecked={location.id === selected} required className="sr-only" />
            {location.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
