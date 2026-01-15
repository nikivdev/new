package api

import (
	"time"

	"encore.dev/config"
	"encore.dev/rlog"
)

type Config struct {
	ReadOnly         config.Bool
	DefaultGreeting  config.String
	MaxMessageLength config.Int
}

var cfg = config.Load[*Config]()

//encore:service
type Service struct {
	log       rlog.Ctx
	store     *messageStore
	startedAt time.Time
}

func initService() (*Service, error) {
	return &Service{
		log:       rlog.With("service", "api"),
		store:     newMessageStore(),
		startedAt: time.Now().UTC(),
	}, nil
}
