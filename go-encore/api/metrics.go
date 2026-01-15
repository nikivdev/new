package api

import (
	"encore.dev/beta/errs"
	"encore.dev/metrics"
)

type requestLabels struct {
	Endpoint string
	Method   string
	Status   string
}

type inflightLabels struct {
	Endpoint string
}

var (
	requestsTotal    = metrics.NewCounterGroup[requestLabels, uint64]("api_requests_total", metrics.CounterConfig{})
	inflightRequests = metrics.NewGaugeGroup[inflightLabels, int64]("api_inflight_requests", metrics.GaugeConfig{})
)

func (s *Service) observe(endpoint, method string) func(err *error) {
	labels := inflightLabels{Endpoint: endpoint}
	inflightRequests.With(labels).Add(1)

	return func(err *error) {
		inflightRequests.With(labels).Add(-1)

		status := "ok"
		if err != nil && *err != nil {
			status = errs.Code(*err).String()
		}

		requestsTotal.With(requestLabels{
			Endpoint: endpoint,
			Method:   method,
			Status:   status,
		}).Increment()
	}
}
