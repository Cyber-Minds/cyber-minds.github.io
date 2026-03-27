package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/docker/docker/client"
	"github.com/gorilla/mux"
)

func TestNormalizeWorkspacePath(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "valid relative path", input: "src/main.go", want: "src/main.go"},
		{name: "trim leading dot slash", input: "./docs/readme.md", want: "docs/readme.md"},
		{name: "empty", input: "   ", wantErr: true},
		{name: "absolute path", input: "/etc/passwd", wantErr: true},
		{name: "parent traversal", input: "../secret.txt", wantErr: true},
		{name: "dot only", input: ".", wantErr: true},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeWorkspacePath(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for input %q, got none", tc.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error for input %q: %v", tc.input, err)
			}
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

func TestShellQuote(t *testing.T) {
	input := "abc'def"
	got := shellQuote(input)
	want := `'abc'"'"'def'`
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestListSessionFiles(t *testing.T) {
	resetProgressAndSessionsForTest()
	addTestSession("s-files")

	originalExec := execInContainerFn
	defer func() {
		execInContainerFn = originalExec
	}()

	execInContainerFn = func(ctx context.Context, cli *client.Client, containerID string, cmd []string) (string, string, error) {
		return "a.txt\t12\ninvalid\nb/c.js\t9\n", "", nil
	}

	req := httptest.NewRequest(http.MethodGet, "/api/session/s-files/files", nil)
	req = mux.SetURLVars(req, map[string]string{"sessionId": "s-files"})
	rr := httptest.NewRecorder()
	listSessionFiles(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp struct {
		Files []fileEntry `json:"files"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(resp.Files))
	}
	if resp.Files[0].Path != "a.txt" || resp.Files[0].Size != 12 {
		t.Fatalf("unexpected first file entry: %#v", resp.Files[0])
	}
}

func TestReadSessionFile(t *testing.T) {
	resetProgressAndSessionsForTest()
	addTestSession("s-read")

	originalExec := execInContainerFn
	defer func() {
		execInContainerFn = originalExec
	}()

	execInContainerFn = func(ctx context.Context, cli *client.Client, containerID string, cmd []string) (string, string, error) {
		return "line1\nline2\n", "", nil
	}

	req := httptest.NewRequest(http.MethodGet, "/api/session/s-read/file?path=src/app.js", nil)
	req = mux.SetURLVars(req, map[string]string{"sessionId": "s-read"})
	rr := httptest.NewRecorder()
	readSessionFile(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["path"] != "src/app.js" {
		t.Fatalf("expected path src/app.js, got %q", resp["path"])
	}
	if resp["content"] == "" {
		t.Fatal("expected non-empty content")
	}
}

func TestReadSessionFileExecFailure(t *testing.T) {
	resetProgressAndSessionsForTest()
	addTestSession("s-read-err")

	originalExec := execInContainerFn
	defer func() {
		execInContainerFn = originalExec
	}()

	execInContainerFn = func(ctx context.Context, cli *client.Client, containerID string, cmd []string) (string, string, error) {
		return "", "missing", context.DeadlineExceeded
	}

	req := httptest.NewRequest(http.MethodGet, "/api/session/s-read-err/file?path=src/app.js", nil)
	req = mux.SetURLVars(req, map[string]string{"sessionId": "s-read-err"})
	rr := httptest.NewRecorder()
	readSessionFile(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rr.Code)
	}
}

func TestListSessionFilesExecFailure(t *testing.T) {
	resetProgressAndSessionsForTest()
	addTestSession("s-files-err")

	originalExec := execInContainerFn
	defer func() {
		execInContainerFn = originalExec
	}()

	execInContainerFn = func(ctx context.Context, cli *client.Client, containerID string, cmd []string) (string, string, error) {
		return "", "", context.DeadlineExceeded
	}

	req := httptest.NewRequest(http.MethodGet, "/api/session/s-files-err/files", nil)
	req = mux.SetURLVars(req, map[string]string{"sessionId": "s-files-err"})
	rr := httptest.NewRecorder()
	listSessionFiles(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rr.Code)
	}
}

func TestAddTestSessionHelperSanity(t *testing.T) {
	resetProgressAndSessionsForTest()
	addTestSession("helper")
	s, ok := getSession("helper")
	if !ok || s.ID != "helper" || s.CreatedAt.IsZero() {
		t.Fatal("test helper did not create expected session")
	}
	if time.Since(s.CreatedAt) > time.Minute {
		t.Fatal("unexpected stale session timestamp")
	}
}
