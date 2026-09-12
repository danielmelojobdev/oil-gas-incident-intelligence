import type { Glossary } from './types';

export const FR_GLOSSARY: Glossary = {
  language: 'fr',
  industryTerms: [
    'pétrole', 'petrole', 'gaz naturel', 'hydrocarbure', 'hydrocarbures', 'brut',
    'plateforme pétrolière', 'plate-forme pétrolière', 'plateforme de production',
    'appareil de forage', 'navire de forage', 'semi-submersible', 'fpso',
    'puits', 'puits de pétrole', 'tête de puits', 'sous-marin', 'offshore',
    'raffinerie', 'pétrochimie', 'usine de traitement de gaz',
    'gnl', 'terminal gnl', 'gazoduc', 'oléoduc', 'pipeline',
    'terminal pétrolier', 'dépôt pétrolier', 'amont', 'aval',
    'totalenergies', 'perenco', 'sonatrach', 'sonangol',
  ],
  eventTerms: [
    'accident', 'incident', 'événement', 'défaillance', 'panne', 'urgence', 'incendie',
    'explosion', 'fuite', 'déversement', 'rejet', 'arrêt', 'évacuation', 'évacués',
    'collision', 'naufrage', 'effondrement', 'rupture', 'mort', 'morts', 'décès',
    'blessés', 'disparus', 'enquête',
  ],
  strongPhrases: [
    'incendie sur une plateforme', 'explosion sur une plateforme', 'fuite de gaz',
    'fuite de pétrole', 'déversement de pétrole', 'perte de confinement',
    'contrôle de puits', 'perte de contrôle du puits', 'intégrité du puits',
    'défaillance de barrière', 'éruption de puits', 'défaillance du bop',
    'incendie de raffinerie', 'explosion de raffinerie', 'rupture de gazoduc',
    'rupture d\'oléoduc', 'arrêt d\'urgence', 'rejet d\'hydrocarbures',
  ],
  assetTerms: [
    'plateforme', 'plateforme offshore', 'appareil de forage', 'raffinerie',
    'gazoduc', 'oléoduc', 'terminal', 'usine de gaz', 'fpso',
  ],
  wellTerms: [
    'puits', 'contrôle de puits', 'intégrité de puits', 'barrière de puits', 'éruption',
    'bop', 'bloc obturateur de puits', 'arbre de noël', 'tête de puits', 'tubage',
    'cuvelage', 'cimentation', 'packer', 'annulaire', 'vanne de sécurité de subsurface',
    'intervention sur puits', 'reconditionnement', 'abandon de puits', 'complétion', 'forage',
  ],
  searchPhrases: [
    'accident plateforme pétrolière', 'incendie plateforme pétrolière',
    'explosion raffinerie', 'fuite de gaz raffinerie', 'déversement de pétrole',
    'rupture oléoduc', 'rupture gazoduc', 'contrôle de puits incident',
    'éruption de puits', 'évacuation plateforme pétrolière',
  ],
  exclusionTerms: [
    'mine de charbon', 'exploitation minière', 'accident d\'avion', 'accident de la route',
    'accident ferroviaire', 'incendie résidentiel', 'ferme solaire', 'parc éolien',
    'centrale nucléaire', 'industrie pharmaceutique', 'bourse', 'résultats trimestriels',
  ],
};
