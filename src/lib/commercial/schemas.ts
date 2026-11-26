import { z } from "zod";

export const itemsSchema = z.array(z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().positive().max(1e9),
  unit: z.string().trim().max(20),
  unit_price: z.number().min(0).max(1e12),
  discount_rate: z.number().min(0).max(100),
  tax_rate: z.number().min(0).max(100),
  catalog_item_id: z.string().uuid().nullable().optional(),
})).min(1, "Ajoutez au moins une ligne.").max(100);

export function parseItems(raw: FormDataEntryValue | null) {
  try { return itemsSchema.safeParse(JSON.parse(String(raw ?? "[]"))); } catch { return itemsSchema.safeParse(null); }
}
