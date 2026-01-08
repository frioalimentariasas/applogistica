
import { eachDayOfInterval, addDays, nextSunday } from 'date-fns';

// Función para obtener el siguiente domingo a partir de una fecha
const getNextSunday = (date: Date): Date => {
  return nextSunday(date);
};

// Festivos de base fija (DD-MM)
const fixedHolidays = [
  '01-01', // Año Nuevo
  '01-05', // Día del Trabajo
  '20-07', // Día de la Independencia
  '07-08', // Batalla de Boyacá
  '08-12', // Día de la Inmaculada Concepción
  '25-12', // Navidad
];

// Festivos que dependen de la Pascua (días después del Domingo de Pascua)
const pascuaHolidaysOffsets = {
  juevesSanto: -3,
  viernesSanto: -2,
  ascension: 39,
  corpusChristi: 60,
  sagradoCorazon: 68,
};

// Festivos que se mueven al siguiente lunes (DD-MM)
const movableHolidays = {
  reyesMagos: '06-01',
  sanJose: '19-03',
  sanPedroSanPablo: '29-06',
  asuncionVirgen: '15-08',
  diaRaza: '12-10',
  todosSantos: '01-11',
  independenciaCartagena: '11-11',
};

// Cálculo de la fecha del Domingo de Pascua para un año dado (algoritmo de Butcher)
const getEasterSunday = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  // Los meses en Date son 0-indexados
  return new Date(year, month - 1, day);
};

// Genera todos los festivos para un año dado
const getHolidaysForYear = (year: number): Date[] => {
  const holidays = new Set<string>();

  // 1. Festivos fijos
  fixedHolidays.forEach(holiday => {
    const [day, month] = holiday.split('-').map(Number);
    holidays.add(new Date(year, month - 1, day).toISOString());
  });

  // 2. Festivos basados en Pascua
  const easterSunday = getEasterSunday(year);
  Object.values(pascuaHolidaysOffsets).forEach(offset => {
    const holidayDate = addDays(easterSunday, offset);
    if (offset > 0) { // Ascensión, Corpus, Sagrado Corazón se mueven al lunes
      holidays.add(getNextSunday(addDays(holidayDate, -1)).toISOString()); // -1 para asegurar que si cae domingo se mueva al lunes
    } else { // Jueves y Viernes Santo no se mueven
      holidays.add(holidayDate.toISOString());
    }
  });

  // 3. Festivos que se mueven al lunes
  Object.values(movableHolidays).forEach(holiday => {
    const [day, month] = holiday.split('-').map(Number);
    const holidayDate = new Date(year, month - 1, day);
    holidays.add(getNextSunday(addDays(holidayDate, -1)).toISOString()); // -1 para asegurar que si cae domingo se mueva al lunes
  });

  return Array.from(holidays).map(dateStr => new Date(dateStr));
};

// Genera festivos para el año actual y el siguiente
const currentYear = new Date().getFullYear();
export const colombianHolidays: Date[] = [
  ...getHolidaysForYear(currentYear - 1),
  ...getHolidaysForYear(currentYear),
  ...getHolidaysForYear(currentYear + 1),
  ...getHolidaysForYear(currentYear + 2), // Add an extra year for good measure
];
