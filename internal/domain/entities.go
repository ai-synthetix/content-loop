package domain

import "time"
// Status is the editorial workflow state of a content_item.
// See architecture.md: idea → brief_ready → drafting → review_ready → approved/rejected/changes_requested → scheduled → publishing → published/partially_published/failed → measuring → reflected
type Status string

const (
	StatusIdea              Status = "idea"
	StatusBriefReady        Status = "brief_ready"
	StatusDrafting          Status = "drafting"
	StatusReviewReady       Status = "review_ready"
	StatusApproved          Status = "approved"
	StatusRejected          Status = "rejected"
	StatusChangesRequested  Status = "changes_requested"
	StatusScheduled         Status = "scheduled"
	StatusPublishing        Status = "publishing"
	StatusPublished         Status = "published"
	StatusPartiallyPublished Status = "partially_published"
	StatusFailed            Status = "failed"
	StatusMeasuring         Status = "measuring"
	StatusReflected         Status = "reflected"
)

// User is the owner identity (Google OAuth).
type User struct {
	ID        string    `db:"id" json:"id"`
	Email     string    `db:"email" json:"email"`
	GoogleSub string    `db:"google_sub" json:"google_sub"`
	Name      *string   `db:"name" json:"name"`
	AvatarURL *string   `db:"avatar_url" json:"avatar_url"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// Project owns editorial policy.
type Project struct {
	ID          string    `db:"id" json:"id"`
	OwnerUserID *string   `db:"owner_user_id" json:"owner_user_id"`
	Name        string    `db:"name" json:"name"`
	Slug        string    `db:"slug" json:"slug"`
	Channels    JSON      `db:"channels" json:"channels"`   // JSON array
	Languages   JSON      `db:"languages" json:"languages"` // JSON array
	Policy      JSON      `db:"policy" json:"policy"`       // JSON object
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at" json:"updated_at"`
}

// ContentItem is the canonical editorial intent.
type ContentItem struct {
	ID          string     `db:"id" json:"id"`
	OwnerUserID *string    `db:"owner_user_id" json:"owner_user_id"`
	ProjectID   string     `db:"project_id" json:"project_id"`
	Title       string     `db:"title" json:"title"`
	Slug        string     `db:"slug" json:"slug"`
	Status      Status     `db:"status" json:"status"`
	Brief       JSON       `db:"brief" json:"brief"` // JSON
	Locale      string     `db:"locale" json:"locale"`
	ScheduledAt *time.Time `db:"scheduled_at" json:"scheduled_at"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updated_at"`
}

// ContentVersion is immutable.
type ContentVersion struct {
	ID            string    `db:"id" json:"id"`
	OwnerUserID   *string   `db:"owner_user_id" json:"owner_user_id"`
	ContentItemID string    `db:"content_item_id" json:"content_item_id"`
	VersionNo     int       `db:"version_no" json:"version_no"`
	Title        string    `db:"title" json:"title"`
	Excerpt      *string   `db:"excerpt" json:"excerpt"`
	BodyMarkdown string    `db:"body_markdown" json:"body_markdown"`
	Claims       JSON      `db:"claims" json:"claims"`   // JSON array
	Sources      JSON      `db:"sources" json:"sources"` // JSON array of source IDs/URLs
	Prompt       *string   `db:"prompt" json:"prompt"`
	Model        *string   `db:"model" json:"model"`
	ModelVersion *string   `db:"model_version" json:"model_version"`
	IsApproved   bool      `db:"is_approved" json:"is_approved"`
	CreatedAt    time.Time `db:"created_at" json:"created_at"`
}

// ChannelVariant is a rendering of a ContentVersion for a specific channel.
type ChannelVariant struct {
	ID               string    `db:"id" json:"id"`
	OwnerUserID      *string   `db:"owner_user_id" json:"owner_user_id"`
	ContentItemID    string    `db:"content_item_id" json:"content_item_id"`
	ContentVersionID string    `db:"content_version_id" json:"content_version_id"`
	Channel          string    `db:"channel" json:"channel"`
	Payload          JSON      `db:"payload" json:"payload"` // JSON
	RenderedBody     *string   `db:"rendered_body" json:"rendered_body"`
	CreatedAt        time.Time `db:"created_at" json:"created_at"`
}

// Approval records a human decision.
type Approval struct {
	ID            string    `db:"id" json:"id"`
	OwnerUserID   *string   `db:"owner_user_id" json:"owner_user_id"`
	ContentItemID string    `db:"content_item_id" json:"content_item_id"`
	VersionID     *string   `db:"version_id" json:"version_id"`
	Decision      string    `db:"decision" json:"decision"` // approve | edit | reject | changes_requested
	Comment       *string   `db:"comment" json:"comment"`
	Diff          JSON      `db:"diff" json:"diff"` // JSON
	Actor         string    `db:"actor" json:"actor"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
}

// Publication tracks delivery to a channel.
type Publication struct {
	ID               string     `db:"id" json:"id"`
	OwnerUserID      *string    `db:"owner_user_id" json:"owner_user_id"`
	ContentItemID    string     `db:"content_item_id" json:"content_item_id"`
	ChannelVariantID string     `db:"channel_variant_id" json:"channel_variant_id"`
	Adapter          string     `db:"adapter" json:"adapter"`
	ExternalID       *string    `db:"external_id" json:"external_id"`
	URL              *string    `db:"url" json:"url"`
	Status           string     `db:"status" json:"status"` // pending|publishing|published|failed|unpublished
	IdempotencyKey   string     `db:"idempotency_key" json:"idempotency_key"`
	Error            *string    `db:"error" json:"error"`
	PublishedAt      *time.Time `db:"published_at" json:"published_at"`
	CreatedAt        time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time  `db:"updated_at" json:"updated_at"`
}

// MetricSnapshot stores observed metrics at a point in time.
type MetricSnapshot struct {
	ID            string    `db:"id" json:"id"`
	OwnerUserID   *string   `db:"owner_user_id" json:"owner_user_id"`
	PublicationID string    `db:"publication_id" json:"publication_id"`
	Metrics       JSON      `db:"metrics" json:"metrics"` // JSON
	CapturedAt    time.Time `db:"captured_at" json:"captured_at"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
}

// Reflection holds structured post-publish learnings.
type Reflection struct {
	ID            string    `db:"id" json:"id"`
	OwnerUserID   *string   `db:"owner_user_id" json:"owner_user_id"`
	ContentItemID string    `db:"content_item_id" json:"content_item_id"`
	Observation   string    `db:"observation" json:"observation"`
	Confidence    string    `db:"confidence" json:"confidence"` // low|medium|high
	PossibleCauses JSON     `db:"possible_causes" json:"possible_causes"`
	NextTest      *string   `db:"next_test" json:"next_test"`
	DoNotConclude *string   `db:"do_not_conclude" json:"do_not_conclude"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
}

// Source is an evidence URL/document.
type Source struct {
	ID          string     `db:"id" json:"id"`
	OwnerUserID *string    `db:"owner_user_id" json:"owner_user_id"`
	URL         string     `db:"url" json:"url"`
	Title      *string    `db:"title" json:"title"`
	CheckedAt  *time.Time `db:"checked_at" json:"checked_at"`
	ClaimsJSON JSON       `db:"claims_json" json:"claims_json"` // JSON
	CreatedAt  time.Time  `db:"created_at" json:"created_at"`
}

// AuditEvent is the append-only log.
type AuditEvent struct {
	ID            string    `db:"id" json:"id"`
	OwnerUserID   *string   `db:"owner_user_id" json:"owner_user_id"`
	ContentItemID *string   `db:"content_item_id" json:"content_item_id"`
	Actor         string    `db:"actor" json:"actor"`
	Action        string    `db:"action" json:"action"`
	Payload       JSON      `db:"payload" json:"payload"` // JSON
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
}

// GenerationJob tracks async generation progress.
type GenerationJob struct {
	ID            string    `db:"id" json:"id"`
	ContentItemID string    `db:"content_item_id" json:"content_item_id"`
	OwnerUserID   string    `db:"owner_user_id" json:"owner_user_id"`
	Status        string    `db:"status" json:"status"`
	Step          string    `db:"step" json:"step"`
	Progress      int       `db:"progress" json:"progress"`
	Error         *string   `db:"error" json:"error"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
	UpdatedAt     time.Time `db:"updated_at" json:"updated_at"`
}

// JSON is a raw JSON column helper. Stored as []byte in MySQL JSON columns.
type JSON []byte
