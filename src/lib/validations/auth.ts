import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(254);
const password = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(128)
  .regex(/[a-zA-Z]/, "Ajoutez au moins une lettre.")
  .regex(/[0-9]/, "Ajoutez au moins un chiffre.");

export const loginSchema = z.object({ email, password: z.string().min(1, "Saisissez votre mot de passe.") });

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Saisissez votre nom complet.").max(120),
    email,
    password,
    confirmPassword: z.string(),
    terms: z.literal("on", { errorMap: () => ({ message: "Vous devez accepter les conditions d'utilisation." }) }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Les mots de passe ne correspondent pas.",
  });

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Les mots de passe ne correspondent pas.",
  });
