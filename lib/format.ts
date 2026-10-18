const numberFormatter = new Intl.NumberFormat("en-US");

// Always render numbers with English (Latin) digits, regardless of the browser locale
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

// Convert Arabic-Indic (٠-٩) and Persian (۰-۹) digits inside text coming from the data source
export function toEnglishDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// Arabic month/day names with English digits
export const DATE_LOCALE = "ar-EG-u-nu-latn";
