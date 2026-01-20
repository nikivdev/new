import { api } from "encore.dev/api";

export const healthz = api(
  { expose: true, method: "GET", path: "/healthz" },
  async (): Promise<HealthResponse> => {
    return { status: "ok", time: new Date().toISOString() };
  }
);

interface HealthResponse {
  status: "ok";
  time: string;
}
