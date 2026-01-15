package api

import (
	"sync"
	"time"

	"encore.dev/types/uuid"
)

type messageStore struct {
	mu    sync.RWMutex
	items map[uuid.UUID]Message
}

func newMessageStore() *messageStore {
	return &messageStore{
		items: make(map[uuid.UUID]Message),
	}
}

func (s *messageStore) Create(clientID, body string) (Message, error) {
	id, err := uuid.NewV4()
	if err != nil {
		return Message{}, err
	}

	msg := Message{
		ID:        id,
		ClientID:  clientID,
		Body:      body,
		CreatedAt: time.Now().UTC(),
	}

	s.mu.Lock()
	s.items[id] = msg
	s.mu.Unlock()

	return msg, nil
}

func (s *messageStore) Get(id uuid.UUID) (Message, bool) {
	s.mu.RLock()
	msg, ok := s.items[id]
	s.mu.RUnlock()
	return msg, ok
}
