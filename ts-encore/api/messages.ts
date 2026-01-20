import { api, APIError } from "encore.dev/api";

interface Message {
  id: string;
  client_id: string;
  body: string;
  created_at: string;
}

interface CreateMessageRequest {
  client_id: string;
  body: string;
}

const messages = new Map<string, Message>();
let messageCounter = 0;

export const createMessage = api(
  { expose: true, method: "POST", path: "/v1/messages" },
  async (req: CreateMessageRequest): Promise<Message> => {
    if (!req || !req.client_id || !req.client_id.trim()) {
      throw APIError.invalidArgument("client_id is required");
    }
    if (!req.body || !req.body.trim()) {
      throw APIError.invalidArgument("body is required");
    }

    messageCounter += 1;
    const id = `msg_${messageCounter}`;
    const message: Message = {
      id,
      client_id: req.client_id.trim(),
      body: req.body.trim(),
      created_at: new Date().toISOString(),
    };

    messages.set(id, message);
    return message;
  }
);

export const getMessage = api(
  { expose: true, method: "GET", path: "/v1/messages/:id" },
  async ({ id }: { id: string }): Promise<Message> => {
    const message = messages.get(id);
    if (!message) {
      throw APIError.notFound("message not found");
    }
    return message;
  }
);
