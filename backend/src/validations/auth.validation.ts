import { z } from 'zod';

export const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'username must be at least 3 characters')
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'username may contain letters, digits, _ . -'),
  password: z.string().min(6, 'password must be at least 6 characters').max(256),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
