package api

import (
	"time"

	"encore.dev/types/uuid"
)

type HealthResponse struct {
	Status string    `json:"status"`
	Time   time.Time `json:"time"`
	Uptime string    `json:"uptime"`
}

type GreetingResponse struct {
	Message string `json:"message"`
}

type CreateMessageRequest struct {
	ClientID string `json:"client_id"`
	Body     string `json:"body"`
}

type Message struct {
	ID        uuid.UUID `json:"id"`
	ClientID  string    `json:"client_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}
