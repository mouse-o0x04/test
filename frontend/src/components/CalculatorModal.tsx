import { CalculatorOutlined } from "@ant-design/icons";
import { Button, Divider, InputNumber, Modal, Select, Space, Typography, message } from "antd";
import { useMemo, useState } from "react";
import type { CalcResult } from "../utils/calcEngine";
import {
  calcSRA3, calcVisitsky, calcDiplom, calcPVC, calcAcrylic, calcGravure,
  calcSelfAdhesive, calcDTF, calcSublimation, calcBanner, calcCanvas,
  calcPoster, calcBracelets, calcBadges, calcNotebook, calcBags, calcFlags,
} from "../utils/calcEngine";

export type CalcProductType =
  | "sra3" | "visitsky" | "diplom" | "pvc" | "acrylic" | "gravure"
  | "selfAdhesive" | "dtf" | "sublimation" | "banner" | "canvas"
  | "poster" | "bracelets" | "badges" | "notebook" | "bags" | "flags";

export const CALC_PRODUCT_TYPES: { value: CalcProductType; label: string }[] = [
  { value: "sra3", label: "Печать SRA3" },
  { value: "visitsky", label: "Визитки" },
  { value: "diplom", label: "Дипломы / Грамоты" },
  { value: "pvc", label: "ПВХ" },
  { value: "acrylic", label: "Акрил" },
  { value: "gravure", label: "Гравировка" },
  { value: "selfAdhesive", label: "Самоклейка" },
  { value: "dtf", label: "ДТФ (DTF)" },
  { value: "sublimation", label: "Сублимация" },
  { value: "banner", label: "Баннер" },
  { value: "canvas", label: "Холсты" },
  { value: "poster", label: "Постер (А2+)" },
  { value: "bracelets", label: "Браслеты резиновые" },
  { value: "badges", label: "Значки закатные" },
  { value: "notebook", label: "Блокноты" },
  { value: "bags", label: "ПВД пакеты" },
  { value: "flags", label: "Флаги и виндеры" },
];

function Field({
  label, value, onChange, suffix, type = "number", options, min, max, step,
}: {
  label: string;
  value: number | string | undefined;
  onChange: (v: number | string | null) => void;
  suffix?: string;
  type?: "number" | "select";
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 4, gap: 8 }}>
      <Typography.Text style={{ fontSize: 12, width: 150, flexShrink: 0 }}>{label}</Typography.Text>
      {type === "select" ? (
        <Select size="small" style={{ flex: 1 }} value={value as string} onChange={(v) => onChange(v)} options={options} popupMatchSelectWidth={false} />
      ) : (
        <InputNumber size="small" style={{ flex: 1 }} value={value as number} onChange={onChange} suffix={suffix} min={min ?? 0} max={max} step={step ?? 1} />
      )}
    </div>
  );
}

function ResultDisplay({ result }: { result: CalcResult }) {
  return (
    <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0f5ff", borderRadius: 6, border: "1px solid #d6e4ff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Стоимость:</Typography.Text>
        <Typography.Text strong style={{ fontSize: 18, color: "#1677ff" }}>
          {result.total.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
        </Typography.Text>
      </div>
    </div>
  );
}

export interface CalcComponent {
  name: string;
  price: number;
}

interface CalculatorModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (price: number, quantity: number, components?: CalcComponent[]) => void;
}

export default function CalculatorModal({ open, onClose, onApply }: CalculatorModalProps) {
  const [productType, setProductType] = useState<CalcProductType>("sra3");
  const [sra3, setSra3] = useState({ format: "A6", width: 105, height: 148, density: "115", color: "4x0", lamination: "Нет", finish: "Глянцевая", qty: 0, markup: 10, discount: 0 });
  const [pvc, setPvc] = useState({ thickness: "5 мм", cut: "Резка по форме", width: 500, height: 474, qty: 0, markup: 0, discount: 0 });
  const [acrylic, setAcrylic] = useState({ thickness: "4 мм", width: 100, height: 200, leg: 22, qty: 0, markup: 2, discount: 0 });
  const [gravure, setGravure] = useState({ width: 100, height: 100, qty: 0, markup: 0, discount: 0 });
  const [selfAdh, setSelfAdh] = useState({ format: "Свободный", width: 200, height: 400, cut: "На монтажке", qty: 0, markup: 0, discount: 0 });
  const [dtf, setDtf] = useState({ format: "Свободный размер", width: 270, height: 330, qty: 0, markup: 20, discount: 0 });
  const [sublimation, setSublimation] = useState({ type: "Футболка", width: 200, height: 200, qty: 0, markup: 20, discount: 0 });
  const [banner, setBanner] = useState({ density: "440 г/м²", width: 1, height: 1.5, finish: "Проклейка", step: 20, rollup: "Нет", qty: 0, markup: 0, discount: 0 });
  const [canvas, setCanvas] = useState({ type: "С подрамником", width: 0.5, height: 0.5, qty: 0, markup: 0, discount: 0 });
  const [poster, setPoster] = useState({ width: 0.6, height: 0.84, qty: 0, markup: 0, discount: 0 });
  const [visitsky, setVisitsky] = useState({ qty: 0 });
  const [diplom, setDiplom] = useState({ qty: 0 });
  const [bracelets, setBracelets] = useState({ color: "1 цвет", qty: 0, markup: 0, discount: 0 });
  const [badges, setBadges] = useState({ diameter: "38 мм", qty: 0, markup: 0, discount: 0 });
  const [notebook, setNotebook] = useState({ format: "А5", qty: 0, markup: 0, discount: 0 });
  const [bags, setBags] = useState({ type: "Бумажный", qty: 0, markup: 0, discount: 0 });
  const [flags, setFlags] = useState({ materialCost: 3500, width: 0.3, height: 1.5, qty: 0, markup: 0, discount: 0 });

  const u = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, key: keyof T) =>
    (v: number | string | null) => setter((prev) => ({ ...prev, [key]: v }));

  const result = useMemo(() => {
    switch (productType) {
      case "sra3": return calcSRA3(sra3.format, sra3.width, sra3.height, sra3.density, sra3.color, sra3.lamination, sra3.finish, sra3.qty, sra3.markup, sra3.discount);
      case "visitsky": return calcVisitsky(visitsky.qty);
      case "diplom": return calcDiplom(diplom.qty);
      case "pvc": return calcPVC(pvc.thickness, pvc.cut, pvc.width, pvc.height, pvc.qty, pvc.markup, pvc.discount);
      case "acrylic": return calcAcrylic(acrylic.thickness, acrylic.width, acrylic.height, acrylic.leg, acrylic.qty, acrylic.markup, acrylic.discount);
      case "gravure": return calcGravure(gravure.width, gravure.height, gravure.qty, gravure.markup, gravure.discount);
      case "selfAdhesive": return calcSelfAdhesive(selfAdh.format, selfAdh.width, selfAdh.height, selfAdh.cut, selfAdh.qty, selfAdh.markup, selfAdh.discount);
      case "dtf": return calcDTF(dtf.format, dtf.width, dtf.height, dtf.qty, dtf.markup, dtf.discount);
      case "sublimation": return calcSublimation(sublimation.type, sublimation.width, sublimation.height, sublimation.qty, sublimation.markup, sublimation.discount);
      case "banner": return calcBanner(banner.density, banner.width, banner.height, banner.finish, banner.step, banner.rollup, banner.qty, banner.markup, banner.discount);
      case "canvas": return calcCanvas(canvas.type, canvas.width, canvas.height, canvas.qty, canvas.markup, canvas.discount);
      case "poster": return calcPoster(poster.width, poster.height, poster.qty, poster.markup, poster.discount);
      case "bracelets": return calcBracelets(bracelets.color, bracelets.qty, bracelets.markup, bracelets.discount);
      case "badges": return calcBadges(badges.diameter, badges.qty, badges.markup, badges.discount);
      case "notebook": return calcNotebook(notebook.format, notebook.qty, notebook.markup, notebook.discount);
      case "bags": return calcBags(bags.type, bags.qty, bags.markup, bags.discount);
      case "flags": return calcFlags(flags.materialCost, flags.width, flags.height, flags.qty, flags.markup, flags.discount);
      default: return { total: 0, details: {} };
    }
  }, [productType, sra3, pvc, acrylic, gravure, selfAdh, dtf, sublimation, banner, canvas, poster, visitsky, diplom, bracelets, badges, notebook, bags, flags]);

  const currentQty = useMemo(() => {
    switch (productType) {
      case "sra3": return sra3.qty;
      case "visitsky": return visitsky.qty;
      case "diplom": return diplom.qty;
      case "pvc": return pvc.qty;
      case "acrylic": return acrylic.qty;
      case "gravure": return gravure.qty;
      case "selfAdhesive": return selfAdh.qty;
      case "dtf": return dtf.qty;
      case "sublimation": return sublimation.qty;
      case "banner": return banner.qty;
      case "canvas": return canvas.qty;
      case "poster": return poster.qty;
      case "bracelets": return bracelets.qty;
      case "badges": return badges.qty;
      case "notebook": return notebook.qty;
      case "bags": return bags.qty;
      case "flags": return flags.qty;
      default: return 0;
    }
  }, [productType, sra3, visitsky, diplom, pvc, acrylic, gravure, selfAdh, dtf, sublimation, banner, canvas, poster, bracelets, badges, notebook, bags, flags]);

  const calcComponents = useMemo<CalcComponent[] | undefined>(() => {
    if (!result.details) return undefined;
    const comps: CalcComponent[] = [];
    for (const [key, val] of Object.entries(result.details)) {
      if (typeof val === "number" && val > 0) {
        comps.push({ name: key, price: val });
      }
    }
    return comps.length > 1 ? comps : undefined;
  }, [result]);

  const handleApply = () => {
    if (result.total <= 0) {
      message.warning("Рассчитайте стоимость перед применением");
      return;
    }
    const unitPrice = currentQty > 0 ? result.total / currentQty : result.total;
    onApply(unitPrice, currentQty, calcComponents);
    message.success(`Цена применена: ${unitPrice.toLocaleString("ru-RU")} ₽/шт × ${currentQty} шт`);
    onClose();
  };

  const renderSection = () => {
    switch (productType) {
      case "sra3":
        return (
          <>
            <Field label="Формат" value={sra3.format} onChange={u(setSra3, "format")} type="select" options={["A6","A5","A4","A3","Визитка","SRA3","Свободный"].map(f=>({label:f,value:f}))} />
            {sra3.format === "Свободный" && <Field label="Ширина, мм" value={sra3.width} onChange={u(setSra3, "width")} />}
            {sra3.format === "Свободный" && <Field label="Высота, мм" value={sra3.height} onChange={u(setSra3, "height")} />}
            <Field label="Плотность г/м²" value={sra3.density} onChange={u(setSra3, "density")} type="select" options={["300","250","170","150","130","115","Офсет 90 гр"].map(d=>({label:d,value:d}))} />
            <Field label="Цветность" value={sra3.color} onChange={u(setSra3, "color")} type="select" options={["4x0","4x4","4x1","1x0","1x1"].map(c=>({label:c,value:c}))} />
            <Field label="Ламинация" value={sra3.lamination} onChange={u(setSra3, "lamination")} type="select" options={["Нет","<100мкм / 1","<100мкм / 2","125мкм / 1","125мкм / 2","250 мкм / 1","250 мкм / 2"].map(l=>({label:l,value:l}))} />
            {sra3.lamination !== "Нет" && <Field label="Мат/Глянц" value={sra3.finish} onChange={u(setSra3, "finish")} type="select" options={["Матовая","Глянцевая"].map(f=>({label:f,value:f}))} />}
            <Field label="Тираж, шт" value={sra3.qty} onChange={u(setSra3, "qty")} />
            <Field label="Наценка, %" value={sra3.markup} onChange={u(setSra3, "markup")} />
            <Field label="Скидка, %" value={sra3.discount} onChange={u(setSra3, "discount")} />
          </>
        );
      case "visitsky":
        return <Field label="Тираж, шт" value={visitsky.qty} onChange={u(setVisitsky, "qty")} />;
      case "diplom":
        return <Field label="Тираж, шт" value={diplom.qty} onChange={u(setDiplom, "qty")} />;
      case "pvc":
        return (
          <>
            <Field label="Толщина ПВХ" value={pvc.thickness} onChange={u(setPvc, "thickness")} type="select" options={["3 мм","5 мм"].map(t=>({label:t,value:t}))} />
            <Field label="Тип резки" value={pvc.cut} onChange={u(setPvc, "cut")} type="select" options={["Без резки","Прямая резка","Резка по форме"].map(c=>({label:c,value:c}))} />
            <Field label="Ширина, мм" value={pvc.width} onChange={u(setPvc, "width")} />
            <Field label="Высота, мм" value={pvc.height} onChange={u(setPvc, "height")} />
            <Field label="Тираж, шт" value={pvc.qty} onChange={u(setPvc, "qty")} />
            <Field label="Наценка, %" value={pvc.markup} onChange={u(setPvc, "markup")} />
            <Field label="Скидка, %" value={pvc.discount} onChange={u(setPvc, "discount")} />
          </>
        );
      case "acrylic":
        return (
          <>
            <Field label="Толщина" value={acrylic.thickness} onChange={u(setAcrylic, "thickness")} type="select" options={["2 мм","3 мм","4 мм","5 мм","6 мм","8 мм","10 мм"].map(t=>({label:t,value:t}))} />
            <Field label="Ширина, мм" value={acrylic.width} onChange={u(setAcrylic, "width")} />
            <Field label="Высота, мм" value={acrylic.height} onChange={u(setAcrylic, "height")} />
            <Field label="Ножка, мм" value={acrylic.leg} onChange={u(setAcrylic, "leg")} />
            <Field label="Тираж, шт" value={acrylic.qty} onChange={u(setAcrylic, "qty")} />
            <Field label="Наценка, %" value={acrylic.markup} onChange={u(setAcrylic, "markup")} />
            <Field label="Скидка, %" value={acrylic.discount} onChange={u(setAcrylic, "discount")} />
          </>
        );
      case "gravure":
        return (
          <>
            <Field label="Ширина, мм" value={gravure.width} onChange={u(setGravure, "width")} />
            <Field label="Высота, мм" value={gravure.height} onChange={u(setGravure, "height")} />
            <Field label="Тираж, шт" value={gravure.qty} onChange={u(setGravure, "qty")} />
            <Field label="Наценка, %" value={gravure.markup} onChange={u(setGravure, "markup")} />
            <Field label="Скидка, %" value={gravure.discount} onChange={u(setGravure, "discount")} />
          </>
        );
      case "selfAdhesive":
        return (
          <>
            <Field label="Формат" value={selfAdh.format} onChange={u(setSelfAdh, "format")} type="select" options={["Свободный","Стикерпак A6","Стикерпак A5"].map(f=>({label:f,value:f}))} />
            {selfAdh.format === "Свободный" && <Field label="Ширина, мм" value={selfAdh.width} onChange={u(setSelfAdh, "width")} />}
            {selfAdh.format === "Свободный" && <Field label="Высота, мм" value={selfAdh.height} onChange={u(setSelfAdh, "height")} />}
            <Field label="Тип резки" value={selfAdh.cut} onChange={u(setSelfAdh, "cut")} type="select" options={["Без резки","Резка плоттером","На монтажке"].map(c=>({label:c,value:c}))} />
            <Field label="Тираж, шт" value={selfAdh.qty} onChange={u(setSelfAdh, "qty")} />
            <Field label="Наценка, %" value={selfAdh.markup} onChange={u(setSelfAdh, "markup")} />
            <Field label="Скидка, %" value={selfAdh.discount} onChange={u(setSelfAdh, "discount")} />
          </>
        );
      case "dtf":
        return (
          <>
            <Field label="Формат DTF" value={dtf.format} onChange={u(setDtf, "format")} type="select" options={["Свободный размер","A4","A5","До 10×10 см (малый)","До 10×10 см (большой)"].map(f=>({label:f,value:f}))} />
            {dtf.format === "Свободный размер" && <Field label="Ширина, мм" value={dtf.width} onChange={u(setDtf, "width")} />}
            {dtf.format === "Свободный размер" && <Field label="Высота, мм" value={dtf.height} onChange={u(setDtf, "height")} />}
            <Field label="Тираж, шт" value={dtf.qty} onChange={u(setDtf, "qty")} />
            <Field label="Наценка, %" value={dtf.markup} onChange={u(setDtf, "markup")} />
            <Field label="Скидка, %" value={dtf.discount} onChange={u(setDtf, "discount")} />
          </>
        );
      case "sublimation":
        return (
          <>
            <Field label="Тип изделия" value={sublimation.type} onChange={u(setSublimation, "type")} type="select" options={["А4","А5","Шоппер","Футболка"].map(t=>({label:t,value:t}))} />
            <Field label="Ширина нанесения, мм" value={sublimation.width} onChange={u(setSublimation, "width")} />
            <Field label="Высота нанесения, мм" value={sublimation.height} onChange={u(setSublimation, "height")} />
            <Field label="Тираж, шт" value={sublimation.qty} onChange={u(setSublimation, "qty")} />
            <Field label="Наценка, %" value={sublimation.markup} onChange={u(setSublimation, "markup")} />
            <Field label="Скидка, %" value={sublimation.discount} onChange={u(setSublimation, "discount")} />
          </>
        );
      case "banner":
        return (
          <>
            <Field label="Плотность" value={banner.density} onChange={u(setBanner, "density")} type="select" options={["440 г/м²","510 г/м²","Blackout"].map(d=>({label:d,value:d}))} />
            <Field label="Ширина, м" value={banner.width} onChange={u(setBanner, "width")} step={0.01} />
            <Field label="Высота, м" value={banner.height} onChange={u(setBanner, "height")} step={0.01} />
            <Field label="Отделка" value={banner.finish} onChange={u(setBanner, "finish")} type="select" options={["Без отделки","Люверс + проклейка","Проклейка"].map(f=>({label:f,value:f}))} />
            {banner.finish === "Люверс + проклейка" && <Field label="Шаг люверсов, см" value={banner.step} onChange={u(setBanner, "step")} />}
            <Field label="Ролл Ап / замена" value={banner.rollup} onChange={u(setBanner, "rollup")} type="select" options={["Нет","Ролл Ап конструкция","Замена полотна"].map(r=>({label:r,value:r}))} />
            <Field label="Тираж, шт" value={banner.qty} onChange={u(setBanner, "qty")} />
            <Field label="Наценка, %" value={banner.markup} onChange={u(setBanner, "markup")} />
            <Field label="Скидка, %" value={banner.discount} onChange={u(setBanner, "discount")} />
          </>
        );
      case "canvas":
        return (
          <>
            <Field label="Тип холста" value={canvas.type} onChange={u(setCanvas, "type")} type="select" options={["С подрамником","Без подрамника"].map(t=>({label:t,value:t}))} />
            <Field label="Ширина, м" value={canvas.width} onChange={u(setCanvas, "width")} step={0.01} />
            <Field label="Высота, м" value={canvas.height} onChange={u(setCanvas, "height")} step={0.01} />
            <Field label="Тираж, шт" value={canvas.qty} onChange={u(setCanvas, "qty")} />
            <Field label="Наценка, %" value={canvas.markup} onChange={u(setCanvas, "markup")} />
            <Field label="Скидка, %" value={canvas.discount} onChange={u(setCanvas, "discount")} />
          </>
        );
      case "poster":
        return (
          <>
            <Field label="Ширина, м" value={poster.width} onChange={u(setPoster, "width")} step={0.01} />
            <Field label="Высота, м" value={poster.height} onChange={u(setPoster, "height")} step={0.01} />
            <Field label="Тираж, шт" value={poster.qty} onChange={u(setPoster, "qty")} />
            <Field label="Наценка, %" value={poster.markup} onChange={u(setPoster, "markup")} />
            <Field label="Скидка, %" value={poster.discount} onChange={u(setPoster, "discount")} />
          </>
        );
      case "bracelets":
        return (
          <>
            <Field label="Кол-во цветов" value={bracelets.color} onChange={u(setBracelets, "color")} type="select" options={["1 цвет","2 цвета","3 цвета"].map(c=>({label:c,value:c}))} />
            <Field label="Тираж, шт" value={bracelets.qty} onChange={u(setBracelets, "qty")} />
            <Field label="Наценка, %" value={bracelets.markup} onChange={u(setBracelets, "markup")} />
            <Field label="Скидка, %" value={bracelets.discount} onChange={u(setBracelets, "discount")} />
          </>
        );
      case "badges":
        return (
          <>
            <Field label="Диаметр" value={badges.diameter} onChange={u(setBadges, "diameter")} type="select" options={["38 мм","56 мм"].map(d=>({label:d,value:d}))} />
            <Field label="Тираж, шт" value={badges.qty} onChange={u(setBadges, "qty")} />
            <Field label="Наценка, %" value={badges.markup} onChange={u(setBadges, "markup")} />
            <Field label="Скидка, %" value={badges.discount} onChange={u(setBadges, "discount")} />
          </>
        );
      case "notebook":
        return (
          <>
            <Field label="Формат" value={notebook.format} onChange={u(setNotebook, "format")} type="select" options={["А5","А6"].map(f=>({label:f,value:f}))} />
            <Field label="Тираж, шт" value={notebook.qty} onChange={u(setNotebook, "qty")} />
            <Field label="Наценка, %" value={notebook.markup} onChange={u(setNotebook, "markup")} />
            <Field label="Скидка, %" value={notebook.discount} onChange={u(setNotebook, "discount")} />
          </>
        );
      case "bags":
        return (
          <>
            <Field label="Тип пакета" value={bags.type} onChange={u(setBags, "type")} type="select" options={["30×40 1цв/1ст","40-50 1цв/1ст","Бумажный"].map(t=>({label:t,value:t}))} />
            <Field label="Тираж (мин. 100), шт" value={bags.qty} onChange={u(setBags, "qty")} />
            <Field label="Наценка, %" value={bags.markup} onChange={u(setBags, "markup")} />
            <Field label="Скидка, %" value={bags.discount} onChange={u(setBags, "discount")} />
          </>
        );
      case "flags":
        return (
          <>
            <Field label="Стоимость материала, ₽" value={flags.materialCost} onChange={u(setFlags, "materialCost")} />
            <Field label="Ширина, м" value={flags.width} onChange={u(setFlags, "width")} step={0.01} />
            <Field label="Высота, м" value={flags.height} onChange={u(setFlags, "height")} step={0.01} />
            <Field label="Тираж, шт" value={flags.qty} onChange={u(setFlags, "qty")} />
            <Field label="Наценка, %" value={flags.markup} onChange={u(setFlags, "markup")} />
            <Field label="Скидка, %" value={flags.discount} onChange={u(setFlags, "discount")} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      title={<Space><CalculatorOutlined /> Калькулятор стоимости</Space>}
      open={open}
      onCancel={onClose}
      width={520}
      footer={[
        <Button key="cancel" onClick={onClose}>Отмена</Button>,
        <Button key="apply" type="primary" onClick={handleApply} disabled={result.total <= 0}>
          Применить: {result.total > 0 && currentQty > 0 ? `${(result.total / currentQty).toLocaleString("ru-RU")} ₽/шт × ${currentQty}` : result.total > 0 ? `${result.total.toLocaleString("ru-RU")} ₽` : "—"}
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 12 }}>
        <Typography.Text style={{ fontSize: 12, color: "#64748b" }}>Тип продукта</Typography.Text>
        <Select
          style={{ width: "100%", marginTop: 4 }}
          value={productType}
          onChange={setProductType}
          options={CALC_PRODUCT_TYPES}
        />
      </div>

      <Divider style={{ margin: "8px 0" }} />

      <div style={{ maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
        {renderSection()}
      </div>

      <ResultDisplay result={result} />
    </Modal>
  );
}
