import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { invoice606Schema } from "../lib/dgii/schema606";
import { invoice607Schema } from "../lib/dgii/schema607";
import { invoiceIR17Schema } from "../lib/dgii/schemaIR17";

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
