import { SQLDatabase } from "encore.dev/storage/sqldb";

// Billing database for accounts + subscriptions.
export const db = new SQLDatabase("billing", {
  migrations: "./migrations",
});
