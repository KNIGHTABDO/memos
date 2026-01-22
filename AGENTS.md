# Memos Codebase Guide for AI Agents

This document provides comprehensive guidance for AI agents working with the Memos codebase. It covers architecture, workflows, conventions, and key patterns.

## Project Overview

Memos is a self-hosted knowledge management platform built with:
- **Backend:** Go 1.25 with gRPC + Connect RPC
- **Frontend:** React 18.3 + TypeScript + Vite 7
- **Databases:** SQLite (default), MySQL, PostgreSQL
- **Protocol:** Protocol Buffers (v2) with buf for code generation
- **API Layer:** Dual protocol - Connect RPC (browsers) + gRPC-Gateway (REST)

## 🚨 YouNote Rebrand Protocol (Active)

**Status:** Executed (UI/Text Level)
**Codename:** Protocol 0 / YouNote

The project has been rebranded from "Memos" to **"YouNote"**.
Future agents must adhere to the following **Strict Rules**:

1.  **Terminology**:
    *   **App Name**: "Memos" -> **"YouNote"** (in UI/Docs).
    *   **Entity**: "Memo" -> **"Note"** (in UI text).
    *   **Files/Code**: **DO NOT RENAME**. The package name `memos`, Go module `github.com/usememos/memos`, and API `memos.api.v1` **MUST** remain `memos` to preserve build integrity.

2.  **Asset Changes**:
    *   Logo has been updated to "Nano Banana Pro" style (Glassmorphism 'Y').
    *   `web/public/logo.webp` and `web/public/full-logo.webp` are the source of truth for assets.

3.  **Known Fixes**:
    *   `server/router/api/v1/connect_interceptors.go`: Added defensive nil-check for `resp` in `MetadataInterceptor` to prevent 500 errors. Do not revert this.

---

## Architecture

### Backend Architecture

```
cmd/memos/              # Entry point
└── main.go             # Cobra CLI, profile setup, server initialization

server/
├── server.go           # Echo HTTP server, healthz, background runners
├── auth/               # Authentication (JWT, PAT, session)
├── router/
│   ├── api/v1/        # gRPC service implementations
│   │   ├── v1.go      # Service registration, gateway & Connect setup
│   │   ├── acl_config.go   # Public endpoints whitelist
│   │   ├── connect_services.go  # Connect RPC handlers
│   │   ├── connect_interceptors.go # Auth, logging, recovery
│   │   └── *_service.go    # Individual services (memo, user, etc.)
│   ├── frontend/       # Static file serving (SPA)
│   ├── fileserver/     # Native HTTP file serving for media
│   └── rss/           # RSS feed generation
└── runner/
    ├── memopayload/    # Memo payload processing (tags, links, tasks)
    └── s3presign/     # S3 presigned URL management

store/                  # Data layer with caching
├── driver.go           # Driver interface (database operations)
├── store.go           # Store wrapper with cache layer
├── cache.go           # In-memory caching (instance settings, users)
├── migrator.go        # Database migrations
├── db/
│   ├── db.go          # Driver factory
│   ├── sqlite/        # SQLite implementation
│   ├── mysql/         # MySQL implementation
│   └── postgres/      # PostgreSQL implementation
└── migration/         # SQL migration files (embedded)

proto/                  # Protocol Buffer definitions
├── api/v1/           # API v1 service definitions
└── gen/               # Generated Go & TypeScript code
```

### Frontend Architecture

```
web/
├── src/
│   ├── components/     # React components
│   ├── contexts/       # React Context (client state)
│   │   ├── AuthContext.tsx      # Current user, auth state
│   │   ├── ViewContext.tsx      # Layout, sort order
│   │   └── MemoFilterContext.tsx # Filters, shortcuts
│   ├── hooks/          # React Query hooks (server state)
│   │   ├── useMemoQueries.ts    # Memo CRUD, pagination
│   │   ├── useUserQueries.ts    # User operations
│   │   ├── useAttachmentQueries.ts # Attachment operations
│   │   └── ...
│   ├── lib/            # Utilities
│   │   ├── query-client.ts  # React Query v5 client
│   │   └── connect.ts       # Connect RPC client setup
│   ├── pages/          # Page components
│   └── types/proto/    # Generated TypeScript from .proto
├── package.json        # Dependencies
└── vite.config.mts     # Vite config with dev proxy

plugin/                 # Backend plugins
├── scheduler/         # Cron jobs
├── email/            # Email delivery
├── filter/           # CEL filter expressions
├── webhook/          # Webhook dispatch
├── markdown/         # Markdown parsing & rendering
├── httpgetter/        # HTTP fetching (metadata, images)
└── storage/s3/       # S3 storage backend
```

## Key Architectural Patterns

### 1. API Layer: Dual Protocol

**Connect RPC (Browser Clients):**
- Protocol: `connectrpc.com/connect`
- Base path: `/memos.api.v1.*`
- Interceptor chain: Metadata → Logging → Recovery → Auth
- Returns type-safe responses to React frontend
- See: `server/router/api/v1/connect_interceptors.go:177-227`

**gRPC-Gateway (REST API):**
- Protocol: Standard HTTP/JSON
- Base path: `/api/v1/*`
- Uses same service implementations as Connect
- Useful for external tools, CLI clients
- See: `server/router/api/v1/v1.go:52-96`

**Authentication:**
- JWT Access Tokens (V2): Stateless, 15-min expiration, verified via `AuthenticateByAccessTokenV2`
- Personal Access Tokens (PAT): Stateful, long-lived, validated against database
- Both use `Authorization: Bearer <token>` header
- See: `server/auth/authenticator.go:17-166`

### 2. Store Layer: Interface Pattern

All database operations go through the `Driver` interface:
```go
type Driver interface {
    GetDB() *sql.DB
    Close() error

    IsInitialized(ctx context.Context) (bool, error)

    CreateMemo(ctx context.Context, create *Memo) (*Memo, error)
    ListMemos(ctx context.Context, find *FindMemo) ([]*Memo, error)
    UpdateMemo(ctx context.Context, update *UpdateMemo) error
    DeleteMemo(ctx context.Context, delete *DeleteMemo) error

    // ... similar methods for all resources
}
```

**Three Implementations:**
- `store/db/sqlite/` - SQLite (modernc.org/sqlite)
- `store/db/mysql/` - MySQL (go-sql-driver/mysql)
- `store/db/postgres/` - PostgreSQL (lib/pq)

**Caching Strategy:**
- Store wrapper maintains in-memory caches for:
  - Instance settings (`instanceSettingCache`)
  - Users (`userCache`)
  - User settings (`userSettingCache`)
- Config: Default TTL 10 min, cleanup interval 5 min, max 1000 items
- See: `store/store.go:10-57`

### 3. Frontend State Management

**React Query v5 (Server State):**
- All API calls go through custom hooks in `web/src/hooks/`
- Query keys organized by resource: `memoKeys`, `userKeys`, `attachmentKeys`
- Default staleTime: 30s, gcTime: 5min
- Automatic refetch on window focus, reconnect
- See: `web/src/lib/query-client.ts`

**React Context (Client State):**
- `AuthContext`: Current user, auth initialization, logout
- `ViewContext`: Layout mode (LIST/MASONRY), sort order
- `MemoFilterContext`: Active filters, shortcut selection, URL sync

### 4. Database Migration System

**Migration Flow:**
1. `preMigrate`: Check if DB exists. If not, apply `LATEST.sql`
2. `checkMinimumUpgradeVersion`: Reject pre-0.22 installations
3. `applyMigrations`: Apply incremental migrations in single transaction
4. Demo mode: Seed with demo data

**Schema Versioning:**
- Stored in `system_setting` table
- Format: `major.minor.patch`
- Migration files: `store/migration/{driver}/{version}/NN__description.sql`
- See: `store/migrator.go:21-414`

### 5. Protocol Buffer Code Generation

**Definition Location:** `proto/api/v1/*.proto`

**Regeneration:**
```bash
cd proto && buf generate
```

**Generated Outputs:**
- Go: `proto/gen/api/v1/` (used by backend services)
- TypeScript: `web/src/types/proto/api/v1/` (used by frontend)

**Linting:** `proto/buf.yaml` - BASIC lint rules, FILE breaking changes

## Development Commands

### Backend

```bash
# Start dev server
go run ./cmd/memos --port 8081

# Run all tests
go test ./...

# Run tests for specific package
go test ./store/...
go test ./server/router/api/v1/test/...

# Lint (golangci-lint)
golangci-lint run

# Format imports
goimports -w .

# Run with MySQL/Postgres
DRIVER=mysql go run ./cmd/memos
DRIVER=postgres go run ./cmd/memos
```

### Frontend

```bash
# Install dependencies
cd web && pnpm install

# Start dev server (proxies API to localhost:8081)
pnpm dev

# Type checking
pnpm lint

# Auto-fix lint issues
pnpm lint:fix

# Format code
pnpm format

# Build for production
pnpm build

# Build and copy to backend
pnpm release
```

### Protocol Buffers

```bash
# Regenerate Go and TypeScript from .proto files
cd proto && buf generate

# Lint proto files
cd proto && buf lint

# Check for breaking changes
cd proto && buf breaking --against .git#main
```

## Key Workflows

### Adding a New API Endpoint

1. **Define in Protocol Buffer:**
   - Edit `proto/api/v1/*_service.proto`
   - Add request/response messages
   - Add RPC method to service

2. **Regenerate Code:**
   ```bash
   cd proto && buf generate
   ```

3. **Implement Service (Backend):**
   - Add method to `server/router/api/v1/*_service.go`
   - Follow existing patterns: fetch user, validate, call store
   - Add Connect wrapper to `server/router/api/v1/connect_services.go` (optional, same implementation)

4. **If Public Endpoint:**
   - Add to `server/router/api/v1/acl_config.go:11-34`

5. **Create Frontend Hook (if needed):**
   - Add query/mutation to `web/src/hooks/use*Queries.ts`
   - Use existing query key factories

### Database Schema Changes

1. **Create Migration Files:**
   ```
   store/migration/sqlite/0.28/1__add_new_column.sql
   store/migration/mysql/0.28/1__add_new_column.sql
   store/migration/postgres/0.28/1__add_new_column.sql
   ```

2. **Update LATEST.sql:**
   - Add change to `store/migration/{driver}/LATEST.sql`

3. **Update Store Interface (if new table/model):**
   - Add methods to `store/driver.go:8-71`
   - Implement in `store/db/{driver}/*.go`

4. **Test Migration:**
   - Run `go test ./store/test/...` to verify

### Adding a New Frontend Page

1. **Create Page Component:**
   - Add to `web/src/pages/NewPage.tsx`
   - Use existing hooks for data fetching

2. **Add Route:**
   - Edit `web/src/App.tsx` (or router configuration)

3. **Use React Query:**
   ```typescript
   import { useMemos } from "@/hooks/useMemoQueries";
   const { data, isLoading } = useMemos({ filter: "..." });
   ```

4. **Use Context for Client State:**
   ```typescript
   import { useView } from "@/contexts/ViewContext";
   const { layout, toggleSortOrder } = useView();
   ```

## Testing

### Backend Tests

**Test Pattern:**
```go
func TestMemoCreation(t *testing.T) {
    ctx := context.Background()
    store := test.NewTestingStore(ctx, t)

    // Create test user
    user, _ := createTestUser(ctx, store, t)

    // Execute operation
    memo, err := store.CreateMemo(ctx, &store.Memo{
        CreatorID: user.ID,
        Content:  "Test memo",
        // ...
    })
    require.NoError(t, err)
    assert.NotNil(t, memo)
}
```

**Test Utilities:**
- `store/test/store.go:22-35` - `NewTestingStore()` creates isolated DB
- `store/test/store.go:37-77` - `resetTestingDB()` cleans tables
- Test DB determined by `DRIVER` env var (default: sqlite)

**Running Tests:**
```bash
# All tests
go test ./...

# Specific package
go test ./store/...
go test ./server/router/api/v1/test/...

# With coverage
go test -cover ./...
```

### Frontend Testing

**TypeScript Checking:**
```bash
cd web && pnpm lint
```

**No Automated Tests:**
- Frontend relies on TypeScript checking and manual validation
- React Query DevTools available in dev mode (bottom-left)

## Code Conventions

### Go

**Error Handling:**
- Use `github.com/pkg/errors` for wrapping: `errors.Wrap(err, "context")`
- Return structured gRPC errors: `status.Errorf(codes.NotFound, "message")`

**Naming:**
- Package names: lowercase, single word (e.g., `store`, `server`)
- Interfaces: `Driver`, `Store`, `Service`
- Methods: PascalCase for exported, camelCase for internal

**Comments:**
- Public exported functions must have comments (godot enforces)
- Use `//` for single-line, `/* */` for multi-line

**Imports:**
- Grouped: stdlib, third-party, local
- Sorted alphabetically within groups
- Use `goimports -w .` to format

### TypeScript/React

**Components:**
- Functional components with hooks
- Use `useMemo`, `useCallback` for optimization
- Props interfaces: `interface Props { ... }`

**State Management:**
- Server state: React Query hooks
- Client state: React Context
- Avoid direct useState for server data

**Styling:**
- Tailwind CSS v4 via `@tailwindcss/vite`
- Use `clsx` and `tailwind-merge` for conditional classes

**Imports:**
- Absolute imports with `@/` alias
- Group: React, third-party, local
- Auto-organized by Biome

## Important Files Reference

### Backend Entry Points

| File | Purpose |
|------|---------|
| `cmd/memos/main.go` | Server entry point, CLI setup |
| `server/server.go` | Echo server initialization, background runners |
| `store/store.go` | Store wrapper with caching |
| `store/driver.go` | Database driver interface |

### API Layer

| File | Purpose |
|------|---------|
| `server/router/api/v1/v1.go` | Service registration, gateway setup |
| `server/router/api/v1/acl_config.go` | Public endpoints whitelist |
| `server/router/api/v1/connect_interceptors.go` | Connect interceptors |
| `server/auth/authenticator.go` | Authentication logic |

### Frontend Core

| File | Purpose |
|------|---------|
| `web/src/lib/query-client.ts` | React Query client configuration |
| `web/src/contexts/AuthContext.tsx` | User authentication state |
| `web/src/contexts/ViewContext.tsx` | UI preferences |
| `web/src/contexts/MemoFilterContext.tsx` | Filter state |
| `web/src/hooks/useMemoQueries.ts` | Memo queries/mutations |

### Data Layer

| File | Purpose |
|------|---------|
| `store/memo.go` | Memo model definitions, store methods |
| `store/user.go` | User model definitions |
| `store/attachment.go` | Attachment model definitions |
| `store/migrator.go` | Migration logic |
| `store/db/db.go` | Driver factory |
| `store/db/sqlite/sqlite.go` | SQLite driver implementation |

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|----------|-------------|
| `MEMOS_DEMO` | `false` | Enable demo mode |
| `MEMOS_PORT` | `8081` | HTTP port |
| `MEMOS_ADDR` | `` | Bind address (empty = all) |
| `MEMOS_DATA` | `~/.memos` | Data directory |
| `MEMOS_DRIVER` | `sqlite` | Database: `sqlite`, `mysql`, `postgres` |
| `MEMOS_DSN` | `` | Database connection string |
| `MEMOS_INSTANCE_URL` | `` | Instance base URL |

### Frontend Environment Variables

| Variable | Default | Description |
|----------|----------|-------------|
| `DEV_PROXY_SERVER` | `http://localhost:8081` | Backend proxy target |

## CI/CD

### GitHub Workflows

**Backend Tests** (`.github/workflows/backend-tests.yml`):
- Runs on `go.mod`, `go.sum`, `**.go` changes
- Steps: verify `go mod tidy`, golangci-lint, all tests

**Frontend Tests** (`.github/workflows/frontend-tests.yml`):
- Runs on `web/**` changes
- Steps: pnpm install, lint, build

**Proto Lint** (`.github/workflows/proto-linter.yml`):
- Runs on `.proto` changes
- Steps: buf lint, buf breaking check

### Linting Configuration

**Go** (`.golangci.yaml`):
- Linters: revive, govet, staticcheck, misspell, gocritic, etc.
- Formatter: goimports
- Forbidden: `fmt.Errorf`, `ioutil.ReadDir`

**TypeScript** (`web/biome.json`):
- Linting: Biome (ESLint replacement)
- Formatting: Biome (Prettier replacement)
- Line width: 140 characters
- Semicolons: always

## Common Tasks

### Debugging API Issues

1. Check Connect interceptor logs: `server/router/api/v1/connect_interceptors.go:79-105`
2. Verify endpoint is in `acl_config.go` if public
3. Check authentication via `auth/authenticator.go:133-165`
4. Test with curl: `curl -H "Authorization: Bearer <token>" http://localhost:8081/api/v1/...`

### Debugging Frontend State

1. Open React Query DevTools (bottom-left in dev)
2. Inspect query cache, mutations, refetch behavior
3. Check Context state via React DevTools
4. Verify filter state in MemoFilterContext

### Running Tests Against Multiple Databases

```bash
# SQLite (default)
DRIVER=sqlite go test ./...

# MySQL (requires running MySQL server)
DRIVER=mysql DSN="user:pass@tcp(localhost:3306)/memos" go test ./...

# PostgreSQL (requires running PostgreSQL server)
DRIVER=postgres DSN="postgres://user:pass@localhost:5432/memos" go test ./...
```

## Plugin System

Backend supports pluggable components in `plugin/`:

| Plugin | Purpose |
|--------|----------|
| `scheduler` | Cron-based job scheduling |
| `email` | SMTP email delivery |
| `filter` | CEL expression filtering |
| `webhook` | HTTP webhook dispatch |
| `markdown` | Markdown parsing (goldmark) |
| `httpgetter` | HTTP content fetching |
| `storage/s3` | S3-compatible storage |

Each plugin has its own README with usage examples.

## Performance Considerations

### Backend

- Database queries use pagination (`limit`, `offset`)
- In-memory caching reduces DB hits for frequently accessed data
- WAL journal mode for SQLite (reduces locking)
- Thumbnail generation limited to 3 concurrent operations

### Frontend

- React Query reduces redundant API calls
- Infinite queries for large lists (pagination)
- Manual chunks: `utils-vendor`, `mermaid-vendor`, `leaflet-vendor`
- Lazy loading for heavy components

## Security Notes

- JWT secrets must be kept secret (generated on first run in production mode)
- Personal Access Tokens stored as SHA-256 hashes in database
- CSRF protection via SameSite cookies
- CORS enabled for all origins (configure for production)
- Input validation at service layer
- SQL injection prevention via parameterized queries
