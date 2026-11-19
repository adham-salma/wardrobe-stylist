import { db } from "@/db";
import { users } from "@/db/schema";

/** Keeps the member on first sight, and their latest email. */
export async function rememberUser(user: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}
