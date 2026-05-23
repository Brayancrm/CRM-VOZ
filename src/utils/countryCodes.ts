export type CountryDial = {
  code: string;
  label: string;
};

export const COUNTRY_DIAL_CODES: CountryDial[] = [
  { code: '55', label: 'Brasil (+55)' },
  { code: '1', label: 'EUA / Canadá (+1)' },
  { code: '351', label: 'Portugal (+351)' },
  { code: '54', label: 'Argentina (+54)' },
  { code: '56', label: 'Chile (+56)' },
  { code: '57', label: 'Colômbia (+57)' },
  { code: '52', label: 'México (+52)' },
  { code: '34', label: 'Espanha (+34)' },
  { code: '39', label: 'Itália (+39)' },
  { code: '44', label: 'Reino Unido (+44)' },
  { code: '49', label: 'Alemanha (+49)' },
  { code: '33', label: 'França (+33)' },
];

export const DEFAULT_DIAL_CODE = '55';
