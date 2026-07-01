import {
  SRA3_PRICES, SRA3_SHEET, SRA3_FORMATS, DISCOUNT_TABLE,
  LAMINATION_PRICES, LAMINATION_FINISH,
  PVC_PRICES, PVC_CUT_COEFF,
  ACRYLIC_PRICES,
  SELF_ADHESIVE,
  DTF_PRICES, DTF_PRICE_PER_M2,
  SUBLIMATION_PRICES,
  BANNER_PRICES, BANNER_EYELET, BANNER_ROLLUP,
  CANVAS_PRICES,
  BUSINESS_CARDS, DIPLOMAS,
  BRACELETS, BADGES, BADGES_SMALL_QTY_THRESHOLD,
  GRAVURE, BAGS, BAGS_MIN_QTY,
  NOTEBOOK_COMPONENTS, NOTEBOOK_SHEETS_COUNT,
  POSTER_PRICE_PER_M2, FLAG_PRICES,
} from "../data/printPrices";

function lookupDiscount(qty: number): number {
  const sorted = DISCOUNT_TABLE.slice().sort((a, b) => a[0] - b[0]);
  let coeff = sorted.length ? sorted[0][1] : 1;
  for (const [th, c] of sorted) {
    if (qty >= th) coeff = c;
    else break;
  }
  return coeff;
}

export interface CalcResult { total: number; details: Record<string, number | string>; }

export function calcSRA3(
  format: string, widthMm: number, heightMm: number, density: string,
  color: string, lamination: string, finishType: string,
  qty: number, markup: number, discount: number,
): CalcResult {
  let iw: number, ih: number;
  if (format === "Свободный" || !SRA3_FORMATS[format]) {
    iw = widthMm;
    ih = heightMm;
  } else {
    const f = SRA3_FORMATS[format];
    iw = f.width;
    ih = f.height;
  }

  const sheetW = SRA3_SHEET.width;
  const sheetH = SRA3_SHEET.height;

  const perSheet = Math.max(
    Math.floor(sheetW / iw) * Math.floor(sheetH / ih),
    Math.floor(sheetH / iw) * Math.floor(sheetW / ih),
  );

  if (!perSheet || perSheet <= 0) {
    return { total: 0, details: { "Ошибка": `Изделие ${iw}×${ih} не помещается на лист ${sheetW}×${sheetH}` } };
  }

  const row = SRA3_PRICES[density] || SRA3_PRICES["115"];
  const sheetPrice = (row as Record<string, number>)[color] || (row as Record<string, number>)["4x0"] || 25.9;

  const laminationPrice = lamination === "Нет" ? 0 :
    (LAMINATION_PRICES[lamination] || 0) + (LAMINATION_FINISH[finishType] || 0);

  const pricePerItem = (sheetPrice * 1.8) / perSheet + laminationPrice / perSheet;
  const discountCoeff = lookupDiscount(qty);
  const total = pricePerItem * discountCoeff * (1 + markup / 100) * (1 - discount / 100) * qty;

  return {
    total, details: {
      "Формат изделия": `${iw}×${ih} мм`,
      "Лист SRA3": `${sheetW}×${sheetH} мм`,
      "Изделий на листе": perSheet,
      "Цена листа": `${sheetPrice} ₽`,
      "Ламинация": laminationPrice > 0 ? `${laminationPrice} ₽` : "нет",
      "Цена за изделие": `${pricePerItem.toFixed(2)} ₽`,
      "Коэф. скидки": discountCoeff,
    },
  };
}

export function calcVisitsky(qty: number): CalcResult {
  const price = BUSINESS_CARDS.pricePerUnit;
  const discountCoeff = lookupDiscount(qty);
  const total = price * discountCoeff * qty;
  return { total, details: { "Цена за шт": price, "Коэф. скидки": discountCoeff } };
}

export function calcDiplom(qty: number): CalcResult {
  const price = DIPLOMAS.pricePerUnit;
  const discountCoeff = lookupDiscount(qty);
  const total = price * discountCoeff * qty;
  return { total, details: { "Цена за шт": price, "Коэф. скидки": discountCoeff } };
}

export function calcPVC(
  thickness: string, cutType: string,
  widthMm: number, heightMm: number,
  qty: number, markup: number, discount: number,
): CalcResult {
  const priceM2 = PVC_PRICES[thickness] || 2750;
  const cutCoeff = PVC_CUT_COEFF[cutType] || 1;
  const area = (widthMm * heightMm) / 1000000;
  const total = priceM2 * cutCoeff * area * (1 + markup / 100) * (1 - discount / 100) * qty;

  return { total, details: {
    "Цена м²": priceM2, "Коэф. резки": cutCoeff, "Площадь м²": area.toFixed(3),
  }};
}

export function calcAcrylic(
  thickness: string, widthMm: number, heightMm: number, legMm: number,
  qty: number, markup: number, discount: number,
): CalcResult {
  const priceM2 = ACRYLIC_PRICES[thickness] || 22500;
  const area = (widthMm * (heightMm + legMm)) / 1000000;
  const total = priceM2 * area * (1 + markup / 100) * (1 - discount / 100) * qty;

  return { total, details: { "Цена м²": priceM2, "Площадь м²": area.toFixed(3) } };
}

export function calcGravure(
  widthMm: number, heightMm: number,
  qty: number, markup: number, discount: number,
): CalcResult {
  const area = (widthMm / 1000) * (heightMm / 1000);
  const raw = area * GRAVURE.pricePerM2;
  const total = Math.max(GRAVURE.minimum, raw) * (1 + markup / 100) * (1 - discount / 100) * qty;
  return { total, details: { "Площадь м²": area.toFixed(3), "Минимум": GRAVURE.minimum, "Цена м²": GRAVURE.pricePerM2 } };
}

export function calcSelfAdhesive(
  format: string, widthMm: number, heightMm: number, cutType: string,
  qty: number, markup: number, discount: number,
): CalcResult {
  let w: number, h: number;
  if (format === "Стистерпак A6") { w = 105; h = 148; }
  else if (format === "Стикерпак A5") { w = 148; h = 210; }
  else { w = widthMm; h = heightMm; }

  const cutCoeff = (SELF_ADHESIVE.cutCoeff as Record<string, number>)[cutType] || 1;
  const th = SELF_ADHESIVE.smallFormatThreshold;

  let pricePerItem: number;
  if (w < th && h < th) {
    const nW = Math.ceil(th / w);
    const nH = Math.ceil(th / h);
    pricePerItem = Math.max(nW * w, nH * h) / nW / nH;
  } else {
    pricePerItem = SELF_ADHESIVE.pricePerM2 * (w / 1000) * (h / 1000) * cutCoeff;
  }

  const total = pricePerItem * qty * (1 + markup / 100) * (1 - discount / 100);
  return { total, details: { "Коэф. резки": cutCoeff, "Цена за шт": pricePerItem.toFixed(2) } };
}

export function calcDTF(
  format: string, widthMm: number, heightMm: number,
  qty: number, markup: number, discount: number,
): CalcResult {
  let pricePerUnit: number;
  if (format === "Свободный размер") {
    pricePerUnit = (widthMm * heightMm / 1000000) * DTF_PRICE_PER_M2;
  } else {
    pricePerUnit = DTF_PRICES[format] || 150;
  }
  const total = pricePerUnit * qty * (1 + markup / 100) * (1 - discount / 100);
  return { total, details: { "Цена за шт": pricePerUnit } };
}

export function calcSublimation(
  type: string, widthMm: number, heightMm: number,
  qty: number, markup: number, discount: number,
): CalcResult {
  const base = SUBLIMATION_PRICES[type] || 100;
  const printCost = (widthMm * heightMm / 1000000) * DTF_PRICE_PER_M2;
  const total = (base + printCost) * qty * (1 + markup / 100) * (1 - discount / 100);
  return { total, details: { "Цена основы": base, "Стоимость нанесения": printCost.toFixed(2) } };
}

export function calcBanner(
  density: string, widthM: number, heightM: number,
  finishType: string, stepCm: number,
  rollupType: string,
  qty: number, markup: number, discount: number,
): CalcResult {
  const priceM2 = BANNER_PRICES[density] || 475;
  const area = widthM * heightM;
  const perimeter = (widthM + heightM) * 2;
  const canvasCost = priceM2 * area;

  let eyeletsCount = 0;
  let finishingCost = 0;
  if (finishType === "Люверс + проклейка") {
    eyeletsCount = Math.max(4, Math.ceil(perimeter * 100 / stepCm));
    finishingCost = (widthM + heightM) * BANNER_EYELET.basePrice / BANNER_EYELET.divisor * BANNER_EYELET.factorFull;
  } else if (finishType === "Проклейка") {
    finishingCost = (widthM + heightM) * BANNER_EYELET.basePrice / BANNER_EYELET.divisor * BANNER_EYELET.factorGlueOnly;
  }

  const rollUpCost = rollupType === "Нет" ? 0 : (BANNER_ROLLUP[rollupType] || 0);
  const total = (canvasCost + finishingCost + rollUpCost) * (1 + markup / 100) * (1 - discount / 100) * qty;

  let specs = `${widthM}×${heightM} м, ${density}, ${finishType}`;
  if (eyeletsCount) specs += `, ≈${eyeletsCount} люверсов`;
  if (rollupType !== "Нет") specs += `, ${rollupType}`;

  return { total, details: {
    "Цена м²": priceM2, "Площадь м²": area, "Периметр м": perimeter,
    "Стоимость полотна": canvasCost.toFixed(0),
    "Отделка": finishingCost.toFixed(0),
    "Ролл Ап": rollUpCost,
  }};
}

export function calcCanvas(
  type: string, widthM: number, heightM: number,
  qty: number, markup: number, discount: number,
): CalcResult {
  const priceM2 = CANVAS_PRICES[type] || 2200;
  const total = priceM2 * widthM * heightM * (1 + markup / 100) * (1 - discount / 100) * qty;
  return { total, details: { "Цена м²": priceM2, "Площадь м²": (widthM * heightM).toFixed(2) } };
}

export function calcPoster(
  widthM: number, heightM: number,
  qty: number, markup: number, discount: number,
): CalcResult {
  const total = widthM * heightM * POSTER_PRICE_PER_M2 * (1 + markup / 100) * (1 - discount / 100) * qty;
  return { total, details: { "Цена м²": POSTER_PRICE_PER_M2 } };
}

export function calcBracelets(colorCount: string, qty: number, markup: number, discount: number): CalcResult {
  const price = BRACELETS[colorCount] || 68;
  const total = price * qty * (1 + markup / 100) * (1 - discount / 100);
  return { total, details: { "Цена за шт": price } };
}

export function calcBadges(diameter: string, qty: number, markup: number, discount: number): CalcResult {
  const prices = BADGES[diameter] || BADGES["38 мм"];
  const tier = qty < BADGES_SMALL_QTY_THRESHOLD ? "small" : "large";
  const price = tier === "small" ? prices.small : prices.large;
  const total = price * qty * (1 + markup / 100) * (1 - discount / 100);
  return { total, details: { "Цена за шт": price, "Тираж": qty < BADGES_SMALL_QTY_THRESHOLD ? ` < ${BADGES_SMALL_QTY_THRESHOLD}` : `≥ ${BADGES_SMALL_QTY_THRESHOLD}` } };
}

export function calcNotebook(
  format: string, qty: number, markup: number, discount: number,
): CalcResult {
  const cover = (NOTEBOOK_COMPONENTS["Обложка"] || {})[format] || 0;
  const back = (NOTEBOOK_COMPONENTS["Задник"] || {})[format] || 0;
  const spring = (NOTEBOOK_COMPONENTS["Пружина"] || {})[format] || 0;
  const sheet = (NOTEBOOK_COMPONENTS["Лист"] || {})[format] || 0;
  const sheets = sheet * NOTEBOOK_SHEETS_COUNT;
  const costPerUnit = cover + back + spring + sheets;
  const total = costPerUnit * qty * (1 + markup / 100) * (1 - discount / 100);
  const sheetLabel = `Листы×${NOTEBOOK_SHEETS_COUNT}`;
  return { total, details: { "Обложка": cover, "Задник": back, "Пружина": spring, [sheetLabel]: sheets.toFixed(2), "Себестоимость": costPerUnit.toFixed(2) } };
}

export function calcBags(type: string, qty: number, markup: number, discount: number): CalcResult {
  const price = BAGS[type] || 60;
  const actualQty = Math.max(qty, BAGS_MIN_QTY);
  const total = price * actualQty * (1 + markup / 100) * (1 - discount / 100);
  return { total, details: { "Цена за шт": price, "Мин. тираж": BAGS_MIN_QTY } };
}

export function calcFlags(
  materialCost: number, widthM: number, heightM: number,
  qty: number, markup: number, discount: number,
): CalcResult {
  const total = (materialCost + FLAG_PRICES.construction + FLAG_PRICES.finishingPerM2 * widthM * heightM)
    * (1 + markup / 100) * (1 - discount / 100) * qty;
  return { total, details: { "Материал": materialCost, "Конструкция": FLAG_PRICES.construction, "Отд./м²": FLAG_PRICES.finishingPerM2 } };
}
