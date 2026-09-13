export const PILOT_CITIES = {
  Karachi: [
    "DHA",
    "Clifton",
    "PECHS",
    "Gulshan-e-Iqbal",
    "Gulistan-e-Jauhar",
    "North Nazimabad",
    "Bahadurabad",
    "Korangi",
    "Malir",
    "Bahria Town",
    "Saddar",
    "Federal B Area",
  ],
  Lahore: [
    "DHA",
    "Gulberg",
    "Johar Town",
    "Model Town",
    "Cantt",
    "Bahria Town",
    "Wapda Town",
    "Garden Town",
  ],
  Islamabad: ["F-7", "F-8", "G-11", "Bahria Town", "DHA"],
} as const;

export function taxonomy() {
  return Object.entries(PILOT_CITIES).map(([city, areas]) => ({ city, areas: [...areas] }));
}
