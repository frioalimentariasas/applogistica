
import { eachDayOfInterval, addDays, nextMonday, getDay, isSameDay } from 'date-fns';

// Festivos de base fija (DD-MM) que no se mueven
const fixedHolidays = [
  '01-01', // Año Nuevo
  '01-05', // Día del Trabajo
  '20-07', // Día de la Independencia
  '07-08', // Batalla de Boyacá
  '08-12', // Día de la Inmaculada Concepción
  '25-12', // Navidad
];

// Festivos que dependen de la Pascua
const pascuaHolidaysOffsets = {
  juevesSanto: -3,
  viernesSanto: -2,
  ascension: 39,       // Se mueve al siguiente lunes
  corpusChristi: 60,   // Se mueve al siguiente lunes
  sagradoCorazon: 68,  // Se mueve al siguiente lunes
};

// Festivos que se mueven al siguiente lunes si no caen en lunes (Ley Emiliani)
const movableHolidaysDates = [
  '06-01', // Reyes Magos
  '19-03', // San José
  '29-06', // San Pedro y San Pablo
  '15-08', // Asunción de la Virgen
  '12-10', // Día de la Raza
  '01-11', // Todos los Santos
  '11-11', // Independencia de Cartagena
];

// Función para mover una fecha al siguiente lunes si no es lunes
const moveToNextMonday = (date: Date): Date => {
  const dayOfWeek = getDay(date); // 0=Domingo, 1=Lunes, ..., 6=Sábado
  if (dayOfWeek === 1) { // Si ya es lunes, no se mueve
    return date;
  }
  return nextMonday(date);
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
  return new Date(Date.UTC(year, month - 1, day));
};

// Genera todos los festivos para un año dado
const getHolidaysForYear = (year: number): Date[] => {
  const holidays = new Set<string>();

  // 1. Festivos fijos (no se mueven)
  fixedHolidays.forEach(holiday => {
    const [day, month] = holiday.split('-').map(Number);
    holidays.add(new Date(Date.UTC(year, month - 1, day)).toISOString());
  });

  // 2. Festivos basados en Pascua
  const easterSunday = getEasterSunday(year);
  
  // Jueves y Viernes Santo (no se mueven)
  holidays.add(addDays(easterSunday, pascuaHolidaysOffsets.juevesSanto).toISOString());
  holidays.add(addDays(easterSunday, pascuaHolidaysOffsets.viernesSanto).toISOString());

  // Festivos de Pascua que se mueven al lunes
  holidays.add(moveToNextMonday(addDays(easterSunday, pascuaHolidaysOffsets.ascension)).toISOString());
  holidays.add(moveToNextMonday(addDays(easterSunday, pascuaHolidaysOffsets.corpusChristi)).toISOString());
  holidays.add(moveToNextMonday(addDays(easterSunday, pascuaHolidaysOffsets.sagradoCorazon)).toISOString());

  // 3. Festivos que se mueven al lunes por Ley Emiliani
  movableHolidaysDates.forEach(holiday => {
    const [day, month] = holiday.split('-').map(Number);
    const holidayDate = new Date(Date.UTC(year, month - 1, day));
    holidays.add(moveToNextMonday(holidayDate).toISOString());
  });

  return Array.from(holidays).map(dateStr => new Date(dateStr));
};

// Genera festivos para un rango de años para evitar recalcular constantemente
const currentYear = new Date().getFullYear();
export const colombianHolidays: Date[] = [
  ...getHolidaysForYear(currentYear - 2),
  ...getHolidaysForYear(currentYear - 1),
  ...getHolidaysForYear(currentYear),
  ...getHolidaysForYear(currentYear + 1),
  ...getHolidaysForYear(currentYear + 2),
];

// Helper para verificar si una fecha es festivo (usado en el componente del calendario)
export const isColombianHoliday = (date: Date): boolean => {
    return colombianHolidays.some(holiday => isSameDay(date, holiday));
}
