// Genera N libri finti (con accenti) in SQL, per misurare ricerca e catalogo su D1.
//   node scripts/seed.mjs 5000 > .wrangler/seed.sql
const count = Number(process.argv[2] ?? 5000);
const ROWS_PER_INSERT = 100;

const words = ["perché", "città", "libertà", "giù", "caffè", "notte", "mare", "storia", "giardino", "ombra", "viaggio", "memoria", "silenzio", "estate", "lettere", "fiume", "casa", "tempo", "sogno", "verità"];
const names = ["Italo Calvino", "Elsa Morante", "Natalia Ginzburg", "Umberto Eco", "Primo Levi", "Grazia Deledda", "Cesare Pavese", "Dacia Maraini", "Alessandro Manzoni", "Niccolò Ammaniti"];

// Generatore deterministico: gli stessi dati a ogni esecuzione.
let state = 42;
const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (list) => list[Math.floor(random() * list.length)];
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

const rows = Array.from({ length: count }, (_, index) => {
  const title = `${pick(words)} ${pick(words)} ${pick(words)}`.replace(/^./, (first) => first.toUpperCase());
  const isbn13 = `979${String(index).padStart(10, "0")}`;
  return `(${quote(title)}, ${quote(pick(names))}, ${quote(isbn13)})`;
});

for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
  process.stdout.write(`INSERT INTO book (title, authors, isbn13) VALUES\n${rows.slice(start, start + ROWS_PER_INSERT).join(",\n")};\n`);
}
