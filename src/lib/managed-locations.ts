// Sedi gestite da un editor, per il Profilo: solo quelle attive (in una sede archiviata non si aggiunge più).

export function managedLocationNames(locations: ReadonlyArray<{ id: string; name: string; archived: boolean }>, editorLocationIds: readonly string[]): string[] {
  return locations.filter((location) => !location.archived && editorLocationIds.includes(location.id)).map((location) => location.name);
}
