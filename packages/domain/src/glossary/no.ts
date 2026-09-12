import type { Glossary } from './types';

export const NO_GLOSSARY: Glossary = {
  language: 'no',
  industryTerms: [
    'olje', 'gass', 'petroleum', 'hydrokarbon', 'hydrokarboner', 'råolje',
    'oljeplattform', 'plattform', 'produksjonsplattform', 'boreplattform',
    'borerigg', 'boreskip', 'halvt nedsenkbar', 'jack-up', 'fpso', 'fso',
    'brønn', 'oljebrønn', 'brønnhode', 'undervanns', 'havbunn', 'sokkel',
    'norsk sokkel', 'nordsjøen', 'norskehavet', 'barentshavet',
    'raffineri', 'petrokjemisk', 'gassprosesseringsanlegg', 'prosessanlegg',
    'lng', 'lng-anlegg', 'gassrørledning', 'oljerørledning', 'rørledning',
    'oljeterminal', 'gassterminal', 'landanlegg',
    'equinor', 'aker bp', 'vår energi', 'havtil', 'petroleumstilsynet',
    'oljedirektoratet', 'sokkeldirektoratet', 'conocophillips norge', 'okea',
  ],
  eventTerms: [
    'ulykke', 'hendelse', 'uhell', 'svikt', 'feil', 'nødsituasjon', 'brann',
    'eksplosjon', 'lekkasje', 'utslipp', 'utblåsning', 'nedstengning', 'stans',
    'evakuering', 'evakuert', 'kollisjon', 'forlis', 'kollaps', 'brudd',
    'dødsfall', 'omkommet', 'skadet', 'savnet', 'gransking', 'granskning', 'tilsyn',
    'pålegg', 'avvik', 'varsel om pålegg',
  ],
  strongPhrases: [
    'brann på plattform', 'eksplosjon på plattform', 'gasslekkasje', 'oljelekkasje',
    'hydrokarbonlekkasje', 'tap av barriere', 'brønnkontroll', 'tap av brønnkontroll',
    'brønnintegritet', 'barrieresvikt', 'utblåsning', 'bop-svikt',
    'raffineribrann', 'rørledningsbrudd', 'nødavstenging', 'oljeutslipp',
    'alvorlig hendelse', 'storulykke', 'storulykkesrisiko',
  ],
  assetTerms: [
    'plattform', 'oljeplattform', 'borerigg', 'boreskip', 'fpso', 'raffineri',
    'rørledning', 'terminal', 'gassanlegg', 'undervannsanlegg', 'landanlegg',
  ],
  wellTerms: [
    'brønn', 'brønnkontroll', 'brønnintegritet', 'brønnbarriere', 'utblåsning',
    'bop', 'utblåsningssikring', 'ventiltre', 'juletre', 'brønnhode', 'produksjonsrør',
    'foringsrør', 'sementering', 'pakning', 'annulus', 'nedihulls sikkerhetsventil',
    'brønnintervensjon', 'overhaling', 'permanent plugging', 'komplettering', 'boring',
  ],
  searchPhrases: [
    'ulykke oljeplattform', 'brann oljeplattform', 'eksplosjon plattform',
    'gasslekkasje plattform', 'hydrokarbonlekkasje sokkel', 'brønnkontroll hendelse',
    'brønnintegritet svikt', 'utblåsning brønn', 'raffineri brann',
    'rørledningsbrudd gass', 'oljeutslipp nordsjøen', 'evakuering plattform',
  ],
  exclusionTerms: [
    'kullgruve', 'gruvedrift', 'flyulykke', 'trafikkulykke', 'togulykke',
    'boligbrann', 'solkraftverk', 'vindpark', 'vindmølle', 'atomkraftverk',
    'farmasøytisk', 'børs', 'kvartalsresultat',
  ],
};
