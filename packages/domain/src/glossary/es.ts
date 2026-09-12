import type { Glossary } from './types';

export const ES_GLOSSARY: Glossary = {
  language: 'es',
  industryTerms: [
    'petróleo', 'petroleo', 'gas natural', 'hidrocarburo', 'hidrocarburos', 'crudo',
    'plataforma petrolera', 'plataforma petrolífera', 'plataforma de producción',
    'equipo de perforación', 'buque de perforación', 'semisumergible',
    'fpso', 'pozo', 'pozo petrolero', 'cabezal de pozo', 'submarino', 'lecho marino',
    'refinería', 'petroquímica', 'planta de procesamiento de gas',
    'gnl', 'terminal de gnl', 'gasoducto', 'oleoducto', 'poliducto',
    'terminal petrolero', 'tanque de almacenamiento', 'aguas arriba', 'aguas abajo',
    'pemex', 'ypf', 'ecopetrol', 'pdvsa', 'repsol', 'cnh', 'vaca muerta',
  ],
  eventTerms: [
    'accidente', 'incidente', 'suceso', 'falla', 'fallo', 'emergencia', 'incendio',
    'explosión', 'fuga', 'derrame', 'escape', 'liberación', 'paro', 'paralización',
    'evacuación', 'evacuados', 'colisión', 'hundimiento', 'colapso', 'ruptura',
    'rotura', 'muerte', 'muertos', 'fallecidos', 'heridos', 'desaparecidos',
    'investigación', 'clausura',
  ],
  strongPhrases: [
    'incendio en plataforma', 'explosión en plataforma', 'fuga de gas', 'fuga de petróleo',
    'derrame de petróleo', 'pérdida de contención', 'control de pozo',
    'pérdida de control del pozo', 'integridad del pozo', 'falla de barrera',
    'reventón de pozo', 'falla del bop', 'incendio en refinería',
    'explosión en refinería', 'ruptura de gasoducto', 'ruptura de oleoducto',
    'paro de emergencia', 'liberación de hidrocarburos',
  ],
  assetTerms: [
    'plataforma', 'plataforma marina', 'equipo de perforación', 'refinería',
    'gasoducto', 'oleoducto', 'terminal', 'planta de gas', 'fpso',
  ],
  wellTerms: [
    'pozo', 'control de pozo', 'integridad de pozo', 'barrera de pozo', 'reventón',
    'bop', 'preventor de reventones', 'árbol de navidad', 'cabezal de pozo',
    'tubería de producción', 'revestimiento', 'cementación', 'empacador', 'anular',
    'válvula de seguridad subsuperficial', 'intervención de pozo', 'reacondicionamiento',
    'taponamiento y abandono', 'terminación', 'perforación',
  ],
  searchPhrases: [
    'accidente plataforma petrolera', 'incendio plataforma petrolera',
    'explosión refinería', 'fuga de gas refinería', 'derrame de petróleo',
    'ruptura de oleoducto', 'ruptura de gasoducto', 'control de pozo incidente',
    'reventón de pozo', 'accidente refinería', 'evacuación plataforma',
  ],
  exclusionTerms: [
    'minería', 'mina de carbón', 'accidente aéreo', 'accidente de tránsito',
    'accidente ferroviario', 'incendio residencial', 'planta solar', 'parque eólico',
    'central nuclear', 'industria farmacéutica', 'bolsa de valores', 'acciones de',
  ],
};
