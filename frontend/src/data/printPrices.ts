export const SRA3_PRICES: Record<string, Record<string, number>> = {
  "300": { "4x0": 40.8, "4x4": 76.8, "4x1": 52.8, "1x0": 16.8, "1x1": 28.8 },
  "250": { "4x0": 40.3, "4x4": 76.3, "4x1": 52.3, "1x0": 16.3, "1x1": 28.3 },
  "170": { "4x0": 33.3, "4x4": 63.3, "4x1": 45.3, "1x0": 13.3, "1x1": 23.3 },
  "150": { "4x0": 32.5, "4x4": 62.5, "4x1": 44.5, "1x0": 12.5, "1x1": 22.5 },
  "130": { "4x0": 26.2, "4x4": 50.2, "4x1": 38.2, "1x0": 10.2, "1x1": 18.2 },
  "115": { "4x0": 25.9, "4x4": 49.9, "4x1": 37.9, "1x0": 9.9, "1x1": 17.9 },
  "Офсет 90 гр": { "4x0": 25.524, "4x4": 49.524, "4x1": 37.524, "1x0": 9.52, "1x1": 17.52 },
};

export const SRA3_SHEET = { width: 320, height: 450 };

export const SRA3_FORMATS: Record<string, { width: number; height: number }> = {
  "A3": { width: 297, height: 420 },
  "A4": { width: 210, height: 297 },
  "A5": { width: 148, height: 210 },
  "A6": { width: 105, height: 148 },
  "Визитка": { width: 90, height: 50 },
  "SRA3": { width: 320, height: 450 },
};

export const DISCOUNT_TABLE: [number, number][] = [
  [1, 1],
  [100, 0.8],
  [300, 0.7],
  [500, 0.5],
  [1000, 0.4],
  [10000, 0.3],
];

export const LAMINATION_PRICES: Record<string, number> = {
  "Нет": 0,
  "<100мкм / 1": 25,
  "<100мкм / 2": 45,
  "125мкм / 1": 35,
  "125мкм / 2": 45,
  "250 мкм / 1": 60,
  "250 мкм / 2": 60,
};

export const LAMINATION_FINISH: Record<string, number> = {
  "Матовая": 10,
  "Глянцевая": 5,
};

export const PVC_PRICES: Record<string, number> = {
  "3 мм": 2750,
  "5 мм": 3750,
  "6 мм": 0,
  "10 мм": 0,
};

export const PVC_CUT_COEFF: Record<string, number> = {
  "Без резки": 1,
  "Прямая резка": 1.3,
  "Резка по форме": 1.5,
};

export const ACRYLIC_PRICES: Record<string, number> = {
  "2 мм": 12500,
  "3 мм": 17500,
  "4 мм": 22500,
  "5 мм": 27500,
  "6 мм": 32500,
  "8 мм": 45000,
  "10 мм": 52500,
};

export const SELF_ADHESIVE = {
  pricePerM2: 475,
  cutCoeff: {
    "Без резки": 1,
    "Резка плоттером": 1.5,
    "На монтажке": 3,
  },
  smallFormatThreshold: 100,
};

export const DTF_PRICES: Record<string, number> = {
  "A4": 300,
  "A5": 150,
  "До 10×10 см (малый)": 100,
  "До 10×10 см (большой)": 75,
};
export const DTF_PRICE_PER_M2 = 4750;

export const SUBLIMATION_PRICES: Record<string, number> = {
  "А4": 150,
  "А5": 100,
  "Шоппер": 375,
  "Футболка": 485,
};

export const BANNER_PRICES: Record<string, number> = {
  "440 г/м²": 475,
  "510 г/м²": 650,
  "Blackout": 950,
};

export const BANNER_EYELET = {
  basePrice: 25,
  divisor: 0.4,
  factorFull: 2.4,
  factorGlueOnly: 1.4,
};

export const BANNER_ROLLUP: Record<string, number> = {
  "Ролл Ап конструкция": 6750,
  "Замена полотна": 1350,
};

export const CANVAS_PRICES: Record<string, number> = {
  "С подрамником": 3750,
  "Без подрамника": 1900,
};

export const BUSINESS_CARDS = { pricePerUnit: 9.5 };
export const DIPLOMAS = { pricePerUnit: 45 };

export const BRACELETS: Record<string, number> = {
  "1 цвет": 68,
  "2 цвета": 74,
  "3 цвета": 81,
};

export const BADGES: Record<string, { large: number; small: number }> = {
  "38 мм": { large: 40, small: 100 },
  "56 мм": { large: 65, small: 150 },
};
export const BADGES_SMALL_QTY_THRESHOLD = 10;

export const GRAVURE = { pricePerM2: 8500, minimum: 150 };

export const NOTEBOOK_COMPONENTS: Record<string, Record<string, number>> = {
  "Обложка": { "А5": 17.34, "А6": 9 },
  "Задник": { "А5": 10, "А6": 7 },
  "Пружина": { "А5": 13.5, "А6": 9 },
  "Лист": { "А5": 1.47, "А6": 1.7 },
};
export const NOTEBOOK_SHEETS_COUNT = 30;

export const POSTER_PRICE_PER_M2 = 475;

export const FLAG_PRICES = { construction: 1750, finishingPerM2: 975 };

export const BAGS: Record<string, number> = {
  "30×40 1цв/1ст": 60,
  "40-50 1цв/1ст": 62,
  "Бумажный": 63,
};
export const BAGS_MIN_QTY = 100;
