# Letture, voti e generi (HOME LIBRARY v2)

## Problem
In famiglia (oggi 3 persone) «Letto da» dice solo *chi* ha letto un libro, non se gli è piaciuto né chi
lo sta leggendo adesso. Il catalogo si filtra solo per sede e testo: trovare il prossimo libro di casa
da leggere (per genere, o tra quelli non ancora letti) richiede di scorrere tutto. Senza queste
informazioni l'app resta un inventario e non aiuta a scegliere né a parlare dei libri.

## Evidence
- Richiesta diretta dell'admin (31/10/2026): pagina di statistiche di lettura di tutti gli utenti, voto dopo «Letto», genere e filtri nel catalogo, tasto «Sto leggendo».
- Prova del 31/10/2026 su 8 ISBN italiani: Google Books dà una categoria generica in inglese per 4 su 8 (`Fiction`, `Juvenile Fiction`); Open Library etichette disordinate in inglese per 3 su 8. Il genere automatico può solo essere un suggerimento.
- Utilità per gli altri utenti: Assumption — needs validation via uso reale dell'app nel primo mese.

## Users
- **Primary**: i membri della famiglia con accesso all'app (admin, editor, lettori) quando finiscono o iniziano un libro, o cercano cosa leggere tra i libri di casa.
- **Not for**: persone esterne alla famiglia; nessuna funzione pubblica o social.

## Hypothesis
We believe **voti a stelline, «Sto leggendo», generi, filtri «da leggere» e una pagina di statistiche**
will **aiutare a scegliere il prossimo libro di casa e a parlarne** for **la famiglia**.
We'll know we're right when **dopo un mese la maggior parte delle letture segnate ha un voto e ogni
utente ha usato almeno una volta filtri o Statistiche**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Letture con voto | > 50% delle letture segnate dopo il rilascio | conteggio su D1 |
| Libri con genere | > 80% dei libri aggiunti dopo il rilascio | conteggio su D1 |
| Uso di filtri / Statistiche | ogni utente almeno una volta nel primo mese | TBD — needs validation via domanda diretta in famiglia (nessun tracciamento delle visite, per scelta) |
| CPU per richiesta | sotto i 10 ms a regime, come le altre pagine | misura con i log del Worker e controllo settimanale |

## Scope
**MVP**
- **Voto**: 1–5 stelline, facoltativo, compare solo dopo «Letto»; lo dà solo chi ha letto (anche se l'admin ha segnato «Letto» per lui); si toglie ritoccando la stessa stella; sparisce se si toglie «Letto». Visibile a tutti: media del libro e voto di ogni lettore nella scheda.
- **Sto leggendo**: tasto nella scheda del libro; si vede chi sta leggendo cosa. Segnare «Letto» toglie in automatico «Sto leggendo». Stesse regole di «Letto»: ognuno per sé, l'admin per chiunque. Non si può su un libro già letto. Si salva la data di inizio (non mostrata per ora).
- **Genere**: uno per libro, da un elenco fisso in italiano (circa 15 voci, da approvare). Suggerito in automatico dalla categoria di Google Books quando si aggiunge un libro, sempre confermabile o modificabile. Nella scheda del libro; modificabile dall'admin e dagli editor delle sedi in cui il libro ha una copia. Colonna nel CSV (export e import).
- **Filtri del catalogo**: «Non letti da me», «Non letti da nessuno», «Genere», «In lettura», combinabili con sede e ricerca.
- **Statistiche**: pagina visibile a tutti, raggiunta da un pulsante in cima al Catalogo: classifica per persona (letti, % del catalogo), andamento per mese (12 mesi) e per anno, più apprezzati (almeno 2 voti), autori più letti, letture in comune, generi più letti, chi sta leggendo cosa; messaggi chiari per le sezioni vuote.
- **Data di lettura**: è il momento in cui si segna «Letto», in automatico.

**Out of scope**
- Commenti o recensioni scritte — non richiesti; il voto basta per ora.
- Più generi per libro, generi creati dagli utenti — complicano filtri e statistiche.
- Data di lettura scelta a mano — scelta dell'utente: solo automatica.
- Prestiti, lista dei desideri, notifiche — idee per dopo.
- Assegnare il genere in automatico ai libri già presenti — qualità dei dati troppo bassa.
- Tracciamento delle visite o analytics — privacy, non serve.
- Riletture (più letture dello stesso libro) — escluse per scelta dell'admin.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Voto | Dopo «Letto» si danno 1–5 stelline; la scheda mostra media e voti | complete | .claude/plans/voto-stelline.plan.md |
| 2 | Sto leggendo | Tasto nella scheda; si vede chi sta leggendo cosa; «Letto» lo chiude | complete | .claude/plans/sto-leggendo.plan.md |
| 3 | Genere | Genere suggerito, confermato e modificabile; filtro e colonna CSV | complete | .claude/plans/genere.plan.md |
| 4 | Filtri di lettura | «Non letti da me», «Non letti da nessuno», «In lettura» nel catalogo | in-progress | .claude/plans/filtri-lettura.plan.md |
| 5 | Statistiche | Pagina per tutta la famiglia con classifiche, andamento, voti, generi | pending | — |

Ogni tappa si pubblica e si prova online prima della successiva, con uno stop ⏸ e l'OK dell'admin.

## Open Questions
- [x] Elenco dei generi (22 voci) e corrispondenza con le categorie di Google Books: approvati il 02/11/2026.
- [ ] Le letture segnate prima del rilascio hanno come data il giorno in cui sono state segnate: l'andamento parte sbilanciato su ottobre 2026. Accettato (31/10/2026), da ricordare nella pagina.
- [x] «Sto leggendo» su un libro già letto: **non permesso** (decisione del 31/10/2026, niente riletture).
- [x] «Sto leggendo» dimenticato: **nessun avviso e nessun «da quando» mostrato**, ma la data di inizio si salva per usi futuri (31/10/2026).

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Le statistiche superano i 10 ms di CPU | Bassa | Media | Pochi conteggi aggregati in una richiesta; misura prima del rilascio; dati piccoli (famiglia) |
| Suggerimento del genere sbagliato | Alta | Bassa | Sempre confermabile; mai assegnato senza conferma |
| Voti visibili a tutti creano imbarazzo | Bassa | Bassa | Voto facoltativo; scelta esplicita dell'admin (visibili a tutti) |
| Barra di navigazione affollata | Media | Bassa | Statistiche da un pulsante nel Catalogo, non una nuova voce nella barra |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
