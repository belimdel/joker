import { hash, verify } from '@node-rs/argon2';

// argon2id — seul algorithme autorisé (principe 8 du master plan).
// @node-rs/argon2 est pré-compilé (pas de node-gyp) et compatible Render.
const OPTIONS = {
  algorithm: 2 as const, // Argon2id
  memoryCost: 65536,      // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return verify(hash, password);
}
