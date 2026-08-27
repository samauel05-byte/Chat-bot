import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { z } from "zod";

import { invoice606Schema } from "../lib/dgii/schema606";
import { invoice607Schema } from "../lib/dgii/schema607";
import { invoiceIR17Schema } from "../lib/dgii/schemaIR17";
import { addExcelDropdown, calculatedInvoiceTotal, excelColumnsFor, EXCEL_AMOUNT_FORMAT, has606Retention, invoiceRowColor, normalizeDgiiCode } from "../lib/dgii/generateReport";
import { FORMA_PAGO_606, TIPO_BIENES_SERVICIOS_606 } from "../lib/dgii/catalogs";

const schemas = {
  "Formato 606": invoice606Schema,
  "Formato 607": invoice607Schema,
  "IR-17": invoiceIR17Schema,
};

for (const [name, schema] of Object.entries(schemas)) {
  test(`${name}: todos los campos son obligatorios para OpenAI`, () => {
    const jsonSchema = z.toJSONSchema(schema) as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    const keys = Object.keys(jsonSchema.properties);
    assert.deepEqual(new Set(jsonSchema.required), new Set(keys));
  });
}

test("Formato 606: fechas de retención aceptan vacío", () => {
  const result = invoice606Schema.safeParse({
    proveedor: "Proveedor de prueba",
    moneda: "DOP",
    rncCedula: "101010101",
    tipoId: "1",
    tipoBienesServicios: "02",
    ncf: "B0100000001",
    ncfModificado: "",
    fechaComprobante: "202607",
    diaComprobante: "01",
    fechaPago: "",
    diaPago: "",
    montoFacturadoServicios: 0,
    montoFacturadoBienes: 100,
    totalMontoFacturado: 100,
    itbisFacturado: 18,
    itbisRetenido: 0,
    itbisProporcionalidad: 0,
    itbisLlevadoCosto: 0,
    itbisPorAdelantar: 18,
    itbisPercibidoCompras: 0,
    tipoRetencionIsr: "00",
    montoRetencionRenta: 0,
    isrPercibidoCompras: 0,
    isc: 0,
    otrosImpuestos: 0,
    montoPropinaLegal: 0,
    formaPago: "01",
  });
  assert.equal(result.success, true);
});

test("Formato 606: los códigos de bienes conservan el cero a la izquierda", () => {
  assert.equal(normalizeDgiiCode("2", TIPO_BIENES_SERVICIOS_606), "02");
  assert.equal(normalizeDgiiCode("02 - GASTOS POR TRABAJOS, SUMINISTROS Y SERVICIOS", TIPO_BIENES_SERVICIOS_606), "02");
});

test("Formato 606: 00 - NINGUNA queda vacío si no existe retención", () => {
  assert.equal(
    has606Retention({ tipoRetencionIsr: "00 - NINGUNA", itbisRetenido: 0, montoRetencionRenta: 0 }),
    false
  );
  assert.equal(
    has606Retention({ tipoRetencionIsr: "00", itbisRetenido: 18, montoRetencionRenta: 0 }),
    true
  );
});

test("Excel: una factura en USD se resalta en verde", () => {
  assert.equal(invoiceRowColor("USD", 0), "FFC6EFCE");
  assert.equal(invoiceRowColor("DOP", 0), "FFDDEBF7");
});

test("Excel: los montos conservan miles y dos decimales al editar", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("606");
  sheet.getColumn(1).numFmt = EXCEL_AMOUNT_FORMAT;
  sheet.getCell("A1").value = 1675.5;

  const saved = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(saved);
  const cell = reloaded.getWorksheet("606")!.getCell("A1");

  assert.equal(cell.numFmt, "#,##0.00");
  assert.equal(cell.value, 1675.5);
});

test("Excel: la sumatoria parte de los importes correctos", () => {
  assert.equal(
    calculatedInvoiceTotal("606", { montoFacturadoServicios: 1675.5, montoFacturadoBienes: 324.5 }),
    2000
  );
  assert.equal(calculatedInvoiceTotal("607", { montoFacturado: 1675.5 }), 1675.5);
});

test("Excel: Tipo Id no aparece en la hoja visible", () => {
  assert.equal(excelColumnsFor("606").some((column) => column.key === "tipoId"), false);
  assert.equal(excelColumnsFor("607").some((column) => column.key === "tipoId"), false);
});

test("Excel 606: los menús desplegables comienzan en la primera factura", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("DIGITAR");
  workbook.addWorksheet("Listas DGII");
  addExcelDropdown(sheet, 5, 1, TIPO_BIENES_SERVICIOS_606, 10, 10);

  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const validation = reloaded.getWorksheet("DIGITAR")?.getCell("E10").dataValidation;
  assert.equal(validation?.type, "list");
  assert.notEqual(validation?.showErrorMessage, true);
  assert.equal(validation?.allowBlank, true);
  assert.deepEqual(validation?.formulae, ["DGII_LISTA_1"]);
  assert.equal(reloaded.getWorksheet("DIGITAR")?.getCell("E1009").dataValidation.type, "list");
});

test("Excel 606: Forma de Pago usa un menú compatible dentro de la celda", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("DIGITAR");
  workbook.addWorksheet("Listas DGII");
  addExcelDropdown(sheet, 27, 1, FORMA_PAGO_606, 10, 10);

  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const validation = reloaded.getWorksheet("DIGITAR")?.getCell("AA10").dataValidation;
  assert.equal(validation?.type, "list");
  assert.match(String(validation?.formulae?.[0]), /^"01 - EFECTIVO,/);
});
