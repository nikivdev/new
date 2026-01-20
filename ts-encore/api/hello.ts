import { api, APIError } from "encore.dev/api";

export const hello = api(
  { expose: true, method: "GET", path: "/v1/hello/:name" },
  async ({ name }: { name: string }): Promise<GreetingResponse> => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw APIError.invalidArgument("name is required");
    }

    return { message: `Hello, ${trimmed}` };
  }
);

interface GreetingResponse {
  message: string;
}
