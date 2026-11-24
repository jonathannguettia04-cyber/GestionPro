import { z } from "zod";

export const SECTORS = [
  { value: "printing", label: "Imprimerie et communication visuelle" },
  { value: "events", label: "Événementiel et organisation d'événements" },
  { value: "other", label: "Autre secteur" },
] as const;

export const TIMEZONES = ["Africa/Abidjan", "Africa/Dakar", "Africa/Lagos", "Africa/Douala", "Africa/Casablanca", "Europe/Paris", "UTC"] as const;
export const CURRENCIES = ["XOF", "XAF", "EUR"] as const;
export const INVITE_ROLES = [
  { value: "admin", label: "Administrateur" },
  { value: "department_manager", label: "Responsable de département" },
  { value: "member", label: "Collaborateur" },
] as const;

export const organizationPayloadSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères.").max(120),
  sector: z.enum(["printing", "events", "other"], { errorMap: () => ({ message: "Choisissez un secteur." }) }),
  phone: z.string().trim().max(30).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail professionnel invalide.").max(254)]).default(""),
  currency: z.enum(CURRENCIES).default("XOF"),
  timezone: z.enum(TIMEZONES).default("Africa/Abidjan"),
  billing: z.object({
    quote_prefix: z.string().trim().min(1).max(10).default("DEV"),
    invoice_prefix: z.string().trim().min(1).max(10).default("FAC"),
    default_tax_rate: z.coerce.number().min(0, "Taux invalide.").max(100, "Taux invalide."),
    payment_terms_days: z.coerce.number().int().min(0).max(365),
  }),
  departments: z
    .array(z.object({
      name: z.string().trim().max(80),
      description: z.string().trim().max(500).optional().default(""),
      manager_is_me: z.boolean().default(false),
    }))
    .max(20),
  invites: z
    .array(z.object({
      email: z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail d'invitation invalide.")]),
      role: z.enum(["admin", "department_manager", "member"]),
    }))
    .max(20),
});

export type OrganizationPayload = z.infer<typeof organizationPayloadSchema>;
