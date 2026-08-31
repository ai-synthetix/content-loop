package domain

import "fmt"

// ValidTransitions defines allowed status edges.
var ValidTransitions = map[Status][]Status{
	StatusIdea:               {StatusBriefReady},
	StatusBriefReady:         {StatusDrafting},
	StatusDrafting:           {StatusReviewReady},
	StatusReviewReady:        {StatusApproved, StatusRejected, StatusChangesRequested},
	StatusApproved:           {StatusScheduled, StatusPublishing},
	StatusChangesRequested:   {StatusDrafting, StatusReviewReady},
	StatusRejected:           {StatusIdea, StatusDrafting},
	StatusScheduled:          {StatusPublishing},
	StatusPublishing:         {StatusPublished, StatusPartiallyPublished, StatusFailed},
	StatusPublished:          {StatusMeasuring},
	StatusPartiallyPublished: {StatusPublishing, StatusMeasuring, StatusFailed},
	StatusFailed:             {StatusPublishing, StatusScheduled},
	StatusMeasuring:          {StatusReflected},
	StatusReflected:          {},
}

// CanTransition reports whether from→to is allowed.
func CanTransition(from, to Status) bool {
	for _, n := range ValidTransitions[from] {
		if n == to {
			return true
		}
	}
	return false
}

// Transition validates and returns the next status or an error.
func Transition(from, to Status) error {
	if CanTransition(from, to) {
		return nil
	}
	return fmt.Errorf("invalid transition %s -> %s", from, to)
}
