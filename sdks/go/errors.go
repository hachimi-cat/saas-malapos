package malapos

import "fmt"

// Error is the single error type returned by every call in this package. Code carries
// the API envelope's error.code (UPPER_SNAKE_CASE: NOT_FOUND, VALIDATION_ERROR,
// AUTH_REQUIRED, …) or an SDK-side code (NETWORK_ERROR, INVALID_RESPONSE,
// SERIALIZE_FAILED). Status is the HTTP status (0 before any response).
type Error struct {
	Status    int
	Code      string
	Message   string
	RequestID string
	Param     string
}

func (e *Error) Error() string {
	return fmt.Sprintf("malapos: %s: %s", e.Code, e.Message)
}
