import { z } from 'zod';

// Superadmin: approve/reject/suspend pengguna, dan/atau promosikan ke role admin.
export const userUpdateSchema = z
  .object({
    status: z.enum(['pending', 'active', 'suspended', 'rejected']).optional(),
    role: z.enum(['admin', 'viewer']).optional(),
  })
  .refine((v) => v.status !== undefined || v.role !== undefined, 'Isi minimal status atau role');

// Superadmin: Pengaturan Dinamis Redis (MAINTENANCE_MODE, RATE_LIMIT_PER_MIN, proteksi Lua,
// Webhook Secret, API Key). Semua field opsional: hanya field yang dikirim yang diperbarui.
export const settingsUpdateSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  rateLimitPerMin: z.number().int().min(10).max(100_000).optional(),
  luaObfuscationEnabled: z.boolean().optional(),
  webhookSecret: z.string().trim().min(8, 'Minimal 8 karakter').max(256).optional().or(z.literal('')),
});

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
