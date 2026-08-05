import type { LandingCopy } from './types';

export const NL_COPY: LandingCopy = {
  meta: { title: 'Flowsolve | Onderbouwde offerteconcepten', description: 'Zet versnipperde aanvragen voor auto-onderdelen om in onderbouwde kandidaten en een door een medewerker beoordeeld offerteconcept.', ogTitle: 'Flowsolve automotive pilot', ogDescription: 'Van een rommelige aanvraag naar een offerteconcept met onderbouwing.' },
  accessibility: { skipToContent: 'Ga naar de inhoud', languageNavigation: 'Kies een taal', pageNavigation: 'Paginanavigatie', externalDestination: 'Opent een externe bestemming' },
  sectionLabels: { problem: 'Het probleem', how: 'De werkwijze', automotive: 'Branchepakket / 01', futurePacks: 'Volgende hypotheses', trust: 'Beslissingsgrens', pilot: 'Alleen op uitnodiging' },
  nav: { story: 'Oplossingsverhaal', howItWorks: 'Zo werkt het', automotive: 'Automotive pilot', trust: 'Vertrouwen' },
  hero: { eyebrow: 'Automotive pilot · menselijke controle', title: 'Van een rommelige aanvraag naar een offerteconcept met onderbouwing.', body: 'Flowsolve houdt losse berichten, afbeeldingen, audio en identificatiegegevens bij elkaar, maakt ontbrekende informatie zichtbaar en bereidt kandidaten voor die een medewerker beoordeelt.' },
  story: { heading: 'Zie hoe de aanvraag wordt opgelost', lead: 'Elke stap bewaart de bron en houdt onzekerheid zichtbaar.', stageLabel: 'Oplossingsstap', stages: {
    conversation: { eyebrow: '01 · Ontvang', title: 'Eén aanvraag, vijf fragmenten', body: 'Berichten, afbeeldingen, audio, kenteken en onderdeelomschrijving blijven aan één dossier gekoppeld.', statusLabel: 'Bron bewaard', evidenceItems: ['Oorspronkelijke tekst', 'Bijlageverwijzingen', 'Gedetecteerde taal'] },
    extraction: { eyebrow: '02 · Begrijp', title: 'Expliciete feiten worden gestructureerd', body: 'De pilot haalt identificatiegegevens, het gevraagde onderdeel en aantal op zonder ontbrekende waarden te verzinnen.', statusLabel: 'Gestructureerd voorstel', evidenceItems: ['Kenteken of aangeleverde VIN', 'Gevraagd onderdeel', 'Aantal'] },
    'missing-data': { eyebrow: '03 · Verduidelijk', title: 'Ontbrekende gegevens blijven ontbreken', body: 'Conflicten en ontbrekende voertuigdetails worden vragen in plaats van schijnbaar zekere antwoorden.', statusLabel: 'Controle nodig', evidenceItems: ['Onbekende uitvoering', 'Tegenstrijdig identificatienummer', 'Voorgestelde vraag'] },
    candidates: { eyebrow: '04 · Los op', title: 'Kandidaten tonen hun onderbouwing', body: 'Geautoriseerde catalogusgegevens en toegestane voertuigdata ondersteunen een shortlist; voertuigidentiteit alleen bewijst nooit dat een onderdeel past.', statusLabel: 'Onderbouwing toegevoegd', evidenceItems: ['Catalogusbron', 'Reden voor overeenkomst', 'Bekende beperking'] },
    approval: { eyebrow: '05 · Beslis', title: 'Een mens houdt de controle', body: 'Een medewerker keurt het voorstel goed, corrigeert het of wijst het af. Onzekere en veiligheidskritische gevallen slaan de controle nooit over.', statusLabel: 'Menselijke beslissing vereist', evidenceItems: ['Zekerheid in tekst en cijfers', 'Actie van medewerker', 'Auditverwijzing'] },
    quotation: { eyebrow: '06 · Bereid voor', title: 'De beslissing wordt een offerteconcept', body: 'Goedgekeurde feiten leveren bewerkbare klanttekst in de juiste taal op. De pilot verstuurt niets en plaatst geen bestellingen.', statusLabel: 'Concept—niet verzonden', evidenceItems: ['Goedgekeurd product', 'Bron van aanbod', 'Versiebeheerd concept'] },
  } },
  problem: { heading: 'Het kostbare werk zit tussen bericht en offerte', body: 'Baliemedewerkers kopiëren identificatiegegevens, vragen ontbrekende details op en vergelijken catalogi voordat zij kunnen antwoorden.', costs: ['Herhaalde gegevensinvoer', 'Trage verduidelijkingsrondes', 'Retouren en herfacturering door verkeerde onderdelen'] },
  howItWorks: { heading: 'Ontvang. Begrijp. Los op. Keur goed.', steps: [
    { id: 'receive', title: 'Houd de aanvraag bij elkaar', body: 'Bewaar het gesprek en de bijlagen als één dossier.' },
    { id: 'understand', title: 'Haal alleen op wat er staat', body: 'Structureer identificatie, bedoeling en aantal; markeer onbekenden duidelijk.' },
    { id: 'resolve', title: 'Zoek met onderbouwing', body: 'Gebruik geautoriseerde catalogusdata en herleidbare voertuigverrijking.' },
    { id: 'approve', title: 'Laat de medewerker beslissen', body: 'Keur goed, corrigeer of wijs af voordat een offerteconcept ontstaat.' },
  ] },
  packs: { heading: 'Een herbruikbare oplossingskern, gestart met één gericht pakket', automotive: { status: 'Automotive pilot', title: 'Balies voor auto-onderdelen', body: 'Historische replay voor Nederlandse en Italiaanse aanvragen, met RDW/vPIC-verrijking waar toegestaan en geautoriseerde catalogusonderbouwing voor kandidaatonderdelen.' }, futureHeading: 'Mogelijke volgende pakketten', underEvaluation: 'In onderzoek', future: [
    { id: 'hvac', title: 'Cv- en HVAC-onderdelen', body: 'Vereist aparte validatie van workflow, catalogustoegang en koper.' },
    { id: 'plumbing', title: 'Loodgietersmaterialen', body: 'Vereist aparte validatie van workflow, catalogustoegang en koper.' },
    { id: 'electrical', title: 'Elektrotechnische onderdelen', body: 'Vereist aparte validatie van workflow, catalogustoegang en koper.' },
  ] },
  trust: { heading: 'Eerst onderbouwing. Menselijke controle.', body: 'Flowsolve is een beoordelingslaag, geen vervangende catalogus en geen autonome verkoopagent.', principles: ['De oorspronkelijke bron blijft bewaard', 'Externe feiten tonen bron en beperkingen', 'Onbekende waarden blijven onbekend', 'In replaymodus wordt niets verstuurd en geen bestelling geplaatst'] },
  pilot: { heading: 'Evalueer het met uw eigen historische aanvragen', body: 'De eerste pilot is alleen op uitnodiging en bedoeld voor technische distributeurs met rechtmatig bruikbare, geanonimiseerde dossiers en een geautoriseerde onderbouwingscatalogus.', requestLabel: 'Pilot aanvragen', signInLabel: 'Inloggen op pilot', previewRequestLabel: 'Pilot aanvragen: binnenkort', previewSignInLabel: 'Pilot-inlog: binnenkort' },
  quoteExample: { illustrativeLabel: 'Illustratief offerteconcept', evidenceLabel: 'Onderbouwing toegevoegd', reviewRequiredLabel: 'Menselijke goedkeuring vereist', taxLabel: 'Inclusief btw', amountMinor: 129900 },
  footer: { summary: 'Flowsolve bereidt onderbouwde offerteconcepten voor menselijke beoordeling voor.', previewNotice: 'Tijdelijke productpreview. Deze site verwerkt geen transacties.' },
};
