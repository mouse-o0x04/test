import { CodeOutlined, DatabaseOutlined, DashboardOutlined, ExperimentOutlined, ShopOutlined } from "@ant-design/icons";
import { Card, Collapse, Typography } from "antd";

const { Paragraph, Text, Title } = Typography;

const Code = ({ children }: { children: React.ReactNode }) => (
  <Text code style={{ fontSize: 12 }}>{children}</Text>
);

const VarRow = ({ name, type, desc }: { name: string; type: string; desc: string }) => (
  <div style={{ display: "flex", gap: 12, padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
    <Code>{name}</Code>
    <Text type="secondary" style={{ minWidth: 60 }}>{type}</Text>
    <Text>{desc}</Text>
  </div>
);

export default function ScriptReferenceTab() {
  return (
    <div style={{ maxWidth: 800 }}>
      <Collapse defaultActiveKey={["chain"]} items={[
        {
          key: "chain",
          label: <span><DashboardOutlined /> Продукт — Сырьё — Склад</span>,
          children: (
            <div>
              <Title level={5}>Обзор</Title>
              <Paragraph>
                В системе три основных сущности, связанные между собой:
              </Paragraph>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <Card size="small" style={{ flex: 1 }} title={<><ShopOutlined /> Продукт</>}>
                  <Paragraph style={{ margin: 0, fontSize: 13 }}>
                    Готовая позиция из каталога. Имеет название, цену, формулу расчёта (простую или скрипт).
                    Может быть привязана к сырью через <Code>raw_material_id</Code>.
                  </Paragraph>
                </Card>
                <Card size="small" style={{ flex: 1 }} title={<><ExperimentOutlined /> Сырьё</>}>
                  <Paragraph style={{ margin: 0, fontSize: 13 }}>
                    Материал, из которого изготавливается продукт. Хранится в отдельной таблице <Code>raw_materials</Code>.
                    Имеет размеры, плотность, цвет/finish, параметры рулона.
                  </Paragraph>
                </Card>
                <Card size="small" style={{ flex: 1 }} title={<><DatabaseOutlined /> Склад</>}>
                  <Paragraph style={{ margin: 0, fontSize: 13 }}>
                    Остатки. Хранит количество и produktów, и сырья отдельно.
                    Каждая позиция на складе — либо продукт, либо сырьё (никогда оба сразу).
                  </Paragraph>
                </Card>
              </div>

              <Title level={5}>Схема связей</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, marginBottom: 16 }}>{`Продукт                    Сырьё (raw_materials)
┌──────────────┐          ┌──────────────────┐
│ name         │          │ name             │
│ unit_price   │          │ width_mm         │
│ formula      │          │ height_mm        │
│ formula_script │        │ roll_width_m     │
│ raw_material_id ──────► │ roll_length_m    │
│ material_coefficient    │ density          │
│ unit_type    │          │ color_finish     │
└──────┬───────┘          │ unit_type        │
       │                  │ unit_price       │
       │                  └────────┬─────────┘
       ▼                           │
  Заказ (order_items)             │
  ┌──────────────┐                │
  │ product_id ──┤ (nullable)     │
  │ quantity     │                │
  │ unit_price   │                │
  │ product_*_snapshot             │
  └──────────────┘                │
                                  ▼
                         Склад (warehouse)
                         ┌──────────────────┐
                         │ product_id       │ (nullable)
                         │ raw_material_id  │ (nullable)
                         │ quantity         │
                         │ min_quantity     │
                         │ defective_quantity
                         │ stock_calculation_script
                         │ display_format_script
                         └──────────────────┘
                         ОДНО из двух обязательно`}</pre>

              <Title level={5}>Пошаговая инструкция</Title>

              <Paragraph strong>1. Создайте сырьё</Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                Раздел «Сырьё» в сайдбаре. Укажите название, размеры (если листовое), параметры рулона (если рулонное),
                плотность, цвет/finish. Это могут быть: бумага, баннерное полотно, самоклейка, ПВХ, акрил и т.д.
              </Paragraph>

              <Paragraph strong>2. Добавьте сырьё на склад</Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                Раздел «Склад» → таб «Сырьё» → «Позиция». Выберите сырьё из списка, укажите количество.
                <br />
                <Text type="secondary">Для рулонных материалов доступен переключатель «Ролики / Метры» — можно вводить как количество роликов, так и метраж напрямую.</Text>
              </Paragraph>

              <Paragraph strong>3. Создайте продукт и привяжите к сырью</Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                Раздел «Продукты» → «Продукт». В секции «Сырьё и размеры» выберите сырьё из списка.
                Укажите коэффициент — сколько единиц продукта из 1 единицы сырья.
                <br />
                Пример: из 1 листа бумаги A4 (сырьё) получается 2 визитки (продукт) → коэффициент = 2.
              </Paragraph>

              <Paragraph strong>4. Создайте заказ</Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                Добавляете позиции из каталога продуктов. Цена рассчитывается по формуле/скрипту продукта.
                <br />
                <Text type="secondary">Или добавьте произвольную позицию — без привязки к каталогу, с ручным вводом названия и цены.</Text>
              </Paragraph>

              <Paragraph strong>5. Списание сырья происходит автоматически</Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                Когда статус заказа меняется на «В работе», «Готов» или «Отдали» — сырьё автоматически списывается со склада.
                <br />
                Расчёт: система смотрит, сколько единиц сырья нужно для данного количества продукта,
                и вычитает соответствующее количество из остатков на складе.
                <br />
                При откате статуса обратно — сырьё возвращается на склад.
                <br />
                <Text type="secondary">Для ручного списания (с точными параметрами отреза) — см. раздел «Ручное списание сырья» ниже.</Text>
              </Paragraph>

              <Title level={5}>Произвольные позиции в заказах</Title>
              <Paragraph>
                Если клиент заказывает что-то уникальное, что не в каталоге:
              </Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                1. В заказе нажмите «Добавить продукт»
                <br />
                2. НЕ выбирайте продукт из выпадающего списка
                <br />
                3. В появившихся полях введите: название, цену
                <br />
                4. Можно использовать калькулятор — иконка калькулятора рядом с полем цены
                <br />
                5. <Text strong>Укажите сырьё для списания</Text> — выберите материал из списка
                <br />
                6. <Text strong>Укажите размеры отреза</Text> — ширина и высота в мм. Система автоматически рассчитает расход сырья:
                <br />
                &nbsp;&nbsp;&nbsp;• Рулон: (ширина × высота отреза) / (ширина × длина рулона) = доля рулона
                <br />
                &nbsp;&nbsp;&nbsp;• Лист: ceil((ширина × высота отреза) / (ширина × высота листа)) = кол-во листов
                <br />
                7. При смене статуса заказа расчётное количество сырья автоматически спишется со склада
                <br />
                7а. <Text strong>Или</Text> включите чекбокс «Списать со склада вручную» — тогда списание произойдёт вручную со склада (красный !)
                <br />
                8. В истории заказа размеры отреза отображаются рядом с названием
                <br />
                9. Если продукт понадобится повторно — нажмите «в каталог» рядом с названием
              </Paragraph>

              <Title level={5}>Важные нюансы</Title>
              <ul style={{ marginLeft: 16, fontSize: 13 }}>
                <li>Произвольные позиции списывают сырьё, если выбрано сырьё для списания и указаны размеры отреза.</li>
                <li>Коэффициент <b>material_coefficient</b> в карточке продукта — запасной множитель расхода сырья. Используется, если у сырья нет скрипта <code>sheet_stock_calc</code> и нет параметров рулона. Пример: коэффициент 0.5 означает, что на 1 изделие тратится 0.5 листа сырья (т.е. с одного листа получается 2 изделия).</li>
                <li>Для рулонных материалов расчёт идёт по размерам рулона и размерам сырья.</li>
                <li>На складе у каждого продукта/сырья может быть только одна запись (уникальность по product_id или raw_material_id).</li>
                <li>Минимальный остаток на складе — при достижении будет предупреждение.</li>
              </ul>

              <Title level={5}>Ручное списание сырья</Title>
              <Paragraph>
                Помимо автоматического списания при смене статуса заказа, доступно ручное списание —
                когда нужно списать конкретное сырьё с точными параметрами отреза.
              </Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                <Text strong>1. В заказе</Text> — при создании произвольной позиции включите чекбокс <Text strong>«Списать со склада вручную»</Text>.
                <br />
                2. Выберите сырьё для списания, укажите ширину и высоту отреза (мм), количество.
                <br />
                3. Сохраните заказ. Сырьё пока <Text type="danger">не списано</Text> — только помечено.
              </Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                <Text strong>На складе:</Text>
                <br />
                4. Напротив позиции сырья с ожиданием списания появится красный значок <Text type="danger">!</Text>.
                <br />
                5. Нажмите на него — откроется модалка со списком ожидающих списаний.
                <br />
                6. Нажмите <Text strong>«Списать»</Text> — сырьё спишется со склада, создастся запись в истории списаний.
              </Paragraph>
              <Paragraph style={{ marginLeft: 16 }}>
                <Text strong>Отмена:</Text>
                <br />
                • Если списание ещё <Text type="secondary">не выполнено</Text> — кнопка «Отмена» снимает пометку.
                <br />
                • Если списание <Text type="danger">уже выполнено</Text> — кнопка «Отменить списание» вернёт остатки на склад.
              </Paragraph>
              <Paragraph style={{ marginLeft: 16 }} type="secondary">
                Все ручные списания попадают в историю списаний на складе (таб «История») с пометкой «Ручное списание, Заказ #N».
              </Paragraph>
            </div>
          ),
        },
        {
          key: "product",
          label: <span><CodeOutlined /> Справочник переменных для скриптов</span>,
          children: (
            <div>
              <Paragraph type="secondary">
                Все переменные передаются в функцию <Code>calculate(data)</Code> как словарь. Используйте имена из таблицы ниже.
              </Paragraph>
              <VarRow name="quantity" type="int" desc="Количество единиц продукта в заказе" />
              <VarRow name="unit_price" type="float" desc="Цена за единицу из базы данных" />
              <VarRow name="price" type="float" desc="Цена за единицу (алиас unit_price)" />
              <VarRow name="product_name" type="str" desc="Название продукта" />
              <VarRow name="product_id" type="int" desc="ID продукта в базе" />
              <VarRow name="product_category" type="str | None" desc="Категория продукта (может быть null)" />
              <VarRow name="product_unit_type" type="str" desc="Единица измерения: шт (piece), лист (sheet), м² (m2), рулон (roll), комплект (set)" />
              <VarRow name="product_description" type="str | None" desc="Описание продукта (может быть null)" />
            </div>
          ),
        },
        {
          key: "access",
          label: "Доступные функции и библиотеки",
          children: (
            <div>
              <Paragraph>
                В скрипте доступны стандартные функции Python:
              </Paragraph>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <VarRow name="round" type="fn" desc="round(x, n) — округление" />
                <VarRow name="int" type="fn" desc="int(x) — целое число" />
                <VarRow name="float" type="fn" desc="float(x) — вещественное число" />
                <VarRow name="abs" type="fn" desc="abs(x) — модуль числа" />
                <VarRow name="min" type="fn" desc="min(a, b) — минимум" />
                <VarRow name="max" type="fn" desc="max(a, b) — максимум" />
                <VarRow name="len" type="fn" desc="len(x) — длина" />
                <VarRow name="sum" type="fn" desc="sum(x) — сумма списка" />
                <VarRow name="math" type="module" desc="Модуль math (pi, sqrt, ceil, floor, log и т.д.)" />
                <VarRow name="json" type="module" desc="Модуль json (json.loads, json.dumps)" />
              </div>
              <Paragraph style={{ marginTop: 12 }} type="secondary">
                Запрещены: open, exec, eval, __import__, os, sys, subprocess, shutil, socket, http, urllib
              </Paragraph>
            </div>
          ),
        },
        {
          key: "example",
          label: "Примеры скриптов",
          children: (
            <div>
              <Title level={5}>Скидка за объём</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`def calculate(data):
    q = data["quantity"]
    p = data["unit_price"]
    if q >= 1000:
        return q * p * 0.8
    elif q >= 500:
        return q * p * 0.9
    return q * p`}</pre>

              <Title level={5}>Наценка по категории</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`def calculate(data):
    q = data["quantity"]
    p = data["unit_price"]
    cat = data["product_category"]
    if cat == "premium":
        return q * p * 1.5
    return q * p`}</pre>

              <Title level={5}>Округление вверх (минимум заказа)</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`import math

def calculate(data):
    q = data["quantity"]
    p = data["unit_price"]
    min_order = 50
    effective_q = max(q, min_order)
    return effective_q * p`}</pre>

              <Title level={5}>Базовая цена + доставка</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`def calculate(data):
    q = data["quantity"]
    p = data["unit_price"]
    base = q * p
    delivery = 500 if base < 5000 else 0
    return base + delivery`}</pre>
            </div>
          ),
        },
        {
          key: "stock_calc",
          label: <span><ExperimentOutlined /> Скрипты расчёта расхода сырья</span>,
          children: (
            <div>
              <Paragraph>
                Скрипты расчёта расхода сырья позволяют кастомизировать списание материалов со склада.
                Привязываются к складской позиции в поле «Скрипт расчёта».
              </Paragraph>

              <Title level={5}>Переменные</Title>
              <Paragraph type="secondary">
                Функция <Code>calculate(data)</Code> получает словарь:
              </Paragraph>
              <VarRow name="quantity" type="int" desc="Количество единиц продукта в заказе" />
              <VarRow name="cut_width_mm" type="float" desc="Ширина отреза, мм" />
              <VarRow name="cut_height_mm" type="float" desc="Высота отреза, мм" />
              <VarRow name="roll_width_m" type="float" desc="Ширина рулона, м (для рулонных материалов)" />
              <VarRow name="roll_length_m" type="float" desc="Длина рулона, м (для рулонных материалов)" />
              <VarRow name="width_mm" type="float" desc="Ширина листа, мм (для листовых материалов)" />
              <VarRow name="height_mm" type="float" desc="Высота листа, мм (для листовых материалов)" />
              <VarRow name="material_coefficient" type="float" desc="Коэффициент из карточки продукта" />

              <Title level={5}>Формат возвращаемого значения</Title>
              <Paragraph type="secondary">
                Функция <Code>calculate(data)</Code> должна вернуть <Code>float</Code> — количество единиц сырья для списания.
              </Paragraph>

              <Title level={5}>Пример: рулонный материал</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`import math

def calculate(data):
    cut_w = data["cut_width_mm"]
    cut_h = data["cut_height_mm"]
    qty = data["quantity"]
    roll_w = data["roll_width_m"] * 1000  # м → мм

    fit_a = int(roll_w // cut_w)
    fit_b = int(roll_w // cut_h)
    options = []
    if fit_a >= 1:
        options.append((cut_h / 1000) / fit_a)
    if fit_b >= 1:
        options.append((cut_w / 1000) / fit_b)
    if not options:
        return 0
    return round(min(options) * qty, 6)`}</pre>

              <Title level={5}>Пример: листовый материал</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`def calculate(data):
    cut_w = data["cut_width_mm"]
    cut_h = data["cut_height_mm"]
    qty = data["quantity"]
    sw = data["width_mm"]
    sh = data["height_mm"]

    fit_a = int(sw // cut_w) * int(sh // cut_h)
    fit_b = int(sw // cut_h) * int(sh // cut_w)
    fit = max(fit_a, fit_b)
    if fit < 1:
        return 0
    return round((1.0 / fit) * qty, 6)`}</pre>
            </div>
          ),
        },
        {
          key: "display",
          label: <span><ExperimentOutlined /> Скрипты форматирования остатков</span>,
          children: (
            <div>
              <Paragraph>
                Скрипты форматирования позволяют кастомизировать отображение остатков рулонных материалов на складе и в заказах.
              </Paragraph>

              <Title level={5}>Как использовать</Title>
              <ol style={{ marginLeft: 16, fontSize: 13 }}>
                <li>Создайте скрипт форматирования в разделе «Скрипты» (секция «Скрипты расчёта цены»)</li>
                <li>Откройте карточку складской позиции (раздел «Склад») и выберите скрипт в поле «Скрипт форматирования»</li>
                <li>Отображение остатков на складе и в заказах будет использовать ваш скрипт</li>
              </ol>

              <Title level={5}>Переменные для скрипта форматирования</Title>
              <Paragraph type="secondary">
                Функция <Code>format(data)</Code> получает словарь с данными о рулоне:
              </Paragraph>
              <VarRow name="totalMeters" type="float" desc="Общее количество метров на складе" />
              <VarRow name="totalQuantity" type="float" desc="То же, что totalMeters (алиас)" />
              <VarRow name="rollLength" type="float" desc="Длина рулона в метрах (roll_length_m)" />
              <VarRow name="rolls" type="int" desc="Количество полных рулонов (floor(totalMeters / rollLength))" />
              <VarRow name="leftover" type="float" desc="Остаток метров от последнего рулона (totalMeters % rollLength)" />
              <VarRow name="materialName" type="str" desc="Название материала" />
              <VarRow name="width_mm" type="float" desc="Ширина листа, мм (0 для рулонных)" />
              <VarRow name="height_mm" type="float" desc="Высота листа, мм (0 для рулонных)" />
              <VarRow name="productLabels" type="list[str]" desc="Список продуктов с размерами (только в заказах)" />

              <Title level={5}>Формат возвращаемого значения</Title>
              <Paragraph type="secondary">
                Функция <Code>format(data)</Code> должна вернуть словарь с двумя ключами:
              </Paragraph>
              <VarRow name="main" type="str" desc="Основная строка отображения (жирным шрифтом)" />
              <VarRow name="sub" type="str" desc="Дополнительная строка (серым мелким шрифтом)" />

              <Title level={5}>Пример скрипта форматирования</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`def format(data):
    rolls = data["rolls"]
    leftover = data["leftover"]
    total = data["totalMeters"]
    roll_len = data["rollLength"]

    # Склонение слова "рулон"
    roll_word = "рулон" if rolls == 1 else "рулона" if 2 <= rolls <= 4 else "рулонов"

    # Основная строка: "3 рулона + 47 м"
    main = f"{rolls} {roll_word}"
    if leftover > 0:
        main += f" + {leftover} м"

    # Дополнительная строка: "Остаток: 197 м (50м/рулон)"
    sub = f"Остаток: {total} м ({roll_len}м/рулон)"

    return {"main": main, "sub": sub}`}</pre>

              <Title level={5}>Пример с размерами продуктов (для заказов)</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`def format(data):
    rolls = data["rolls"]
    leftover = data["leftover"]
    total = data["totalMeters"]
    roll_len = data["rollLength"]
    products = data.get("productLabels", [])

    roll_word = "рулон" if rolls == 1 else "рулона" if 2 <= rolls <= 4 else "рулонов"

    main = f"{rolls} {roll_word}"
    if leftover > 0:
        main += f" + {leftover} м"

    sub = f"Остаток: {total} м"
    if products:
        sub += f" | Продукты: {', '.join(products)}"

    return {"main": main, "sub": sub}`}</pre>

              <Title level={5}>Пример без остатка (точное количество)</Title>
              <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto" }}>{`def format(data):
    rolls = data["rolls"]
    leftover = data["leftover"]
    total = data["totalMeters"]
    roll_len = data["rollLength"]

    roll_word = "рулон" if rolls == 1 else "рулона" if 2 <= rolls <= 4 else "рулонов"

    if leftover == 0:
        main = f"{rolls} {roll_word}"
        sub = f"Ровно {total} м"
    else:
        main = f"{rolls} {roll_word} + {leftover} м"
        sub = f"Всего: {total} м"

    return {"main": main, "sub": sub}`}</pre>
            </div>
          ),
        },
      ]} />
    </div>
  );
}
