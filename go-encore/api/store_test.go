package api

import "testing"

func TestMessageStoreCreateGet(t *testing.T) {
	store := newMessageStore()

	msg, err := store.Create("client-a", "hello world")
	if err != nil {
		t.Fatalf("create message: %v", err)
	}

	got, ok := store.Get(msg.ID)
	if !ok {
		t.Fatalf("expected message to be found")
	}

	if got.ClientID != msg.ClientID {
		t.Fatalf("client id mismatch: got %q want %q", got.ClientID, msg.ClientID)
	}

	if got.Body != msg.Body {
		t.Fatalf("body mismatch: got %q want %q", got.Body, msg.Body)
	}
}
