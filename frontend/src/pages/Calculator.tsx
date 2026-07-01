import { CalculatorOutlined, DollarOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Card, Col, Collapse, Divider, InputNumber, Row, Select, Space, Statistic, Typography, Button, Tooltip, Tag } from "antd";
import { useMemo, useState } from "react";
import type { CalcResult } from "../utils/calcEngine";
import {
  calcSRA3, calcVisitsky, calcDiplom, calcPVC, calcAcrylic, calcGravure,
  calcSelfAdhesive, calcDTF, calcSublimation, calcBanner, calcCanvas,
  calcPoster, calcBracelets, calcBadges, calcNotebook, calcBags, calcFlags,
} from "../utils/calcEngine";

interface FieldProps {
  label: string;
  value: number | string | undefined;
  onChange: (v: number | string | null) => void;
  suffix?: string;
  type?: "number" | "select";
  options?: { label: string; value: string }[];
  tooltip?: string;
  min?: number;
  max?: number;
  step?: number;
}

function Field({ label, value, onChange, suffix, type = "number", options, tooltip, min, max, step }: FieldProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
      <Tooltip title={tooltip}>
        <Typography.Text style={{ fontSize: 12, width: 160, flexShrink: 0, color: value ? "#1e293b" : "#94a3b8" }}>
          {label} {tooltip && <InfoCircleOutlined style={{ fontSize: 10 }} />}
        </Typography.Text>
      </Tooltip>
      {type === "select" ? (
        <Select
          size="small"
          style={{ flex: 1 }}
          value={value as string}
          onChange={(v) => onChange(v)}
          options={options}
          popupMatchSelectWidth={false}
        />
      ) : (
        <InputNumber
          size="small"
          style={{ flex: 1 }}
          value={value as number}
          onChange={onChange}
          suffix={suffix}
          min={min ?? 0}
          max={max}
          step={step ?? 1}
        />
      )}
    </div>
  );
}

function ResultRow({ result }: { result: CalcResult }) {
  return (
    <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0f5ff", borderRadius: 6, border: "1px solid #d6e4ff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <DollarOutlined style={{ color: "#1677ff", fontSize: 14 }} />
        <Typography.Text strong style={{ fontSize: 18, color: "#1677ff" }}>
          {result.total.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
        </Typography.Text>
      </div>
      {Object.keys(result.details).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {Object.entries(result.details).map(([k, v]) => (
            <Tag key={k} style={{ fontSize: 11 }}>{k}: {typeof v === "number" ? v.toLocaleString("ru-RU") : v}</Tag>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <Collapse
      size="small"
      style={{ marginBottom: 8 }}
      items={[{
        key: title,
        label: <Space><span>{emoji}</span><Typography.Text strong style={{ fontSize: 13 }}>{title}</Typography.Text></Space>,
        children,
      }]}
    />
  );
}

export default function CalculatorPage() {
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

  const rSra3 = useMemo(() => calcSRA3(sra3.format, sra3.width, sra3.height, sra3.density, sra3.color, sra3.lamination, sra3.finish, sra3.qty, sra3.markup, sra3.discount), [sra3]);
  const rVisitsky = useMemo(() => calcVisitsky(visitsky.qty), [visitsky.qty]);
  const rDiplom = useMemo(() => calcDiplom(diplom.qty), [diplom.qty]);
  const rPvc = useMemo(() => calcPVC(pvc.thickness, pvc.cut, pvc.width, pvc.height, pvc.qty, pvc.markup, pvc.discount), [pvc]);
  const rAcrylic = useMemo(() => calcAcrylic(acrylic.thickness, acrylic.width, acrylic.height, acrylic.leg, acrylic.qty, acrylic.markup, acrylic.discount), [acrylic]);
  const rGravure = useMemo(() => calcGravure(gravure.width, gravure.height, gravure.qty, gravure.markup, gravure.discount), [gravure]);
  const rSelfAdh = useMemo(() => calcSelfAdhesive(selfAdh.format, selfAdh.width, selfAdh.height, selfAdh.cut, selfAdh.qty, selfAdh.markup, selfAdh.discount), [selfAdh]);
  const rDtf = useMemo(() => calcDTF(dtf.format, dtf.width, dtf.height, dtf.qty, dtf.markup, dtf.discount), [dtf]);
  const rSublim = useMemo(() => calcSublimation(sublimation.type, sublimation.width, sublimation.height, sublimation.qty, sublimation.markup, sublimation.discount), [sublimation]);
  const rBanner = useMemo(() => calcBanner(banner.density, banner.width, banner.height, banner.finish, banner.step, banner.rollup, banner.qty, banner.markup, banner.discount), [banner]);
  const rCanvas = useMemo(() => calcCanvas(canvas.type, canvas.width, canvas.height, canvas.qty, canvas.markup, canvas.discount), [canvas]);
  const rPoster = useMemo(() => calcPoster(poster.width, poster.height, poster.qty, poster.markup, poster.discount), [poster]);
  const rBracelets = useMemo(() => calcBracelets(bracelets.color, bracelets.qty, bracelets.markup, bracelets.discount), [bracelets]);
  const rBadges = useMemo(() => calcBadges(badges.diameter, badges.qty, badges.markup, badges.discount), [badges]);
  const rNotebook = useMemo(() => calcNotebook(notebook.format, notebook.qty, notebook.markup, notebook.discount), [notebook]);
  const rBags = useMemo(() => calcBags(bags.type, bags.qty, bags.markup, bags.discount), [bags]);
  const rFlags = useMemo(() => calcFlags(flags.materialCost, flags.width, flags.height, flags.qty, flags.markup, flags.discount), [flags]);

  const grandTotal = rSra3.total + rVisitsky.total + rDiplom.total + rPvc.total + rAcrylic.total +
    rGravure.total + rSelfAdh.total + rDtf.total + rSublim.total + rBanner.total +
    rCanvas.total + rPoster.total + rBracelets.total + rBadges.total + rNotebook.total + rBags.total + rFlags.total;

  const u = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, key: keyof T) =>
    (v: number | string | null) => setter((prev) => ({ ...prev, [key]: v }));

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={[12, 12]}>
        <Col span={24}>
          <Card size="small" title={<Space><CalculatorOutlined /><Typography.Text strong style={{ fontSize: 13 }}>Калькулятор стоимости — Типография</Typography.Text></Space>}>
            <Row gutter={[16, 0]}>
              {/* LEFT COLUMN */}
              <Col xs={24} lg={12}>
                <Section title="Печать SRA3" emoji="🖨">
                  <Field label="Формат" value={sra3.format} onChange={u(setSra3, "format")} type="select" options={["A6","A5","A4","A3","Визитка","SRA3","Свободный"].map(f => ({label:f,value:f}))} />
                  {sra3.format === "Свободный" && <Field label="Ширина изделия, мм" value={sra3.width} onChange={u(setSra3, "width")} />}
                  {sra3.format === "Свободный" && <Field label="Высота изделия, мм" value={sra3.height} onChange={u(setSra3, "height")} />}
                  <Field label="Плотность г/м²" value={sra3.density} onChange={u(setSra3, "density")} type="select" options={["300","250","170","150","130","115","Офсет 90 гр"].map(d=>({label:d,value:d}))} />
                  <Field label="Цветность" value={sra3.color} onChange={u(setSra3, "color")} type="select" options={["4x0","4x4","4x1","1x0","1x1"].map(c=>({label:c,value:c}))} />
                  <Field label="Ламинация" value={sra3.lamination} onChange={u(setSra3, "lamination")} type="select" options={["Нет","<100мкм / 1","<100мкм / 2","125мкм / 1","125мкм / 2","250 мкм / 1","250 мкм / 2"].map(l=>({label:l,value:l}))} />
                  {sra3.lamination !== "Нет" && <Field label="Мат/Глянц" value={sra3.finish} onChange={u(setSra3, "finish")} type="select" options={["Матовая","Глянцевая"].map(f=>({label:f,value:f}))} />}
                  <Field label="Тираж, шт" value={sra3.qty} onChange={u(setSra3, "qty")} />
                  <Field label="Наценка, %" value={sra3.markup} onChange={u(setSra3, "markup")} />
                  <Field label="Скидка, %" value={sra3.discount} onChange={u(setSra3, "discount")} />
                  <ResultRow result={rSra3} />
                </Section>

                <Section title="ПВХ" emoji="🟦">
                  <Field label="Толщина ПВХ" value={pvc.thickness} onChange={u(setPvc, "thickness")} type="select" options={["3 мм","5 мм"].map(t=>({label:t,value:t}))} />
                  <Field label="Тип резки" value={pvc.cut} onChange={u(setPvc, "cut")} type="select" options={["Без резки","Прямая резка","Резка по форме"].map(c=>({label:c,value:c}))} />
                  <Field label="Ширина, мм" value={pvc.width} onChange={u(setPvc, "width")} />
                  <Field label="Высота, мм" value={pvc.height} onChange={u(setPvc, "height")} />
                  <Field label="Тираж, шт" value={pvc.qty} onChange={u(setPvc, "qty")} />
                  <Field label="Наценка, %" value={pvc.markup} onChange={u(setPvc, "markup")} />
                  <Field label="Скидка, %" value={pvc.discount} onChange={u(setPvc, "discount")} />
                  <ResultRow result={rPvc} />
                </Section>

                <Section title="Акрил" emoji="🔷">
                  <Field label="Толщина" value={acrylic.thickness} onChange={u(setAcrylic, "thickness")} type="select" options={["2 мм","3 мм","4 мм","5 мм","6 мм","8 мм","10 мм"].map(t=>({label:t,value:t}))} />
                  <Field label="Ширина, мм" value={acrylic.width} onChange={u(setAcrylic, "width")} />
                  <Field label="Высота, мм" value={acrylic.height} onChange={u(setAcrylic, "height")} />
                  <Field label="Ножка, мм" value={acrylic.leg} onChange={u(setAcrylic, "leg")} />
                  <Field label="Тираж, шт" value={acrylic.qty} onChange={u(setAcrylic, "qty")} />
                  <Field label="Наценка, %" value={acrylic.markup} onChange={u(setAcrylic, "markup")} />
                  <Field label="Скидка, %" value={acrylic.discount} onChange={u(setAcrylic, "discount")} />
                  <ResultRow result={rAcrylic} />
                </Section>

                <Section title="Самоклейка" emoji="🏷">
                  <Field label="Формат" value={selfAdh.format} onChange={u(setSelfAdh, "format")} type="select" options={["Свободный","Стикерпак A6","Стикерпак A5"].map(f=>({label:f,value:f}))} />
                  {selfAdh.format === "Свободный" && <Field label="Ширина, мм" value={selfAdh.width} onChange={u(setSelfAdh, "width")} />}
                  {selfAdh.format === "Свободный" && <Field label="Высота, мм" value={selfAdh.height} onChange={u(setSelfAdh, "height")} />}
                  <Field label="Тип резки" value={selfAdh.cut} onChange={u(setSelfAdh, "cut")} type="select" options={["Без резки","Резка плоттером","На монтажке"].map(c=>({label:c,value:c}))} />
                  <Field label="Тираж, шт" value={selfAdh.qty} onChange={u(setSelfAdh, "qty")} />
                  <Field label="Наценка, %" value={selfAdh.markup} onChange={u(setSelfAdh, "markup")} />
                  <Field label="Скидка, %" value={selfAdh.discount} onChange={u(setSelfAdh, "discount")} />
                  <ResultRow result={rSelfAdh} />
                </Section>

                <Section title="Гравировка" emoji="✏️">
                  <Field label="Ширина, мм" value={gravure.width} onChange={u(setGravure, "width")} />
                  <Field label="Высота, мм" value={gravure.height} onChange={u(setGravure, "height")} />
                  <Field label="Тираж, шт" value={gravure.qty} onChange={u(setGravure, "qty")} />
                  <Field label="Наценка, %" value={gravure.markup} onChange={u(setGravure, "markup")} />
                  <Field label="Скидка, %" value={gravure.discount} onChange={u(setGravure, "discount")} />
                  <ResultRow result={rGravure} />
                </Section>
              </Col>

              {/* RIGHT COLUMN */}
              <Col xs={24} lg={12}>
                <Section title="Постер (А2+)" emoji="🖼">
                  <Field label="Ширина, м" value={poster.width} onChange={u(setPoster, "width")} step={0.01} />
                  <Field label="Высота, м" value={poster.height} onChange={u(setPoster, "height")} step={0.01} />
                  <Field label="Тираж, шт" value={poster.qty} onChange={u(setPoster, "qty")} />
                  <Field label="Наценка, %" value={poster.markup} onChange={u(setPoster, "markup")} />
                  <Field label="Скидка, %" value={poster.discount} onChange={u(setPoster, "discount")} />
                  <ResultRow result={rPoster} />
                </Section>

                <Section title="Визитки / Дипломы" emoji="🏷">
                  <Field label="Визитки, шт" value={visitsky.qty} onChange={u(setVisitsky, "qty")} />
                  <ResultRow result={rVisitsky} />
                  <Divider style={{ margin: "8px 0" }} />
                  <Field label="Дипломы/грамоты, шт" value={diplom.qty} onChange={u(setDiplom, "qty")} />
                  <ResultRow result={rDiplom} />
                </Section>

                <Section title="ДТФ (DTF)" emoji="👕">
                  <Field label="Формат DTF" value={dtf.format} onChange={u(setDtf, "format")} type="select" options={["Свободный размер","A4","A5","До 10×10 см (малый)","До 10×10 см (большой)"].map(f=>({label:f,value:f}))} />
                  {dtf.format === "Свободный размер" && <Field label="Ширина, мм" value={dtf.width} onChange={u(setDtf, "width")} />}
                  {dtf.format === "Свободный размер" && <Field label="Высота, мм" value={dtf.height} onChange={u(setDtf, "height")} />}
                  <Field label="Тираж, шт" value={dtf.qty} onChange={u(setDtf, "qty")} />
                  <Field label="Наценка, %" value={dtf.markup} onChange={u(setDtf, "markup")} />
                  <Field label="Скидка, %" value={dtf.discount} onChange={u(setDtf, "discount")} />
                  <ResultRow result={rDtf} />
                </Section>

                <Section title="Сублимация" emoji="🎨">
                  <Field label="Тип изделия" value={sublimation.type} onChange={u(setSublimation, "type")} type="select" options={["А4","А5","Шоппер","Футболка"].map(t=>({label:t,value:t}))} />
                  <Field label="Ширина нанесения, мм" value={sublimation.width} onChange={u(setSublimation, "width")} />
                  <Field label="Высота нанесения, мм" value={sublimation.height} onChange={u(setSublimation, "height")} />
                  <Field label="Тираж, шт" value={sublimation.qty} onChange={u(setSublimation, "qty")} />
                  <Field label="Наценка, %" value={sublimation.markup} onChange={u(setSublimation, "markup")} />
                  <Field label="Скидка, %" value={sublimation.discount} onChange={u(setSublimation, "discount")} />
                  <ResultRow result={rSublim} />
                </Section>

                <Section title="Баннер" emoji="🚩">
                  <Field label="Плотность" value={banner.density} onChange={u(setBanner, "density")} type="select" options={["440 г/м²","510 г/м²","Blackout"].map(d=>({label:d,value:d}))} />
                  <Field label="Ширина, м" value={banner.width} onChange={u(setBanner, "width")} step={0.01} />
                  <Field label="Высота, м" value={banner.height} onChange={u(setBanner, "height")} step={0.01} />
                  <Field label="Отделка" value={banner.finish} onChange={u(setBanner, "finish")} type="select" options={["Без отделки","Люверс + проклейка","Проклейка"].map(f=>({label:f,value:f}))} />
                  {banner.finish === "Люверс + проклейка" && <Field label="Шаг люверсов, см" value={banner.step} onChange={u(setBanner, "step")} />}
                  <Field label="Ролл Ап / замена" value={banner.rollup} onChange={u(setBanner, "rollup")} type="select" options={["Нет","Ролл Ап конструкция","Замена полотна"].map(r=>({label:r,value:r}))} />
                  <Field label="Тираж, шт" value={banner.qty} onChange={u(setBanner, "qty")} />
                  <Field label="Наценка, %" value={banner.markup} onChange={u(setBanner, "markup")} />
                  <Field label="Скидка, %" value={banner.discount} onChange={u(setBanner, "discount")} />
                  <ResultRow result={rBanner} />
                </Section>

                <Section title="Холсты" emoji="🖼">
                  <Field label="Тип холста" value={canvas.type} onChange={u(setCanvas, "type")} type="select" options={["С подрамником","Без подрамника"].map(t=>({label:t,value:t}))} />
                  <Field label="Ширина, м" value={canvas.width} onChange={u(setCanvas, "width")} step={0.01} />
                  <Field label="Высота, м" value={canvas.height} onChange={u(setCanvas, "height")} step={0.01} />
                  <Field label="Тираж, шт" value={canvas.qty} onChange={u(setCanvas, "qty")} />
                  <Field label="Наценка, %" value={canvas.markup} onChange={u(setCanvas, "markup")} />
                  <Field label="Скидка, %" value={canvas.discount} onChange={u(setCanvas, "discount")} />
                  <ResultRow result={rCanvas} />
                </Section>

                <Section title="Блокноты" emoji="📓">
                  <Field label="Формат" value={notebook.format} onChange={u(setNotebook, "format")} type="select" options={["А5","А6"].map(f=>({label:f,value:f}))} />
                  <Field label="Тираж, шт" value={notebook.qty} onChange={u(setNotebook, "qty")} />
                  <Field label="Наценка, %" value={notebook.markup} onChange={u(setNotebook, "markup")} />
                  <Field label="Скидка, %" value={notebook.discount} onChange={u(setNotebook, "discount")} />
                  <ResultRow result={rNotebook} />
                </Section>

                <Section title="Флаги и виндеры" emoji="🚩">
                  <Field label="Стоимость материала, ₽" value={flags.materialCost} onChange={u(setFlags, "materialCost")} />
                  <Field label="Ширина, м" value={flags.width} onChange={u(setFlags, "width")} step={0.01} />
                  <Field label="Высота, м" value={flags.height} onChange={u(setFlags, "height")} step={0.01} />
                  <Field label="Тираж, шт" value={flags.qty} onChange={u(setFlags, "qty")} />
                  <Field label="Наценка, %" value={flags.markup} onChange={u(setFlags, "markup")} />
                  <Field label="Скидка, %" value={flags.discount} onChange={u(setFlags, "discount")} />
                  <ResultRow result={rFlags} />
                </Section>

                <Section title="Значки закатные" emoji="🔘">
                  <Field label="Диаметр" value={badges.diameter} onChange={u(setBadges, "diameter")} type="select" options={["38 мм","56 мм"].map(d=>({label:d,value:d}))} />
                  <Field label="Тираж, шт" value={badges.qty} onChange={u(setBadges, "qty")} />
                  <Field label="Наценка, %" value={badges.markup} onChange={u(setBadges, "markup")} />
                  <Field label="Скидка, %" value={badges.discount} onChange={u(setBadges, "discount")} />
                  <ResultRow result={rBadges} />
                </Section>

                <Section title="Браслеты резиновые" emoji="💪">
                  <Field label="Кол-во цветов" value={bracelets.color} onChange={u(setBracelets, "color")} type="select" options={["1 цвет","2 цвета","3 цвета"].map(c=>({label:c,value:c}))} />
                  <Field label="Тираж, шт" value={bracelets.qty} onChange={u(setBracelets, "qty")} />
                  <Field label="Наценка, %" value={bracelets.markup} onChange={u(setBracelets, "markup")} />
                  <Field label="Скидка, %" value={bracelets.discount} onChange={u(setBracelets, "discount")} />
                  <ResultRow result={rBracelets} />
                </Section>

                <Section title="ПВД пакеты" emoji="🛍">
                  <Field label="Тип пакета" value={bags.type} onChange={u(setBags, "type")} type="select" options={["30×40 1цв/1ст","40-50 1цв/1ст","Бумажный"].map(t=>({label:t,value:t}))} />
                  <Field label="Тираж (мин. 100), шт" value={bags.qty} onChange={u(setBags, "qty")} />
                  <Field label="Наценка, %" value={bags.markup} onChange={u(setBags, "markup")} />
                  <Field label="Скидка, %" value={bags.discount} onChange={u(setBags, "discount")} />
                  <ResultRow result={rBags} />
                </Section>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* Grand Total */}
        <Col span={24}>
          <Card size="small" style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", border: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Space>
                <DollarOutlined style={{ fontSize: 24, color: "white" }} />
                <Typography.Text strong style={{ fontSize: 18, color: "white" }}>ИТОГО ВСЕ ПОЗИЦИИ:</Typography.Text>
              </Space>
              <Typography.Text strong style={{ fontSize: 28, color: "white" }}>
                {grandTotal.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
              </Typography.Text>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
