import type { LandingCopy } from './types';

export const IT_COPY: LandingCopy = {
  meta: { title: 'Flowsolve | Bozze di preventivo supportate da evidenze', description: 'Trasforma richieste frammentate di ricambi auto in candidati documentati e in una bozza di preventivo verificata da una persona.', ogTitle: 'Pilota automotive Flowsolve', ogDescription: 'Da una richiesta confusa a una bozza di preventivo supportata da evidenze.' },
  accessibility: { skipToContent: 'Vai al contenuto', languageNavigation: 'Scegli la lingua', pageNavigation: 'Navigazione della pagina', externalDestination: 'Apre una destinazione esterna' },
  sectionLabels: { problem: 'Il problema', how: 'Il ciclo operativo', automotive: 'Pack di settore / 01', futurePacks: 'Ipotesi successive', trust: 'Confine decisionale', pilot: 'Solo su invito' },
  nav: { story: 'Flusso di risoluzione', howItWorks: 'Come funziona', automotive: 'Pilota automotive', trust: 'Affidabilità' },
  hero: { eyebrow: 'Pilota automotive · verifica umana', title: 'Da una richiesta confusa a una bozza di preventivo supportata da evidenze.', body: 'Flowsolve mantiene insieme messaggi, immagini, audio e identificativi frammentati, mostra ciò che manca e prepara candidati che un addetto deve verificare.' },
  story: { heading: 'Guarda la richiesta prendere forma', lead: 'Ogni fase conserva la propria fonte e rende visibile l’incertezza.', stageLabel: 'Fase di risoluzione', stages: {
    conversation: { eyebrow: '01 · Ricevi', title: 'Una richiesta, cinque frammenti', body: 'Messaggi, immagini, audio, targa e descrizione del ricambio restano collegati a un unico caso.', statusLabel: 'Fonte conservata', evidenceItems: ['Testo originale', 'Riferimenti agli allegati', 'Lingua rilevata'] },
    extraction: { eyebrow: '02 · Comprendi', title: 'I fatti espliciti diventano strutturati', body: 'Il pilota estrae identificativi, componente richiesto e quantità senza inventare valori assenti.', statusLabel: 'Suggerimento strutturato', evidenceItems: ['Targa o VIN fornito', 'Componente richiesto', 'Quantità'] },
    'missing-data': { eyebrow: '03 · Chiarisci', title: 'I dati mancanti restano mancanti', body: 'Conflitti e dettagli del veicolo assenti diventano domande, non risposte artificialmente sicure.', statusLabel: 'Verifica necessaria', evidenceItems: ['Versione sconosciuta', 'Identificativo in conflitto', 'Domanda suggerita'] },
    candidates: { eyebrow: '04 · Risolvi', title: 'Ogni candidato porta le sue evidenze', body: 'Dati di catalogo autorizzati e dati veicolo consentiti sostengono una rosa di candidati; l’identità del veicolo da sola non prova la compatibilità.', statusLabel: 'Evidenze allegate', evidenceItems: ['Fonte del catalogo', 'Motivo della corrispondenza', 'Limite noto'] },
    approval: { eyebrow: '05 · Decidi', title: 'La decisione resta a una persona', body: 'L’operatore approva, corregge o rifiuta il suggerimento. I casi incerti o critici per la sicurezza non saltano la verifica.', statusLabel: 'Decisione umana richiesta', evidenceItems: ['Confidenza in parole e numeri', 'Azione dell’operatore', 'Riferimento di audit'] },
    quotation: { eyebrow: '06 · Prepara', title: 'La decisione diventa una bozza', body: 'I fatti approvati generano un testo cliente localizzato e modificabile. Il pilota non invia messaggi e non effettua ordini.', statusLabel: 'Bozza—non inviata', evidenceItems: ['Prodotto approvato', 'Fonte dell’offerta', 'Bozza versionata'] },
  } },
  problem: { heading: 'Il lavoro costoso avviene tra il messaggio e il preventivo', body: 'Gli addetti ricopiano identificativi, cercano i dati mancanti e confrontano cataloghi prima di poter rispondere.', costs: ['Inserimenti ripetuti', 'Lenti cicli di chiarimento', 'Resi e rifatturazione per ricambi errati'] },
  howItWorks: { heading: 'Ricevi. Comprendi. Risolvi. Approva.', steps: [
    { id: 'receive', title: 'Tieni unita la richiesta', body: 'Conserva conversazione e allegati in un unico caso.' },
    { id: 'understand', title: 'Estrai solo ciò che esiste', body: 'Struttura identificativi, intento e quantità; segnala chiaramente le incognite.' },
    { id: 'resolve', title: 'Cerca con evidenze', body: 'Usa dati di catalogo autorizzati e arricchimenti veicolo attribuiti.' },
    { id: 'approve', title: 'Lascia decidere l’operatore', body: 'Approva, correggi o rifiuta prima che esista una bozza.' },
  ] },
  packs: { heading: 'Un nucleo riutilizzabile, a partire da un solo pack mirato', automotive: { status: 'Pilota automotive', title: 'Banchi ricambi automotive', body: 'Replay storico di richieste italiane e olandesi, con arricchimento RDW/vPIC quando idoneo e dati di catalogo autorizzati per i ricambi candidati.' }, futureHeading: 'Possibili pack successivi', underEvaluation: 'In fase di valutazione', future: [
    { id: 'hvac', title: 'Ricambi caldaie e HVAC', body: 'Richiede una validazione separata di flusso, accesso ai cataloghi e acquirenti.' },
    { id: 'plumbing', title: 'Ricambi idraulici', body: 'Richiede una validazione separata di flusso, accesso ai cataloghi e acquirenti.' },
    { id: 'electrical', title: 'Materiale elettrico', body: 'Richiede una validazione separata di flusso, accesso ai cataloghi e acquirenti.' },
  ] },
  trust: { heading: 'Prima le evidenze. Controllo umano.', body: 'Flowsolve è un livello di verifica, non un catalogo sostitutivo né un agente di vendita autonomo.', principles: ['La fonte originale viene conservata', 'I fatti esterni mostrano fonte e limiti', 'I valori sconosciuti restano tali', 'In modalità replay non vengono inviati preventivi né effettuati ordini'] },
  pilot: { heading: 'Valutalo sulle tue richieste storiche', body: 'Il primo pilota è su invito ed è pensato per distributori tecnici con casi anonimizzati e utilizzabili lecitamente e un catalogo di evidenze autorizzato.', requestLabel: 'Richiedi un pilota', signInLabel: 'Accedi al pilota', previewRequestLabel: 'Richieste pilota: prossimamente', previewSignInLabel: 'Accesso al pilota: prossimamente' },
  quoteExample: { illustrativeLabel: 'Bozza di preventivo illustrativa', evidenceLabel: 'Evidenze allegate', reviewRequiredLabel: 'Approvazione umana richiesta', taxLabel: 'IVA inclusa', amountMinor: 129900 },
  footer: { summary: 'Flowsolve prepara bozze di preventivo documentate per la verifica umana.', previewNotice: 'Anteprima temporanea del prodotto. Questo sito non elabora transazioni.' },
};
