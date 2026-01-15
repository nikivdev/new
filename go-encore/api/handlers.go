package api

import (
	"context"
	"strings"
	"time"

	"encore.dev/beta/errs"
	"encore.dev/types/uuid"
)

//encore:api public method=GET path=/healthz
func (s *Service) Health(ctx context.Context) (_ *HealthResponse, err error) {
	done := s.observe("Health", "GET")
	defer done(&err)

	now := time.Now().UTC()
	return &HealthResponse{
		Status: "ok",
		Time:   now,
		Uptime: now.Sub(s.startedAt).String(),
	}, nil
}

//encore:api public method=GET path=/v1/hello/:name
func (s *Service) Hello(ctx context.Context, name string) (_ *GreetingResponse, err error) {
	done := s.observe("Hello", "GET")
	defer done(&err)

	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "name is required",
		}
	}

	base := cfg.DefaultGreeting()
	if base == "" {
		base = "Hello"
	}

	s.log.Info("greeting generated", "name", trimmed)
	return &GreetingResponse{
		Message: base + ", " + trimmed,
	}, nil
}

//encore:api public method=POST path=/v1/messages
func (s *Service) CreateMessage(ctx context.Context, req *CreateMessageRequest) (_ *Message, err error) {
	done := s.observe("CreateMessage", "POST")
	defer done(&err)

	if cfg.ReadOnly() {
		return nil, &errs.Error{
			Code:    errs.FailedPrecondition,
			Message: "read-only mode enabled",
		}
	}

	if req == nil {
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "request body required",
		}
	}

	clientID := strings.TrimSpace(req.ClientID)
	if clientID == "" {
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "client_id is required",
		}
	}

	body := strings.TrimSpace(req.Body)
	if body == "" {
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "body is required",
		}
	}

	if maxLen := cfg.MaxMessageLength(); maxLen > 0 && len(body) > maxLen {
		return nil, &errs.Error{
			Code:    errs.InvalidArgument,
			Message: "body exceeds max length",
		}
	}

	msg, err := s.store.Create(clientID, body)
	if err != nil {
		s.log.Error("message creation failed", "err", err, "client_id", clientID)
		return nil, errs.WrapCode(err, errs.Internal, "failed to create message")
	}

	s.log.Info("message created", "message_id", msg.ID, "client_id", clientID)
	return &msg, nil
}

//encore:api public method=GET path=/v1/messages/:id
func (s *Service) GetMessage(ctx context.Context, id uuid.UUID) (_ *Message, err error) {
	done := s.observe("GetMessage", "GET")
	defer done(&err)

	msg, ok := s.store.Get(id)
	if !ok {
		return nil, &errs.Error{
			Code:    errs.NotFound,
			Message: "message not found",
		}
	}

	return &msg, nil
}
